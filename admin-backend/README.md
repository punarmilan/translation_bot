# Admin Backend

Independent FastAPI service for GiftMe administration, CMS, media, policy,
analytics, audit, and system health.

It shares MongoDB records with the public platform but uses an independent JWT
secret, cookie session lifecycle, middleware, dependencies, and routes.

## Run

```powershell
cd admin-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

API documentation: `http://127.0.0.1:8010/docs`

## Register the first administrator

1. Set a private value in `admin-backend/.env`:

   ```env
   ADMIN_BOOTSTRAP_CODE=use-a-long-random-one-time-code
   ```

2. Start MongoDB, the admin backend, and the admin frontend.
3. Open `http://localhost:5176/admin/signup`.
4. Register with the bootstrap code.
5. Sign in at `/admin/login`.

Only the first administrator can use the bootstrap code. Later administrators
must use a one-time invitation created from **Roles & Permissions → Invite
admin**.

For production, use a unique `ADMIN_JWT_SECRET`, enable secure cookies, use
TLS, restrict CORS, replace local media storage, and add rate limiting at the
edge.
