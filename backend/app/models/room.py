from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RoomDocument(BaseModel):
    id: Optional[str] = None
    room_id: str
    room_name: str
    host_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
