from bson import ObjectId
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient
import pytest

from app import database, main, security
from app.main import app

ADMIN_ORIGIN = "http://localhost:5176"
FAKE_ADMIN = {"_id": ObjectId(), "email": "admin@test.local", "admin_permissions": None}


async def _fake_require_admin() -> dict:
    return FAKE_ADMIN


async def _noop() -> None:
    return None


@pytest.fixture
def client(monkeypatch):
    """A TestClient wired to a fresh in-memory MongoDB (mongomock) per test,
    with real admin cookie/JWT auth swapped out for a fixed fake admin so CMS
    endpoint behavior can be tested independent of the auth flow."""
    mock_client = AsyncMongoMockClient()
    database._client = mock_client

    # The real lifespan tries to connect to a live MongoDB; replace it with a
    # no-op so startup keeps the mongomock client already assigned above.
    monkeypatch.setattr(main, "connect_db", _noop)
    monkeypatch.setattr(main, "disconnect_db", _noop)

    app.dependency_overrides[security.require_admin] = _fake_require_admin
    with TestClient(app) as test_client:
        test_client.headers.update({"Origin": ADMIN_ORIGIN})
        yield test_client
    app.dependency_overrides.clear()
    database._client = None
