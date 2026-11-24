"""Spoken alerts with ElevenLabs text-to-speech, in English and Hindi.

The API key stays on the server (an environment variable on AWS Lambda), never in the extension.
Without a key the endpoint returns 503 and the extension uses the browser's own voice instead.
"""

from __future__ import annotations

import os
from typing import Optional

import httpx

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
# "eleven_multilingual_v2" speaks both English and Hindi.
MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
# ElevenLabs' premade "Rachel" voice; set your own picks per language with the env vars below.
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"


def enabled() -> bool:
    return bool(os.environ.get("ELEVENLABS_API_KEY"))


def voice_for(lang: str) -> str:
    if lang == "hi":
        return os.environ.get("ELEVENLABS_VOICE_ID_HI") or os.environ.get("ELEVENLABS_VOICE_ID_EN") or DEFAULT_VOICE
    return os.environ.get("ELEVENLABS_VOICE_ID_EN") or DEFAULT_VOICE


def speak(text: str, lang: str = "en") -> Optional[bytes]:
    """Return MP3 audio for the text, or None if voice isn't set up."""
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return None
    response = httpx.post(
        ELEVENLABS_URL.format(voice_id=voice_for(lang)),
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": key, "accept": "audio/mpeg"},
        json={"text": text[:600], "model_id": MODEL_ID},
        timeout=20,
    )
    response.raise_for_status()
    return response.content
