"""Backend tests. They run with no AWS or ElevenLabs account: Bedrock is switched off, so the
local fallback answers, and storage is in memory."""

import os

os.environ["DPB_USE_BEDROCK"] = "off"
os.environ.pop("ELEVENLABS_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def analyse(kind, text, element_type="button"):
    res = client.post("/analyse", json={"kind": kind, "text": text, "element_type": element_type})
    assert res.status_code == 200, res.text
    return res.json()


def test_health():
    body = client.get("/health").json()
    assert body["ok"] and body["ai"] == "local-fallback" and body["storage"] == "memory"


def test_guilt_trip_decline_is_confirm_shaming():
    r = analyse("confirm_shaming", "No, I don't care if my trip goes wrong")
    assert r["pattern"] == "confirm_shaming" and r["confidence"] == "high" and r["engine"] == "local-fallback"


def test_neutral_decline_is_fine():
    assert analyse("confirm_shaming", "No thanks")["pattern"] == "none"


def test_double_negative_checkbox_means_ticked_is_opt_out():
    r = analyse("trick_question", "Uncheck this box if you do not want to not receive offers", "checkbox")
    assert r["pattern"] == "trick_question"
    assert r["checked_means"] == "opt_out"  # "uncheck it if you WANT offers", so a ticked box means no offers


def test_single_negative_checkbox():
    r = analyse("trick_question", "Tick this box if you do not want to receive offers", "checkbox")
    assert r["checked_means"] == "opt_out"


def test_ledger_summary_builds_site_profile_and_late_fees():
    summary = {
        "session": "s1", "site": "flycheapo.test", "advertised": 4999, "max_total": 5846, "saved": 648,
        "lines": [{"item": "Convenience fee", "amount": 199, "step": "Payment", "origin": "unknown", "outcome": "kept"}],
        "findings": [
            {"pattern": "basket_sneaking", "cost": 349, "confidence": "high", "item": "Seat 12A (Window)"},
            {"pattern": "basket_sneaking", "cost": 299, "confidence": "high", "item": "Travel insurance"},
            {"pattern": "drip_pricing", "cost": 199, "confidence": "high", "item": "Convenience fee"},
        ],
        "late_fees": [{"label": "Convenience fee", "amount": 199}],
    }
    profile = client.post("/ledger-summary", json=summary).json()
    assert profile["checkouts"] == 1
    assert profile["late_fees"] == [{"label": "Convenience fee", "amount": 199}]
    assert {f["amount"] for f in profile["sneaked_extras"]} == {349, 299}
    assert profile["average_extra"] == 847
    assert profile["fairness_score"] == 55
    assert client.get("/site-info", params={"site": "flycheapo.test"}).json()["checkouts"] == 1


def test_site_info_rejects_non_domains():
    assert client.get("/site-info", params={"site": "https://evil.example/path"}).status_code == 400


def test_speak_without_key_returns_503():
    assert client.post("/speak", json={"text": "hello", "lang": "en"}).status_code == 503
