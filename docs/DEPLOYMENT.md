# Deployment

This project has multiple runtime parts. A production deployment should separate frontend, backend, database, translation, STT, TTS, and WebRTC relay infrastructure.

## Frontend on Vercel

1. Connect the repository to Vercel.
2. Set the frontend root to `frontend`.
3. Build command:

```bash
npm run build
```

4. Output directory:

```text
dist
```

5. Set environment variables:

```env
VITE_API_BASE_URL=https://api.your-domain.com
```

Vercel automatically provides HTTPS, which is required for camera and microphone access.

## Backend on Railway

1. Create a Railway service from the repository.
2. Set the backend root to `backend`.
3. Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

4. Add environment variables:

```env
MONGODB_URL=mongodb+srv://...
DATABASE_NAME=translation_bot
JWT_SECRET_KEY=strong-production-secret
LIBRETRANSLATE_URL=https://translate.your-domain.com
PIPER_EXECUTABLE=/app/bin/piper
PIPER_MODELS_DIR=/app/models/piper
WHISPER_MODEL=tiny
```

Railway can run the FastAPI app, but STT and TTS CPU load may need a larger instance.

## Backend on Render

1. Create a Web Service.
2. Runtime: Python.
3. Root directory: `backend`.
4. Build command:

```bash
pip install -r requirements.txt
```

5. Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Render supports HTTPS at the service URL. Confirm WebSocket upgrade support is enabled by using the provided HTTPS domain.

## MongoDB

Use MongoDB Atlas for production:

- enable IP access rules
- create a dedicated database user
- use a strong password
- create unique indexes for email and username
- do not commit credentials

## HTTPS Requirements

Browsers require secure contexts for reliable camera and microphone access. Production must use HTTPS for:

- frontend
- backend REST API
- WebSocket endpoint (`wss://`)

Local LAN testing should use self-signed certificates only for development.

## TURN and STUN

STUN helps peers discover public addresses. TURN relays media when direct peer-to-peer paths fail.

Prototype:

```js
[{ urls: "stun:stun.l.google.com:19302" }]
```

Production:

```js
[
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:turn.your-domain.com:3478",
    username: "generated-user",
    credential: "generated-secret"
  }
]
```

Recommended TURN options:

- self-hosted coturn
- Twilio Network Traversal
- Xirsys
- Cloudflare Calls or another managed realtime media provider

## Domain Setup

Recommended domains:

- `app.your-domain.com` for Vercel frontend
- `api.your-domain.com` for FastAPI backend
- `turn.your-domain.com` for TURN
- `translate.your-domain.com` for LibreTranslate if self-hosted

## Production Readiness Checklist

- HTTPS everywhere
- `wss://` WebSocket endpoint
- MongoDB Atlas with indexes
- strong JWT secret
- CORS restricted to frontend domain
- TURN credentials
- logs and metrics
- automated tests
- Docker image for backend media dependencies
- upload-free, local-only model storage policy
