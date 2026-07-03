# giftme.watch production deployment

Every push to `main` deploys this topology:

- `https://giftme.watch` → public React application
- `https://api.giftme.watch` → public FastAPI REST and WebSocket API
- `https://admin.giftme.watch` → admin React application
- `https://admin.giftme.watch/api` → admin FastAPI API
- `api.giftme.watch:3478` → authenticated WebRTC TURN relay

Caddy obtains and renews TLS certificates automatically. MongoDB,
LibreTranslate, and both FastAPI services stay on the private Docker network.

## 1. Provision the server

Use an Ubuntu 24.04 x86-64 VPS. The local translation and speech models need
more resources than a normal web application:

- Minimum: 4 vCPU, 8 GB RAM, 80 GB SSD
- Recommended: 8 vCPU, 16 GB RAM, 120 GB SSD

Clone once and install Docker:

```bash
git clone <repository-url> translation_bot
cd translation_bot
sudo bash deploy/bootstrap-ubuntu.sh
```

Log out and back in, then confirm the deployment user can run `docker version`
without `sudo`.

Allow these inbound ports in the VPS/cloud firewall:

| Protocol | Port | Purpose |
| --- | ---: | --- |
| TCP | 22 | GitHub Actions SSH deployment |
| TCP | 80 | ACME challenge and HTTPS redirect |
| TCP | 443 | HTTPS and WebSocket traffic |
| UDP | 443 | HTTP/3 |
| TCP + UDP | 3478 | TURN client traffic |
| UDP | 49160–49200 | TURN relayed media |

Do not expose ports 27017, 5000, 8000, or 8010.

## 2. Configure DNS

Create these records before the first deployment:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | VPS public IPv4 |
| A | `api` | VPS public IPv4 |
| A | `admin` | VPS public IPv4 |

If the VPS has IPv6, add equivalent AAAA records. Remove stale records that
point elsewhere. Verify all three names resolve to the server before pushing
to `main`; Caddy cannot issue certificates until DNS and ports 80/443 work.

## 3. Create the production environment

Copy `deploy/.env.production.example` locally and replace every placeholder.
Set `TURN_EXTERNAL_IP` to the VPS public IPv4. Generate URL-safe secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 64
openssl rand -hex 64
```

Use the generated values for the two Mongo passwords, `JWT_SECRET`, and
`TURN_SHARED_SECRET`. Never commit the resulting `.env`.

The Mongo application user is created only when the Mongo volume is first
initialized. Changing its credentials later requires an explicit database-user
rotation; editing the GitHub secret alone is not sufficient.

## 4. Configure GitHub

Create a GitHub Environment named `production` and add:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP address or SSH hostname |
| `VPS_USER` | Non-root deployment user |
| `VPS_SSH_KEY` | Private SSH key authorized for that user |
| `VPS_KNOWN_HOSTS` | Trusted SSH known-hosts line for the VPS |
| `PRODUCTION_ENV` | Complete contents of the production `.env` |
| `VPS_PATH` | Optional. Deployment directory on the VPS (default `/var/www/translation_bot`); must be writable by `VPS_USER` |

GHCR authentication uses the workflow's built-in `GITHUB_TOKEN`; no personal
access token is required.

Optional Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VPS_SSH_PORT` | `22` | SSH port |

For controlled releases, enable required reviewers on the `production`
Environment.

Add the public half of `VPS_SSH_KEY` on the server:

```bash
install -m 700 -d ~/.ssh
printf '%s\n' '<public-key>' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Collect `VPS_KNOWN_HOSTS` from a trusted machine and verify its fingerprint
against the VPS provider console before saving it:

```bash
ssh-keyscan -p 22 -H <vps-host>
```

## 5. Deploy

Merge or push to `main`. `.github/workflows/ci-cd.yml` will:

1. Build both React applications.
2. Test/compile the APIs and validate production Compose.
3. Build four immutable images and push SHA and `latest` tags to GHCR.
4. Upload deployment configuration and secrets over SSH.
5. Download missing Piper voices into a persistent volume.
6. Start the SHA-tagged release and wait for health checks.
7. Check all three public HTTPS endpoints.

If health checks fail, `deploy/deploy.sh` restores the previous image tag. The
first release can take several minutes while language and speech models load.

## 6. Create the first admin

Public signup deliberately cannot create admins. Sign up normally at
`https://giftme.watch`, then run:

```bash
cd ~/giftme
./promote-admin.sh owner@example.com
```

Log in at `https://admin.giftme.watch/admin/login`.

## Operations

Inspect services and logs:

```bash
cd ~/giftme
docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml ps
docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml logs -f --tail=200
```

Back up MongoDB:

```bash
cd ~/giftme
docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml \
  exec -T mongodb sh -lc \
  'mongodump --quiet --username "$MONGO_APP_USERNAME" --password "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGODB_DB" --db "$MONGODB_DB" --archive --gzip' \
  > "giftme-$(date +%F-%H%M).archive.gz"
```

Redeploy a known image SHA:

```bash
cd ~/giftme
./deploy.sh ghcr.io/<owner>/<repository> <full-git-sha>
```

Persistent volumes contain Mongo data, translation models, voice models,
Whisper cache, and certificates. Never run `docker compose down -v` in
production unless permanent deletion is intended.

The media topology remains peer-to-peer and is intentionally limited to the
currently supported two-user meeting. Move to an SFU before offering larger
video rooms.
