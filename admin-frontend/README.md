# Admin Frontend

Independent React/Vite SaaS administration portal.

```powershell
cd admin-frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5176/admin/login`.

Initial registration is available at `http://localhost:5176/admin/signup` and
requires `ADMIN_BOOTSTRAP_CODE` from the admin backend. Once an administrator
exists, registration becomes invitation-only.

The browser does not store admin JWTs in local storage. The admin API issues
host-only HttpOnly access and rotating refresh cookies. Axios sends cookies
with credentials and performs one refresh attempt after an expired access
session.

Production builds use `npm run build`. Configure the static host so
`/admin/*` falls back to `index.html`, and reverse-proxy `/api/admin/*` to the
admin backend.
