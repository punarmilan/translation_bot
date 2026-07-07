from datetime import datetime
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.control_plane import control_plane
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.meeting_repository import AdminMeetingRepository
from app.security import require_permission

router = APIRouter(prefix="/api/admin/meetings", tags=["meetings"])


class KickRequest(BaseModel):
    participant_id: str


class MeetingCommandRequest(BaseModel):
    command_type: str
    target_session_id: str | None = None
    target_user_id: str | None = None
    message: str | None = None
    payload: dict | None = None


ROOM_COMMANDS = {
    "END_MEETING",
    "LOCK_MEETING",
    "UNLOCK_MEETING",
    "MUTE_ALL",
    "DISABLE_CHAT",
    "ENABLE_CHAT",
    "DISABLE_TRANSLATION",
    "ENABLE_TRANSLATION",
    "FORCE_RECONNECT",
    "SEND_SYSTEM_NOTIFICATION",
}

PARTICIPANT_COMMANDS = {
    "KICK_PARTICIPANT",
    "MUTE_PARTICIPANT",
    "UNMUTE_PARTICIPANT",
}


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_value(item) for item in value]
    return value


def serialize(room: dict) -> dict:
    created = room.get("created_at")
    ended = room.get("ended_at")
    duration = int((ended - created).total_seconds()) if isinstance(created, datetime) and isinstance(ended, datetime) else None
    return {
        "meeting_id": str(room.get("_id", "")),
        "room_id": room.get("room_id", ""),
        "meeting_name": room.get("room_name") or room.get("room_id", ""),
        "host": room.get("host_name", "Unknown"),
        "participants": room.get("participant_count", 0),
        "duration_seconds": duration,
        "languages": room.get("languages", []),
        "status": "active" if room.get("is_active") else "ended",
        "connection_quality": room.get("connection_quality", "unknown"),
        "message_count": room.get("message_count", 0),
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }


@router.get("")
async def list_meetings(
    _: Annotated[dict, Depends(require_permission("meetings.read"))],
    search: str = "",
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    meetings, total = await AdminMeetingRepository(get_db()).list(search, status, page, page_size)
    return {"items": [serialize(room) for room in meetings], "total": total, "page": page, "page_size": page_size}


@router.post("/{room_id}/end", status_code=202)
async def end_meeting(room_id: str, admin: Annotated[dict, Depends(require_permission("meetings.write"))]) -> dict:
    return await issue_meeting_command(
        room_id,
        MeetingCommandRequest(command_type="END_MEETING", payload={"reason": "Ended by administrator"}),
        admin,
    )


@router.post("/{room_id}/kick", status_code=202)
async def kick_participant(room_id: str, body: KickRequest, admin: Annotated[dict, Depends(require_permission("meetings.write"))]) -> dict:
    return await issue_meeting_command(
        room_id,
        MeetingCommandRequest(
            command_type="KICK_PARTICIPANT",
            target_session_id=body.participant_id,
            payload={"reason": "Removed by administrator"},
        ),
        admin,
    )


@router.post("/{room_id}/command", status_code=202)
async def issue_meeting_command(
    room_id: str,
    body: MeetingCommandRequest,
    admin: Annotated[dict, Depends(require_permission("meetings.write"))],
) -> dict:
    command_type = body.command_type.upper()
    if command_type not in ROOM_COMMANDS | PARTICIPANT_COMMANDS:
        raise HTTPException(status_code=400, detail="Unsupported meeting command")
    if command_type in PARTICIPANT_COMMANDS and not body.target_session_id:
        raise HTTPException(status_code=400, detail="target_session_id is required")

    repo = AdminMeetingRepository(get_db())
    payload = {**(body.payload or {})}
    if body.message:
        payload["message"] = body.message
    local_command_id = await repo.queue_command(
        room_id,
        command_type,
        str(admin["_id"]),
        participant_id=body.target_session_id,
        payload=payload,
    )
    ack = await control_plane.publish_and_wait(
        command_type=command_type,
        actor_id=str(admin["_id"]),
        actor_email=admin.get("email", ""),
        room_id=room_id,
        target_session_id=body.target_session_id,
        target_user_id=body.target_user_id,
        payload=payload,
    )
    await repo.complete_command(local_command_id, ack)
    await AuditRepository(get_db()).record(
        str(admin["_id"]),
        f"meeting.{command_type.lower()}",
        "meeting",
        room_id,
        {
            "local_command_id": local_command_id,
            "control_command_id": ack.get("command_id"),
            "target_session_id": body.target_session_id,
            "target_user_id": body.target_user_id,
            "execution_status": ack.get("status"),
            "acknowledgement": ack,
        },
    )
    return {
        "status": ack.get("status", "UNKNOWN"),
        "command_id": local_command_id,
        "control_command_id": ack.get("command_id"),
        "acknowledgement": ack,
        "note": ack.get("message", ""),
    }


@router.get("/{room_id}/export")
async def export_meeting(room_id: str, _: Annotated[dict, Depends(require_permission("meetings.read"))]) -> dict:
    room = await get_db()["rooms"].find_one({"room_id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Meeting not found")
    messages = await get_db()["messages"].find({"room_id": room_id}, {"_id": 0}).sort("timestamp", 1).limit(1000).to_list(length=1000)
    for message in messages:
        if isinstance(message.get("timestamp"), datetime):
            message["timestamp"] = message["timestamp"].isoformat()
    return {"meeting": serialize(room), "messages": json_value(messages)}


@router.get("/{room_id}/logs")
async def meeting_logs(room_id: str, _: Annotated[dict, Depends(require_permission("meetings.read"))]) -> dict:
    rows = await get_db()["translation_logs"].find({"room_id": room_id}, {"_id": 0}).sort("timestamp", -1).limit(200).to_list(length=200)
    for row in rows:
        if isinstance(row.get("timestamp"), datetime):
            row["timestamp"] = row["timestamp"].isoformat()
    return {"room_id": room_id, "items": json_value(rows)}
