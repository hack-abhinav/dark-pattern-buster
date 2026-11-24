"""Dark Pattern Buster backend: FastAPI, deployed on AWS Lambda behind Amazon API Gateway.

Operations (see docs/03-architecture.md):
  POST /analyse         AI check of one uncertain element (Amazon Bedrock, local fallback)
  GET  /site-info       a site's Fairness Score and the fees it usually adds late
  POST /speak           spoken alert (ElevenLabs), MP3
  POST /ledger-summary  anonymised summary of a finished checkout → updated Fairness Score
  POST /evidence        cropped screenshot → private S3 link

Run locally:  uvicorn app.main:app --port 8000
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analysis, store, voice

app = FastAPI(title="Dark Pattern Buster API", version="0.1.0")

# The extension calls from its background worker; the in-page preview calls from the demo site.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["content-type"])

SITE_RE = re.compile(r"^[a-z0-9.-]+(:\d+)?$", re.I)


class AnalyseRequest(BaseModel):
    kind: Literal["confirm_shaming", "trick_question"]
    text: str = Field(min_length=1, max_length=400)
    element_type: str = Field(default="", max_length=20)
    step: Optional[str] = Field(default=None, max_length=40)
    site: Optional[str] = Field(default=None, max_length=120)


class AnalyseResponse(BaseModel):
    pattern: str
    confidence: Literal["high", "medium", "low"]
    explanation: str
    checked_means: Optional[Literal["opt_in", "opt_out"]] = None
    engine: Literal["bedrock", "local-fallback"]


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    lang: Literal["en", "hi"] = "en"


class Line(BaseModel):
    item: Optional[str] = Field(default=None, max_length=120)
    amount: Optional[float] = None
    step: Optional[str] = Field(default=None, max_length=40)
    origin: Optional[str] = Field(default=None, max_length=20)
    outcome: Optional[str] = Field(default=None, max_length=20)


class Finding(BaseModel):
    pattern: str = Field(max_length=40)
    cost: float = 0
    confidence: Literal["high", "medium"] = "high"
    item: Optional[str] = Field(default=None, max_length=120)


class Fee(BaseModel):
    label: str = Field(max_length=120)
    amount: float


class LedgerSummary(BaseModel):
    session: str = Field(max_length=64)
    site: str = Field(max_length=120)
    advertised: Optional[float] = None
    max_total: Optional[float] = None
    saved: float = 0
    lines: List[Line] = Field(default_factory=list, max_length=50)
    findings: List[Finding] = Field(default_factory=list, max_length=50)
    late_fees: List[Fee] = Field(default_factory=list, max_length=20)


class EvidenceRequest(BaseModel):
    session: str = Field(max_length=64)
    image_base64: str = Field(max_length=3_000_000)


@app.get("/health")
def health():
    return {"ok": True, "ai": "bedrock" if analysis.bedrock_enabled() else "local-fallback", "voice": voice.enabled(), "storage": store.backend_name()}


@app.post("/analyse", response_model=AnalyseResponse)
def analyse(req: AnalyseRequest):
    return analysis.analyse(req.kind, req.text.strip(), req.element_type, req.step)


@app.get("/site-info")
def site_info(site: str = Query(max_length=120)):
    if not SITE_RE.match(site):
        raise HTTPException(400, "site must be a domain name")
    return store.get_profile(site.lower())


@app.post("/speak")
def speak(req: SpeakRequest):
    if not voice.enabled():
        raise HTTPException(503, "Voice is not set up: add ELEVENLABS_API_KEY on the server.")
    try:
        audio = voice.speak(req.text, req.lang)
    except Exception as exc:
        raise HTTPException(502, f"ElevenLabs request failed: {exc}") from exc
    return Response(content=audio, media_type="audio/mpeg")


@app.post("/ledger-summary")
def ledger_summary(summary: LedgerSummary):
    if not SITE_RE.match(summary.site):
        raise HTTPException(400, "site must be a domain name")
    data = summary.model_dump()
    data["site"] = data["site"].lower()
    return store.apply_summary(data)


@app.post("/evidence")
def evidence(req: EvidenceRequest):
    url = store.save_evidence(req.session, req.image_base64)
    if not url:
        raise HTTPException(503, "Evidence storage is not set up: set EVIDENCE_BUCKET on the server.")
    return {"url": url}
