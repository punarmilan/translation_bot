from __future__ import annotations

import re
from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "post"


class BlogRepository:
    """Owns the ``blog_posts`` collection.

    Each post is its own document with a draft/published status plus an
    optional ``publish_at`` for scheduled publishing -- there is no
    background scheduler; visibility is evaluated lazily at read time by
    ``visible_filter()``, the same lazy-evaluation approach the CMS preview
    system uses elsewhere in this codebase.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.posts = db["blog_posts"]

    async def create_indexes(self) -> None:
        await self.posts.create_index("slug", unique=True)
        await self.posts.create_index([("status", 1), ("publish_at", -1)])
        await self.posts.create_index("category")
        await self.posts.create_index("tags")

    @staticmethod
    def visible_filter(now: datetime | None = None) -> dict:
        now = now or utcnow()
        return {
            "status": "published",
            "$or": [{"publish_at": None}, {"publish_at": {"$lte": now}}],
        }

    async def unique_slug(self, base: str, exclude_id: ObjectId | None = None) -> str:
        slug = slugify(base)
        candidate = slug
        suffix = 2
        while True:
            query: dict = {"slug": candidate}
            if exclude_id:
                query["_id"] = {"$ne": exclude_id}
            if not await self.posts.find_one(query):
                return candidate
            candidate = f"{slug}-{suffix}"
            suffix += 1

    async def list(
        self,
        status: str | None = None,
        category: str | None = None,
        tag: str | None = None,
        search: str | None = None,
        featured: bool | None = None,
        public_only: bool = False,
        limit: int = 100,
        skip: int = 0,
    ) -> list[dict]:
        query: dict = {}
        if public_only:
            query.update(self.visible_filter())
        elif status:
            query["status"] = status
        if category:
            query["category"] = category
        if tag:
            query["tags"] = tag
        if featured is not None:
            query["featured"] = featured
        if search:
            pattern = re.escape(search)
            query["$and"] = query.get("$and", []) + [{
                "$or": [
                    {"title": {"$regex": pattern, "$options": "i"}},
                    {"excerpt": {"$regex": pattern, "$options": "i"}},
                    {"tags": {"$regex": pattern, "$options": "i"}},
                ]
            }]
        cursor = self.posts.find(query).sort([("featured", -1), ("updated_at", -1)]).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def get(self, post_id: str) -> dict | None:
        try:
            return await self.posts.find_one({"_id": ObjectId(post_id)})
        except Exception:
            return None

    async def get_by_slug(self, slug: str, public_only: bool = False) -> dict | None:
        query: dict = {"slug": slug}
        if public_only:
            query.update(self.visible_filter())
        return await self.posts.find_one(query)

    async def create(self, document: dict) -> dict:
        now = utcnow()
        record = {**document, "created_at": now, "updated_at": now}
        result = await self.posts.insert_one(record)
        record["_id"] = result.inserted_id
        return record

    async def update(self, post_id: str, changes: dict) -> dict | None:
        try:
            object_id = ObjectId(post_id)
        except Exception:
            return None
        await self.posts.update_one({"_id": object_id}, {"$set": {**changes, "updated_at": utcnow()}})
        return await self.posts.find_one({"_id": object_id})

    async def delete(self, post_id: str) -> bool:
        try:
            result = await self.posts.delete_one({"_id": ObjectId(post_id)})
        except Exception:
            return False
        return result.deleted_count == 1

    async def distinct_categories(self) -> list[str]:
        values = await self.posts.distinct("category", {"category": {"$nin": [None, ""]}})
        return sorted(values)

    async def distinct_tags(self) -> list[str]:
        values = await self.posts.distinct("tags")
        return sorted({v for v in values if v})
