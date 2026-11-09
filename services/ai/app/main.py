from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Literal

app = FastAPI(
    title="MediConnect AI Service",
    version="0.1.0",
    description="Non-clinical language and workflow service boundary. No diagnosis or treatment."
)

class LanguageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    source_locale: Literal["en", "hi"]
    target_locale: Literal["en", "hi"]

@app.get("/health")
def health():
    return {"status": "ok", "service": "mediconnect-ai", "clinical_decision_support": False}

@app.post("/v1/language/preview")
def language_preview(payload: LanguageRequest):
    # Deliberately does not call an external model or translate medical advice.
    # Translation provider integration requires vendor/privacy review and clinical-language validation.
    return {
        "accepted": False,
        "status": "provider_not_configured",
        "message": "Translation is not enabled in this foundation build.",
        "source_locale": payload.source_locale,
        "target_locale": payload.target_locale
    }
