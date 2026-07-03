# Admin Backend

Independent FastAPI service for admin authentication, user operations, persisted meeting records, audit logs, and system health.

It shares the public backend's MongoDB database and JWT secret but does not import or mutate websocket, WebRTC, translation, or chat runtime modules.

Run from `admin-backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```
