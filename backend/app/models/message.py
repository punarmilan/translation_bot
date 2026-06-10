from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MessageDocument(BaseModel):
    id: Optional[str] = None
    room_id: str
    sender_id: Optional[str] = None
    sender_name: str
    recipient_id: Optional[str] = None
    original_text: str
    translations: dict[str, str] = Field(default_factory=dict)
    source_language: str = "unknown"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    delivery_mode: str = "broadcast"
