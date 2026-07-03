# Admin Frontend

Independent React/Vite administration portal for Translation Bot.

## Development

```powershell
cd admin-frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The portal opens at `http://localhost:5176/admin/login` and expects the admin
API at `http://127.0.0.1:8010` by default.

Only an existing user whose current MongoDB role is `admin` can enter. The
portal stores its token under a separate `admin_access_token` browser key.

## Production routing

Build with `npm run build`, then configure the web server so `/admin/*` falls
back to the admin build's `index.html`. Route `/admin/api/*` or a dedicated API
subdomain to `admin-backend`. The public meeting frontend remains a separate
deployment.
