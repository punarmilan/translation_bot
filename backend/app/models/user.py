from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserDocument(BaseModel):
    id: Optional[str] = None
    username: str
    email: str
    password_hash: str
    role: str = "participant"  # admin | host | participant
    preferred_language: str = "en"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen: Optional[datetime] = None
    is_online: bool = False
