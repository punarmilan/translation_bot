import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.cms.sanitize import sanitize_sections
from app.cms.section_types import default_section, get_section_type, list_section_types
from app.config import get_settings
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.cms_repository import CmsRepository, page_status
from app.security import require_permission
from app.serialization import serialize

PREVIEW_TOKEN_PURPOSE = "cms_preview"

router = APIRouter(prefix="/api/admin/cms", tags=["admin-cms"])
public_router = APIRouter(prefix="/api/public/cms", tags=["public-cms"])

PAGE_KEY_PATTERN = r"^[a-z][a-z0-9-]{1,59}$"


class PageCreate(BaseModel):
    page: str = Field(pattern=PAGE_KEY_PATTERN, description="URL-safe slug, e.g. 'features' or 'blog-index'")
    label: str = Field(min_length=1, max_length=160)


class SEOMetadata(BaseModel):
    meta_title: str = Field(default="", max_length=70)
    meta_description: str = Field(default="", max_length=200)
    og_image_url: str = Field(default="")


class SectionsUpdate(BaseModel):
    sections: list[dict[str, Any]]
    seo: SEOMetadata = Field(default_factory=SEOMetadata)
    # Reserved for future scheduled-publish automation -- persisted only, not
    # yet enforced by any job (no UI to set it exists either yet).
    scheduled_publish_at: datetime | None = None


class SectionCreate(BaseModel):
    type: str
    name: str = Field(min_length=1, max_length=160)


def summarize(doc: dict) -> dict:
    return {
        "page": doc["page"],
        "label": doc.get("label", doc["page"]),
        "version": doc.get("version", 0),
        "status": page_status(doc),
        "section_count": len(doc.get("draft", {}).get("sections", [])),
        "updated_at": doc.get("updated_at"),
        "published_at": (doc.get("published") or {}).get("published_at"),
    }


@router.get("/section-types")
async def get_section_types(_: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    return {"items": list_section_types()}


@router.get("/pages")
async def list_pages(_: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    docs = await CmsRepository(get_db()).list_pages()
    return {"items": [summarize(doc) for doc in docs]}


@router.post("/pages", status_code=201)
async def create_page(body: PageCreate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = CmsRepository(get_db())
    if await repo.get_page(body.page):
        raise HTTPException(status_code=409, detail="A page with this key already exists")
    doc = await repo.create_page(body.page, body.label, str(admin["_id"]))
    await AuditRepository(get_db()).record(str(admin["_id"]), "cms.page.create", "cms_page", body.page, {"label": body.label})
    return serialize(doc)


@router.get("/pages/{page}")
async def get_page(page: str, _: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    doc = await CmsRepository(get_db()).get_page(page)
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")
    result = serialize(doc)
    result["status"] = page_status(doc)
    return result


@router.delete("/pages/{page}")
async def delete_page(page: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    if not await CmsRepository(get_db()).delete_page(page):
        raise HTTPException(status_code=404, detail="Page not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "cms.page.delete", "cms_page", page)
    return {"status": "deleted", "page": page}


@router.put("/pages/{page}")
async def save_draft(page: str, body: SectionsUpdate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = CmsRepository(get_db())
    if not await repo.get_page(page):
        raise HTTPException(status_code=404, detail="Page not found")
    for section in body.sections:
        if not section.get("type"):
            raise HTTPException(status_code=400, detail="Every section requires a 'type'")
    sanitized_sections = sanitize_sections(body.sections, get_section_type)
    doc = await repo.save_draft(
        page,
        sanitized_sections,
        str(admin["_id"]),
        seo=body.seo.model_dump(),
        scheduled_publish_at=body.scheduled_publish_at,
    )
    await AuditRepository(get_db()).record(str(admin["_id"]), "cms.page.save_draft", "cms_page", page, {"section_count": len(body.sections)})
    result = serialize(doc)
    result["status"] = page_status(doc)
    return result


@router.post("/pages/{page}/sections", status_code=201)
async def add_section(page: str, body: SectionCreate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = CmsRepository(get_db())
    doc = await repo.get_page(page)
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")
    try:
        section_key = f"sec_{body.type}_{int(time.time() * 1000)}"
        section = default_section(body.type, section_key, body.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    draft = doc.get("draft", {})
    sections = draft.get("sections", []) + [section]
    updated = await repo.save_draft(
        page,
        sections,
        str(admin["_id"]),
        seo=draft.get("seo", {}),
        scheduled_publish_at=draft.get("scheduled_publish_at"),
    )
    result = serialize(updated)
    result["status"] = page_status(updated)
    return result


@router.post("/pages/{page}/publish")
async def publish_page(page: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    doc = await CmsRepository(get_db()).publish(page, str(admin["_id"]))
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "cms.page.publish", "cms_page", page, {"version": doc.get("version")})
    result = serialize(doc)
    result["status"] = page_status(doc)
    return result


@router.post("/pages/{page}/revert")
async def revert_page(page: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    doc = await CmsRepository(get_db()).revert_draft(page)
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "cms.page.revert", "cms_page", page)
    result = serialize(doc)
    result["status"] = page_status(doc)
    return result


@router.post("/pages/{page}/preview-token")
async def mint_preview_token(page: str, _: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    """Mints a short-lived, page-scoped token letting the public frontend's
    /preview/{page} route fetch DRAFT (unpublished) content for exactly this
    page. Verified by the public backend against the same shared secret --
    see backend/app/routes.py's public_cms_page_preview."""
    if not await CmsRepository(get_db()).get_page(page):
        raise HTTPException(status_code=404, detail="Page not found")
    settings = get_settings()
    now = datetime.now(timezone.utc)
    ttl = settings.CMS_PREVIEW_TOKEN_TTL_SECONDS
    claims = {
        "page": page,
        "purpose": PREVIEW_TOKEN_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    token = jwt.encode(claims, settings.CMS_PREVIEW_SECRET, algorithm="HS256")
    return {"token": token, "expires_in": ttl}


@router.get("/pages/{page}/versions")
async def get_page_versions(page: str, _: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    versions = await CmsRepository(get_db()).list_versions(page)
    return {"items": [serialize(v) for v in versions]}


def _visible_section(section: dict) -> dict:
    cards = section.get("cards")
    if not isinstance(cards, list):
        return section
    visible_cards = [card for card in cards if not (isinstance(card, dict) and card.get("hidden"))]
    if visible_cards == cards:
        return section
    return {**section, "cards": visible_cards}


@public_router.get("/pages/{page}")
async def get_published_page(page: str) -> dict:
    doc = await CmsRepository(get_db()).get_page(page)
    if not doc or not doc.get("published"):
        raise HTTPException(status_code=404, detail="No published content for this page")
    published = doc["published"]
    return {
        "page": page,
        "version": published.get("version", doc.get("version", 1)),
        "sections": [_visible_section(s) for s in published.get("sections", []) if not s.get("hidden")],
        "seo": published.get("seo", {}),
    }
