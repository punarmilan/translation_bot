from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.cms.sanitize import sanitize_richtext
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.blog_repository import BlogRepository
from app.routers.cms import SEOMetadata
from app.security import require_permission
from app.serialization import serialize

router = APIRouter(prefix="/api/admin/blog", tags=["admin-blog"])
public_router = APIRouter(prefix="/api/public/blog", tags=["public-blog"])


class BlogPostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    excerpt: str = Field(default="", max_length=400)
    body_html: str = ""
    category: str = Field(default="General", max_length=80)
    tags: list[str] = Field(default_factory=list)
    cover_image_url: str = ""
    featured: bool = False
    seo: SEOMetadata = Field(default_factory=SEOMetadata)
    publish_at: datetime | None = None


class BlogPostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    excerpt: str | None = Field(default=None, max_length=400)
    body_html: str | None = None
    category: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = None
    cover_image_url: str | None = None
    featured: bool | None = None
    seo: SEOMetadata | None = None
    publish_at: datetime | None = None
    clear_publish_at: bool = False


def summarize(doc: dict) -> dict:
    item = serialize(doc)
    item["body_html"] = doc.get("body_html", "")
    return item


@router.get("/posts")
async def list_posts(
    _: Annotated[dict, Depends(require_permission("content.read"))],
    status: Literal["draft", "published"] | None = None,
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
) -> dict:
    repo = BlogRepository(get_db())
    items = await repo.list(status=status, category=category, tag=tag, search=search, limit=limit, skip=skip)
    return {"items": [summarize(item) for item in items]}


@router.get("/categories")
async def list_categories(_: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    return {"items": await BlogRepository(get_db()).distinct_categories()}


@router.get("/tags")
async def list_tags(_: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    return {"items": await BlogRepository(get_db()).distinct_tags()}


@router.get("/posts/{post_id}")
async def get_post(post_id: str, _: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    doc = await BlogRepository(get_db()).get(post_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")
    return summarize(doc)


@router.post("/posts", status_code=201)
async def create_post(body: BlogPostCreate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = BlogRepository(get_db())
    slug = await repo.unique_slug(body.slug or body.title)
    doc = await repo.create({
        "title": body.title,
        "slug": slug,
        "excerpt": body.excerpt,
        "body_html": sanitize_richtext(body.body_html),
        "category": body.category,
        "tags": [t.strip() for t in body.tags if t.strip()],
        "cover_image_url": body.cover_image_url,
        "featured": body.featured,
        "seo": body.seo.model_dump(),
        "status": "draft",
        "publish_at": body.publish_at,
        "published_at": None,
        "author_id": str(admin["_id"]),
        "author_name": admin.get("name") or admin.get("email", ""),
    })
    await AuditRepository(get_db()).record(str(admin["_id"]), "blog.post.create", "blog_post", str(doc["_id"]), {"title": body.title})
    return summarize(doc)


@router.patch("/posts/{post_id}")
async def update_post(post_id: str, body: BlogPostUpdate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = BlogRepository(get_db())
    existing = await repo.get(post_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")

    changes = body.model_dump(exclude_unset=True, exclude={"clear_publish_at"})
    if "body_html" in changes:
        changes["body_html"] = sanitize_richtext(changes["body_html"])
    if "tags" in changes:
        changes["tags"] = [t.strip() for t in changes["tags"] if t.strip()]
    if "seo" in changes:
        changes["seo"] = body.seo.model_dump()
    if "slug" in changes:
        changes["slug"] = await repo.unique_slug(changes["slug"] or existing["title"], exclude_id=existing["_id"])
    if body.clear_publish_at:
        changes["publish_at"] = None

    doc = await repo.update(post_id, changes)
    await AuditRepository(get_db()).record(str(admin["_id"]), "blog.post.update", "blog_post", post_id)
    return summarize(doc)


@router.post("/posts/{post_id}/publish")
async def publish_post(post_id: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = BlogRepository(get_db())
    existing = await repo.get(post_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")
    from datetime import timezone
    doc = await repo.update(post_id, {"status": "published", "published_at": existing.get("published_at") or datetime.now(timezone.utc)})
    await AuditRepository(get_db()).record(str(admin["_id"]), "blog.post.publish", "blog_post", post_id)
    return summarize(doc)


@router.post("/posts/{post_id}/unpublish")
async def unpublish_post(post_id: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    repo = BlogRepository(get_db())
    if not await repo.get(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    doc = await repo.update(post_id, {"status": "draft"})
    await AuditRepository(get_db()).record(str(admin["_id"]), "blog.post.unpublish", "blog_post", post_id)
    return summarize(doc)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    if not await BlogRepository(get_db()).delete(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "blog.post.delete", "blog_post", post_id)
    return {"status": "deleted", "post_id": post_id}


@public_router.get("/posts")
async def public_list_posts(
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    featured: bool | None = None,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> dict:
    repo = BlogRepository(get_db())
    items = await repo.list(category=category, tag=tag, search=search, featured=featured, public_only=True, limit=limit, skip=skip)
    return {"items": [_public_summary(item) for item in items]}


@public_router.get("/posts/{slug}")
async def public_get_post(slug: str) -> dict:
    doc = await BlogRepository(get_db()).get_by_slug(slug, public_only=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")
    return _public_summary(doc, include_body=True)


@public_router.get("/categories")
async def public_categories() -> dict:
    return {"items": await BlogRepository(get_db()).distinct_categories()}


@public_router.get("/tags")
async def public_tags() -> dict:
    return {"items": await BlogRepository(get_db()).distinct_tags()}


def _public_summary(doc: dict, include_body: bool = False) -> dict:
    item = {
        "slug": doc["slug"],
        "title": doc.get("title", ""),
        "excerpt": doc.get("excerpt", ""),
        "category": doc.get("category", "General"),
        "tags": doc.get("tags", []),
        "cover_image_url": doc.get("cover_image_url", ""),
        "featured": doc.get("featured", False),
        "seo": doc.get("seo", {}),
        "published_at": doc.get("published_at"),
        "updated_at": doc.get("updated_at"),
    }
    if include_body:
        item["body_html"] = doc.get("body_html", "")
    return item
