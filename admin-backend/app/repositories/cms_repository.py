import copy
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def page_status(doc: dict) -> str:
    if not doc.get("published"):
        return "draft"
    draft = doc.get("draft", {})
    published = doc["published"]
    if draft.get("sections") == published.get("sections") and draft.get("seo", {}) == published.get("seo", {}):
        return "published"
    return "modified"


class CmsRepository:
    """Owns the generic, page-agnostic CMS collections.

    One document per page in ``cms_pages`` (keyed by ``page``), holding both
    the working draft and the currently-live published snapshot side by side
    so every page -- landing, features, pricing, blogs, or any page created
    later -- goes through the exact same draft/publish/revert lifecycle with
    no page-specific code.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.pages = db["cms_pages"]
        self.versions = db["cms_page_versions"]

    async def create_indexes(self) -> None:
        await self.pages.create_index("page", unique=True)
        await self.versions.create_index([("page", 1), ("version", -1)])

    async def list_pages(self) -> list[dict]:
        return await self.pages.find({}).sort("updated_at", -1).to_list(length=500)

    async def get_page(self, page: str) -> dict | None:
        return await self.pages.find_one({"page": page})

    async def create_page(self, page: str, label: str, actor_id: str) -> dict:
        now = utcnow()
        doc = {
            "page": page,
            "label": label,
            "draft": {
                "sections": [],
                "seo": {},
                "scheduled_publish_at": None,
                "updated_at": now,
                "updated_by": actor_id,
            },
            "published": None,
            "version": 0,
            "created_at": now,
            "updated_at": now,
        }
        await self.pages.insert_one(doc)
        return doc

    async def delete_page(self, page: str) -> bool:
        result = await self.pages.delete_one({"page": page})
        await self.versions.delete_many({"page": page})
        return result.deleted_count == 1

    async def save_draft(
        self,
        page: str,
        sections: list[dict],
        actor_id: str,
        seo: dict | None = None,
        scheduled_publish_at=None,
    ) -> dict | None:
        now = utcnow()
        await self.pages.update_one(
            {"page": page},
            {
                "$set": {
                    "draft": {
                        "sections": sections,
                        "seo": seo or {},
                        "scheduled_publish_at": scheduled_publish_at,
                        "updated_at": now,
                        "updated_by": actor_id,
                    },
                    "updated_at": now,
                }
            },
        )
        return await self.get_page(page)

    async def publish(self, page: str, actor_id: str) -> dict | None:
        existing = await self.get_page(page)
        if not existing:
            return None
        now = utcnow()
        draft = existing.get("draft", {})
        sections = copy.deepcopy(draft.get("sections", []))
        seo = copy.deepcopy(draft.get("seo", {}))
        next_version = int(existing.get("version", 0)) + 1
        published = {
            "sections": sections,
            "seo": seo,
            "version": next_version,
            "published_at": now,
            "published_by": actor_id,
        }
        await self.pages.update_one(
            {"page": page},
            {"$set": {"published": published, "version": next_version, "updated_at": now}},
        )
        await self.versions.insert_one({
            "page": page,
            "version": next_version,
            "sections": sections,
            "seo": seo,
            "published_by": actor_id,
            "published_at": now,
        })
        return await self.get_page(page)

    async def revert_draft(self, page: str) -> dict | None:
        existing = await self.get_page(page)
        if not existing:
            return None
        now = utcnow()
        published = existing.get("published") or {}
        published_sections = copy.deepcopy(published.get("sections", []))
        published_seo = copy.deepcopy(published.get("seo", {}))
        await self.pages.update_one(
            {"page": page},
            {
                "$set": {
                    "draft": {
                        "sections": published_sections,
                        "seo": published_seo,
                        "scheduled_publish_at": None,
                        "updated_at": now,
                        "updated_by": None,
                    },
                    "updated_at": now,
                }
            },
        )
        return await self.get_page(page)

    async def list_versions(self, page: str) -> list[dict]:
        return await self.versions.find({"page": page}).sort("version", -1).to_list(length=100)

    async def get_published_sections(self, page: str) -> list[dict] | None:
        doc = await self.get_page(page)
        if not doc or not doc.get("published"):
            return None
        return doc["published"].get("sections", [])
