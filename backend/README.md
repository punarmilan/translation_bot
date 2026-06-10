# Backend

FastAPI backend with room-based WebSocket endpoints for multilingual text chat.

Translations are handled by the modular service in `app/translation/service.py`, which calls a local LibreTranslate Docker container by default.

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: http://localhost:8000

WebSocket endpoint: `ws://localhost:8000/ws/{room_id}/{user_lang}`

Example:

```text
ws://localhost:8000/ws/team-room/hi
```

After connecting, the frontend sends a join payload with username and room ID.

## LibreTranslate dependency

From the project root:

```bash
docker compose up -d libretranslate
curl http://localhost:5000/languages
```

Default FastAPI translation service URL:

```text
http://127.0.0.1:5000
```
