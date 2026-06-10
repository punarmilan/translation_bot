from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TranslationLogDocument(BaseModel):
    id: Optional[str] = None
    room_id: str
    source_language: str
    target_language: str
    translation_success: bool
    cache_hit: bool = False
    timestamp: datetime = Field(default_factory=datetime.utcnow)
