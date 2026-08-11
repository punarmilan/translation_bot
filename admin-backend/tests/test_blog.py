"""Regression tests for the Blog CMS: draft/publish lifecycle, scheduled
publishing (lazy-evaluated visibility, no background scheduler), category/tag
filtering, search, and the public-safe read surface.
"""

from datetime import datetime, timedelta, timezone


def _create(client, **overrides):
    body = {"title": "My First Post", "excerpt": "A short teaser", "body_html": "<p>Hello <script>alert(1)</script>world</p>", "category": "Product", "tags": ["release", "translation"]}
    body.update(overrides)
    response = client.post("/api/admin/blog/posts", json=body)
    assert response.status_code == 201
    return response.json()


def test_create_post_generates_unique_slug_and_sanitizes_body(client):
    post = _create(client)
    assert post["slug"] == "my-first-post"
    assert post["status"] == "draft"
    assert "<script>" not in post["body_html"]
    assert "world" in post["body_html"]

    duplicate = _create(client, title="My First Post")
    assert duplicate["slug"] == "my-first-post-2"


def test_draft_post_is_not_publicly_visible(client):
    post = _create(client)
    public_list = client.get("/api/public/blog/posts").json()
    assert all(item["slug"] != post["slug"] for item in public_list["items"])

    public_detail = client.get(f"/api/public/blog/posts/{post['slug']}")
    assert public_detail.status_code == 404


def test_publish_makes_post_publicly_visible_with_safe_fields_only(client):
    post = _create(client)
    published = client.post(f"/api/admin/blog/posts/{post['_id']}/publish")
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    public_detail = client.get(f"/api/public/blog/posts/{post['slug']}")
    assert public_detail.status_code == 200
    body = public_detail.json()
    assert body["title"] == "My First Post"
    assert "author_id" not in body

    public_list = client.get("/api/public/blog/posts").json()
    assert any(item["slug"] == post["slug"] for item in public_list["items"])


def test_scheduled_publish_at_hides_post_until_the_scheduled_time(client):
    post = _create(client)
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    client.patch(f"/api/admin/blog/posts/{post['_id']}", json={"publish_at": future})
    client.post(f"/api/admin/blog/posts/{post['_id']}/publish")

    # Scheduled for the future -- not visible publicly yet.
    assert client.get(f"/api/public/blog/posts/{post['slug']}").status_code == 404

    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    client.patch(f"/api/admin/blog/posts/{post['_id']}", json={"publish_at": past})

    # Same status=published document, but its scheduled time has now passed.
    assert client.get(f"/api/public/blog/posts/{post['slug']}").status_code == 200


def test_unpublish_hides_a_previously_published_post(client):
    post = _create(client)
    client.post(f"/api/admin/blog/posts/{post['_id']}/publish")
    assert client.get(f"/api/public/blog/posts/{post['slug']}").status_code == 200

    unpublished = client.post(f"/api/admin/blog/posts/{post['_id']}/unpublish")
    assert unpublished.json()["status"] == "draft"
    assert client.get(f"/api/public/blog/posts/{post['slug']}").status_code == 404


def test_category_tag_and_search_filters(client):
    _create(client, title="Announcing Live Translation", category="Product", tags=["release"])
    _create(client, title="Engineering Deep Dive", category="Engineering", tags=["architecture"])

    by_category = client.get("/api/admin/blog/posts", params={"category": "Engineering"}).json()
    assert len(by_category["items"]) == 1
    assert by_category["items"][0]["category"] == "Engineering"

    by_tag = client.get("/api/admin/blog/posts", params={"tag": "release"}).json()
    assert len(by_tag["items"]) == 1

    by_search = client.get("/api/admin/blog/posts", params={"search": "Deep Dive"}).json()
    assert len(by_search["items"]) == 1
    assert by_search["items"][0]["title"] == "Engineering Deep Dive"

    categories = client.get("/api/admin/blog/categories").json()
    assert set(categories["items"]) == {"Engineering", "Product"}


def test_featured_flag_and_delete(client):
    post = _create(client, featured=True)
    listing = client.get("/api/admin/blog/posts").json()
    assert listing["items"][0]["featured"] is True

    deleted = client.delete(f"/api/admin/blog/posts/{post['_id']}")
    assert deleted.status_code == 200
    assert client.get(f"/api/admin/blog/posts/{post['_id']}").status_code == 404


def test_blog_write_requires_content_write_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.post("/api/admin/blog/posts", json={"title": "Should be blocked"})
    assert response.status_code == 403
