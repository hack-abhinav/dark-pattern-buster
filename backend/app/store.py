"""Price Ledger summaries, site profiles and evidence.

On AWS: site profiles and ledger lines go to DynamoDB, evidence screenshots to a private S3 bucket
that deletes them after 30 days. Locally (no AWS settings): an in-memory store, so the demo runs
on a laptop with no cloud account.

Everything stored is anonymised: a random session ID, the site's domain, price lines and findings.
No names, booking IDs, or payment details ever reach the backend.
"""

from __future__ import annotations

import base64
import os
import time
import uuid
from decimal import Decimal
from typing import Dict, List, Optional

SITE_TABLE = os.environ.get("SITE_TABLE")
LEDGER_TABLE = os.environ.get("LEDGER_TABLE")
EVIDENCE_BUCKET = os.environ.get("EVIDENCE_BUCKET")

_memory_sites: Dict[str, dict] = {}
_memory_ledger: List[dict] = []


def backend_name() -> str:
    return "dynamodb" if SITE_TABLE else "memory"


def _table(name: str):
    import boto3

    return boto3.resource("dynamodb").Table(name)


def _from_dynamo(value):
    if isinstance(value, list):
        return [_from_dynamo(v) for v in value]
    if isinstance(value, dict):
        return {k: _from_dynamo(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    return value


def _to_dynamo(value):
    if isinstance(value, list):
        return [_to_dynamo(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_dynamo(v) for k, v in value.items() if v is not None}
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def empty_profile(site: str) -> dict:
    return {"site": site, "checkouts": 0, "tricks_seen": {}, "average_extra": 0, "late_fees": [], "sneaked_extras": [], "fairness_score": None, "updated": None}


def fairness_score(findings: List[dict]) -> int:
    """Out of 100: fewer and cheaper tricks give a higher score (same formula as the extension)."""
    score = 100
    for f in findings:
        if f.get("confidence") == "high":
            score -= 15 if (f.get("cost") or 0) > 0 else 10
        else:
            score -= 4
    return max(5, min(100, round(score)))


def get_profile(site: str) -> dict:
    if SITE_TABLE:
        item = _table(SITE_TABLE).get_item(Key={"site": site}).get("Item")
        return _from_dynamo(item) if item else empty_profile(site)
    return dict(_memory_sites.get(site) or empty_profile(site))


def _save_profile(profile: dict) -> None:
    if SITE_TABLE:
        _table(SITE_TABLE).put_item(Item=_to_dynamo(profile))
    else:
        _memory_sites[profile["site"]] = profile


def apply_summary(summary: dict) -> dict:
    """Fold one finished checkout into the site's profile and return the updated profile."""
    site = summary["site"]
    findings = summary.get("findings") or []
    profile = get_profile(site)
    n = profile["checkouts"]

    tricks = dict(profile.get("tricks_seen") or {})
    for f in findings:
        tricks[f["pattern"]] = tricks.get(f["pattern"], 0) + 1

    extra = sum((f.get("cost") or 0) for f in findings if f.get("confidence") == "high" and f["pattern"] in ("basket_sneaking", "drip_pricing"))
    score = fairness_score(findings)

    late = {fee["label"].lower(): fee for fee in (profile.get("late_fees") or [])}
    for fee in summary.get("late_fees") or []:
        late[fee["label"].lower()] = {"label": fee["label"], "amount": fee["amount"]}

    # Paid extras the site pre-selected, so the extension can warn on the listing page next time.
    sneaked = {fee["label"].lower(): fee for fee in (profile.get("sneaked_extras") or [])}
    for f in findings:
        if f["pattern"] == "basket_sneaking" and f.get("item") and (f.get("cost") or 0) > 0:
            sneaked[f["item"].lower()] = {"label": f["item"], "amount": f["cost"]}

    profile.update({
        "checkouts": n + 1,
        "tricks_seen": tricks,
        "average_extra": round(((profile.get("average_extra") or 0) * n + extra) / (n + 1)),
        "late_fees": list(late.values()),
        "sneaked_extras": list(sneaked.values()),
        "fairness_score": score if profile.get("fairness_score") is None else round((profile["fairness_score"] * n + score) / (n + 1)),
        "updated": int(time.time()),
    })
    _save_profile(profile)
    _save_lines(summary)
    return profile


def _save_lines(summary: dict) -> None:
    now = int(time.time())
    lines = [
        {"session": summary["session"], "line": f"{i:03d}", "site": summary["site"], "item": line.get("item"),
         "amount": line.get("amount"), "step": line.get("step"), "how_it_got_there": line.get("origin"),
         "outcome": line.get("outcome"), "seen_at": now}
        for i, line in enumerate(summary.get("lines") or [])
    ]
    if LEDGER_TABLE:
        table = _table(LEDGER_TABLE)
        with table.batch_writer() as batch:
            for line in lines:
                batch.put_item(Item=_to_dynamo(line))
    else:
        _memory_ledger.extend(lines)


def save_evidence(session: str, image_base64: str) -> Optional[str]:
    """Store a cropped screenshot in the private evidence bucket; return a link valid for 7 days."""
    if not EVIDENCE_BUCKET:
        return None
    import boto3

    s3 = boto3.client("s3")
    key = f"evidence/{session}/{uuid.uuid4().hex}.png"
    s3.put_object(Bucket=EVIDENCE_BUCKET, Key=key, Body=base64.b64decode(image_base64), ContentType="image/png")
    return s3.generate_presigned_url("get_object", Params={"Bucket": EVIDENCE_BUCKET, "Key": key}, ExpiresIn=7 * 24 * 3600)
