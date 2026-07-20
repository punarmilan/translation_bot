import io
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from app.config import get_settings
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.media_repository import MediaRepository, checksum_for
from app.security import require_permission
from app.serialization import serialize

router = APIRouter(prefix="/api/admin/media", tags=["admin-media"])
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
    "video/mp4", "video/webm", "application/pdf", "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class TransformRequest(BaseModel):
    operation: str
    x: int = Field(default=0, ge=0)
    y: int = Field(default=0, ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    quality: int = Field(default=82, ge=35, le=95)


class MediaMetadataUpdate(BaseModel):
    original_name: str | None = Field(default=None, min_length=1, max_length=220)
    alt_text: str | None = Field(default=None, max_length=500)
    folder: str | None = Field(default=None, max_length=120)


def public_asset(asset: dict) -> dict:
    item = serialize(asset)
    item["media_id"] = item.pop("_id")
    item["url"] = f"/admin-media/{asset['stored_name']}"
    return item


async def read_validated(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported media type")
    data = await file.read(get_settings().MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > get_settings().MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds the upload limit")
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    return data


@router.get("")
async def list_media(admin: Annotated[dict, Depends(require_permission("media.read"))], search: str = "") -> dict:
    return {"items": [public_asset(item) for item in await MediaRepository(get_db()).list(search)]}


@router.post("", status_code=201)
async def upload_media(
    admin: Annotated[dict, Depends(require_permission("media.write"))],
    file: UploadFile = File(...),
    alt_text: str = Form(default=""),
) -> dict:
    data = await read_validated(file)
    repo = MediaRepository(get_db())
    stored_name, path = repo.destination(file.filename or "upload.bin")
    path.write_bytes(data)
    asset = await repo.create(file.filename or stored_name, stored_name, file.content_type or "application/octet-stream", len(data), checksum_for(data), str(admin["_id"]))
    
    width, height = None, None
    if file.content_type and file.content_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(data)) as img:
                width, height = img.size
        except Exception:
            pass

    asset["alt_text"] = alt_text
    await repo.replace_metadata(str(asset["_id"]), {"alt_text": alt_text, "width": width, "height": height})
    await AuditRepository(get_db()).record(str(admin["_id"]), "media.upload", "media", str(asset["_id"]), {"filename": file.filename})
    return public_asset(asset)


@router.put("/{media_id}/file")
async def replace_media(
    media_id: str,
    admin: Annotated[dict, Depends(require_permission("media.write"))],
    file: UploadFile = File(...),
) -> dict:
    repo = MediaRepository(get_db())
    existing = await repo.get(media_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Media asset not found")
    data = await read_validated(file)
    old_path = repo.root / existing["stored_name"]
    stored_name, new_path = repo.destination(file.filename or existing["original_name"])
    new_path.write_bytes(data)
    if old_path.exists():
        old_path.unlink()
        
    width, height = None, None
    if file.content_type and file.content_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(data)) as img:
                width, height = img.size
        except Exception:
            pass

    asset = await repo.replace_metadata(media_id, {
        "original_name": file.filename or existing["original_name"],
        "stored_name": stored_name,
        "content_type": file.content_type,
        "size": len(data),
        "checksum": checksum_for(data),
        "width": width,
        "height": height,
    })
    await AuditRepository(get_db()).record(str(admin["_id"]), "media.replace", "media", media_id)
    return public_asset(asset)


@router.post("/{media_id}/transform")
async def transform_media(media_id: str, body: TransformRequest, admin: Annotated[dict, Depends(require_permission("media.write"))]) -> dict:
    repo = MediaRepository(get_db())
    asset = await repo.get(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if not asset.get("content_type", "").startswith("image/") or asset.get("content_type") in {"image/svg+xml", "image/gif"}:
        raise HTTPException(status_code=400, detail="Crop and compression are available for JPEG, PNG, and WebP images")
    path = repo.root / asset["stored_name"]
    try:
        image = Image.open(path)
        if body.operation == "crop":
            if not body.width or not body.height:
                raise HTTPException(status_code=400, detail="Crop width and height are required")
            image = image.crop((body.x, body.y, body.x + body.width, body.y + body.height))
        elif body.operation != "compress":
            raise HTTPException(status_code=400, detail="Unknown transform operation")
        output = io.BytesIO()
        image_format = image.format or Path(path).suffix.removeprefix(".").upper()
        if image_format == "JPG":
            image_format = "JPEG"
        save_options = {"optimize": True}
        if image_format in {"JPEG", "WEBP"}:
            save_options["quality"] = body.quality
        image.save(output, format=image_format, **save_options)
        data = output.getvalue()
        path.write_bytes(data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Image transformation failed") from exc
    updated = await repo.replace_metadata(media_id, {"size": len(data), "checksum": checksum_for(data)})
    await AuditRepository(get_db()).record(str(admin["_id"]), f"media.{body.operation}", "media", media_id)
    return public_asset(updated)


@router.patch("/{media_id}")
async def update_media(media_id: str, body: MediaMetadataUpdate, admin: Annotated[dict, Depends(require_permission("media.write"))]) -> dict:
    values = body.model_dump(exclude_none=True)
    asset = await MediaRepository(get_db()).replace_metadata(media_id, values)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "media.update", "media", media_id, values)
    return public_asset(asset)


@router.delete("/{media_id}")
async def delete_media(media_id: str, admin: Annotated[dict, Depends(require_permission("media.write"))]) -> dict:
    if not await MediaRepository(get_db()).delete(media_id):
        raise HTTPException(status_code=404, detail="Media asset not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "media.delete", "media", media_id)
    return {"status": "deleted", "media_id": media_id}
