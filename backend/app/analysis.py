"""AI checks for subtle dark patterns: guilt-trip wording and double-negative checkboxes.

The extension sends only the short text of one suspicious element. This module asks Claude on
Amazon Bedrock which CCPA dark pattern (if any) it is. When Bedrock isn't configured or fails, a
small local heuristic answers instead, and the response says so (engine = "local-fallback").
"""

from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from typing import Optional

log = logging.getLogger(__name__)

# The 13 dark patterns in the CCPA's Guidelines for Prevention and Regulation of Dark Patterns, 2023.
PATTERNS = {
    "false_urgency": "False urgency: fake timers or fake scarcity to rush a decision",
    "basket_sneaking": "Basket sneaking: extras added to the order without the user's consent",
    "confirm_shaming": "Confirm shaming: guilt, fear or ridicule on the option to decline",
    "forced_action": "Forced action: must buy, sign up or share data to continue",
    "subscription_trap": "Subscription trap: easy to start, hard to cancel",
    "interface_interference": "Interface interference: the option the user wants is hidden or tiny",
    "bait_and_switch": "Bait and switch: shown one thing, served another",
    "drip_pricing": "Drip pricing: parts of the price revealed only at later steps",
    "disguised_advertisement": "Disguised advertisement: ads posing as results or advice",
    "nagging": "Nagging: the same request again and again after a no",
    "trick_question": "Trick question: confusing wording or double negatives",
    "saas_billing": "SaaS billing: quiet recurring charges",
    "rogue_malware": "Rogue malware: fake alerts or malicious downloads",
}

DEFAULT_MODEL = "anthropic.claude-opus-5-5"

SYSTEM_PROMPT = (
    "You check one element from an online checkout page for dark patterns, as defined in India's "
    "CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023. The patterns are:\n"
    + "\n".join(f"- {key}: {desc}" for key, desc in PATTERNS.items())
    + "\n\nYou get the element's visible text and what kind of element it is. Decide which pattern it is, "
    "or \"none\" if the wording is fair. Neutral text such as \"No thanks\" or \"Skip\" is \"none\". "
    "For a checkbox, also work out what ticking it really does with marketing or add-ons: \"opt_in\" "
    "(ticked means the shopper gets offers or the add-on) or \"opt_out\" (ticked means they don't). "
    "Read double negatives carefully: \"do not want to not receive\" means \"want to receive\".\n\n"
    "Reply with one JSON object and nothing else:\n"
    '{"pattern": "<pattern key or none>", "confidence": "high" | "medium" | "low", '
    '"explanation": "<one plain sentence for a shopper, at most 25 words>", '
    '"checked_means": "opt_in" | "opt_out" | null}'
)


# ---------------------------------------------------------------------------
# Local fallback heuristics (used when Bedrock is not available)
# ---------------------------------------------------------------------------

DECLINE_START = re.compile(
    r"^\s*(no|nah|nope|i don'?t|i do not|i'?d rather|i'?ll (risk|pass|take)|i (prefer|like) (paying|to pay)|continue without)\b",
    re.I,
)
NEUTRAL = re.compile(r"^\s*(no,?\s*thanks?|no thank you|not now|decline|cancel|skip( add-?ons| this)?)\s*\.?$", re.I)
SHAME_WORDS = re.compile(
    r"\b(care|risk|regret|sorry|safety|safe|protect\w*|family|unprotected|wrong|stupid|miss out|"
    r"hate|don'?t like|full price|paying more|lose|losing|danger|chances|alone)\b",
    re.I,
)
NEGATION = re.compile(r"\b(not|don'?t|never|no)\b", re.I)
WANT_VERB = re.compile(r"\b(receive|get|hear|subscribe|send|sign me up|want offers)\b", re.I)
NEGATIVE_VERB = re.compile(r"\b(unsubscribe|opt[- ]?out|stop|avoid)\b", re.I)


def _local_confirm_shaming(text: str) -> dict:
    if DECLINE_START.search(text) and not NEUTRAL.search(text) and SHAME_WORDS.search(text):
        return {
            "pattern": "confirm_shaming",
            "confidence": "high",
            "explanation": "The option to say no is worded to make you feel guilty or afraid. Declining is fine.",
            "checked_means": None,
        }
    return {"pattern": "none", "confidence": "medium", "explanation": "The decline wording looks neutral.", "checked_means": None}


def _local_trick_question(text: str) -> dict:
    """Work out what ticking a double-negative checkbox means by counting negatives."""
    lower = text.lower()
    action_uncheck = bool(re.match(r"\s*(un-?check|un-?tick|deselect|clear)\b", lower))
    # The condition part: "... if you <condition>"
    condition = lower.split(" if ", 1)[1] if " if " in lower else lower
    negations = len(NEGATION.findall(condition))
    wants_offers = (negations % 2 == 0) != bool(NEGATIVE_VERB.search(condition))
    if not WANT_VERB.search(condition) and not NEGATIVE_VERB.search(condition):
        return {"pattern": "trick_question", "confidence": "medium",
                "explanation": "This checkbox is worded confusingly.", "checked_means": None}
    # "Uncheck if you want offers" → unchecked = offers → ticked = opt out.
    if action_uncheck:
        checked_means = "opt_out" if wants_offers else "opt_in"
    else:
        checked_means = "opt_in" if wants_offers else "opt_out"
    total_negatives = negations + (1 if action_uncheck else 0)
    confidence = "high" if total_negatives >= 2 else "medium"
    meaning = "you get offers" if checked_means == "opt_in" else "you don't get offers"
    return {
        "pattern": "trick_question",
        "confidence": confidence,
        "explanation": f"The double negative hides what it does: a ticked box means {meaning}.",
        "checked_means": checked_means,
    }


def local_analyse(kind: str, text: str) -> dict:
    if kind == "trick_question":
        result = _local_trick_question(text)
    else:
        result = _local_confirm_shaming(text)
    result["engine"] = "local-fallback"
    return result


# ---------------------------------------------------------------------------
# Claude on Amazon Bedrock
# ---------------------------------------------------------------------------


def bedrock_enabled() -> bool:
    if os.environ.get("DPB_USE_BEDROCK", "auto").lower() in ("0", "false", "no", "off"):
        return False
    try:
        import boto3  # noqa: F401  (only used to check for AWS credentials)

        return boto3.Session().get_credentials() is not None and _client() is not None
    except Exception:  # boto3 missing or no credentials
        return False


@lru_cache(maxsize=1)
def _client():
    try:
        from anthropic import AnthropicBedrockMantle
    except ImportError:
        log.warning("This anthropic SDK has no AnthropicBedrockMantle client; using the local fallback.")
        return None
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
    return AnthropicBedrockMantle(aws_region=region)


def _parse_json(text: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _bedrock_analyse(kind: str, text: str, element_type: str, step: Optional[str]) -> Optional[dict]:
    client = _client()
    if client is None:
        return None
    user = json.dumps({"element_type": element_type, "checkout_step": step, "suspected": kind, "text": text})
    response = client.messages.create(
        model=os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL),
        max_tokens=2000,
        output_config={"effort": "low"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
    )
    if response.stop_reason == "refusal":
        return None
    reply = "".join(block.text for block in response.content if block.type == "text")
    data = _parse_json(reply)
    if not data:
        return None
    pattern = data.get("pattern")
    if pattern != "none" and pattern not in PATTERNS:
        return None
    return {
        "pattern": pattern,
        "confidence": data.get("confidence") if data.get("confidence") in ("high", "medium", "low") else "medium",
        "explanation": str(data.get("explanation") or "")[:240],
        "checked_means": data.get("checked_means") if data.get("checked_means") in ("opt_in", "opt_out") else None,
        "engine": "bedrock",
    }


@lru_cache(maxsize=512)
def analyse(kind: str, text: str, element_type: str = "", step: Optional[str] = None) -> dict:
    """Classify one element. Cached, because the same wording shows up on every visit."""
    if bedrock_enabled():
        try:
            result = _bedrock_analyse(kind, text, element_type, step)
            if result:
                return result
        except Exception as exc:  # network, throttling, model access not granted, ...
            log.warning("Bedrock check failed, using the local fallback: %s", exc)
    return local_analyse(kind, text)
