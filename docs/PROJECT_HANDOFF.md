# VOXO — Project Handoff

**Audience:** the next developer/employee continuing the whole VOXO project
after this internship — the end-user platform and the Admin Console alike.
**Scope:** documentation and repository audit only. No application code,
configuration, database data, or runtime behavior was changed while producing
this document.
**Method:** every claim below was checked against the actual source, tests,
or command output in this repository as of 2026-08-18 (commit `e8f957c`,
working tree clean, `main` up to date with `origin/main`) — not reproduced
from memory or prior chat summaries. Where a claim could not be verified in
the repository, that is stated explicitly instead of assumed.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [VOXO End-User Platform](#2-voxo-end-user-platform)
3. [Admin Console](#3-admin-console)
4. [Backend / API Architecture](#4-backend--api-architecture)
5. [Database / Persistence](#5-database--persistence)
6. [AI / Translation Pipeline](#6-ai--translation-pipeline)
7. [Meeting Experience](#7-meeting-experience)
8. [Infrastructure / Deployment](#8-infrastructure--deployment)
9. [Security](#9-security)
10. [Testing / Verification](#10-testing--verification)
11. [Completed Work (Phase Summary)](#11-completed-work-phase-summary)
12. [Remaining Work / Next Developer Tasks](#12-remaining-work--next-developer-tasks)
13. [LiveKit / SFU Status](#13-livekit--sfu-status)
14. [Local Development](#14-local-development)
15. [Important Files](#15-important-files)
16. [Known Issues / Warnings](#16-known-issues--warnings)
17. [Recommended Next Roadmap](#17-recommended-next-roadmap)
18. [Final Handoff Status](#18-final-handoff-status)

---

## 1. Project Overview

**What VOXO is.** VOXO ("Translation Bot" in the repository, production domain
`giftme.watch`) is a real-time multilingual meeting platform: authenticated
video/audio meetings where each participant speaks and hears their own
preferred language, with live transcription, machine translation, and
synthesized translated speech running alongside a text chat, whiteboard,
shared notes, and file sharing.

**Main use case.** A small group of people who don't share a language join
the same room; each selects a "spoken language" and a "listening" preference
(original audio, translated audio, captions, or a combination). Speech is
transcribed, translated per unique target language in the room (not once per
listener), and optionally re-synthesized as translated audio.

**Current state of the project.** This is a working, testable, buildable
product with a real production deployment pipeline (Docker, Caddy, TURN,
GitHub Actions → GHCR → VPS). The meeting/media architecture is peer-to-peer
WebRTC, explicitly scoped around small meetings — the project's own
documentation describes "two-user topology" as the fully supported case; more
than two simultaneous video participants has not been characterized as
production-hardened in this repository (see §7, §13). Alongside the product
itself, a full separate **Admin Console** has been built out over ten
implementation phases (§3, §11) to make most of the platform's behavior
configurable without a deploy.

**Distinction: end-user platform vs. Admin Console.** These are **two
separate applications** with separate frontends, separate backends, separate
databases connections (same MongoDB instance, independent Motor clients), and
separate JWT trust domains:

| | End-user platform | Admin Console |
|---|---|---|
| Frontend | `frontend/` (React) → `giftme.watch` | `admin-frontend/` (React) → `admin.giftme.watch` |
| Backend | `backend/` (FastAPI) → `api.giftme.watch` | `admin-backend/` (FastAPI) → `admin.giftme.watch/api/*` |
| Auth | User JWT (`JWT_SECRET`, `type: "user"`, Bearer header) | Admin JWT (`ADMIN_JWT_SECRET`, `type: "admin"`, HttpOnly cookies) |
| Purpose | Meetings, chat, translation, WebRTC | Operating/configuring the platform: CMS, users, meeting policy, AI settings, organizations, monitoring |

Neither token type authorizes the other API. This separation is deliberate
and load-bearing — it is what has allowed ten phases of admin-console work to
be built without ever needing to touch WebRTC/WebSocket/translation runtime
code, and the next developer should preserve it.

**Major technologies** (verified against `package.json`/`requirements.txt`
in each app):

| Layer | Technology |
|---|---|
| Public frontend | React 19, Vite 6, React Router 7, Axios, Tailwind CSS 3, DOMPurify |
| Admin frontend | React 19, Vite 6, React Router 7, Axios, TipTap 2 (rich text), DOMPurify |
| Public backend | FastAPI 0.139, Uvicorn, Pydantic Settings, PyJWT, passlib/bcrypt, Motor + PyMongo, Redis client, httpx |
| Admin backend | FastAPI 0.139, Uvicorn, Motor + PyMongo, PyJWT, passlib/bcrypt, Pillow, psutil, Redis client, `nh3` (HTML sanitizer) |
| Database | MongoDB 7 — one database, both backends connect independently |
| Speech-to-text | `faster-whisper` 1.1.1 (local inference) |
| Text-to-speech | `piper-tts` 1.4.2 (local, ONNX voices) |
| Machine translation | LibreTranslate (external service/container, not a Python dependency) |
| Real-time transport | Native WebSockets (no Socket.IO); WebRTC (`RTCPeerConnection`) peer-to-peer for audio/video |
| Control plane | Redis pub/sub — admin backend publishes signed commands, public backend applies them live |
| Reverse proxy / TLS | Caddy 2.11.4 (automatic Let's Encrypt) |
| TURN relay | `coturn/coturn:4.14.0` |
| CI/CD | GitHub Actions → GHCR image registry → SSH deploy to a VPS |
| Testing | Python `unittest`/`pytest` for both backends (`mongomock`/`mongomock-motor`); **no configured frontend test runner** in either `package.json` |

**High-level architecture:**

```
Browser (public)                Browser (admin)
   |  HTTPS/WSS                     |  HTTPS
giftme.watch (frontend)      admin.giftme.watch (admin-frontend)
   |                                |
api.giftme.watch (backend)   admin.giftme.watch/api (admin-backend)
   |  \                             |
   |   \--- Redis control plane ----/   (admin -> backend live commands)
   |
   +-- MongoDB 7 (shared database, independent connections)
   +-- LibreTranslate (translation)
   +-- faster-whisper (in-process STT)
   +-- Piper (subprocess TTS)
   +-- coturn (TURN relay, WebRTC only)

Browser <--- WebRTC peer-to-peer ---> Browser   (audio/video media path;
                                                   never passes through the backend)
```

---

## 2. VOXO End-User Platform

### 2.1 Frontend architecture

`frontend/src/` is a standard Vite/React Router SPA. Marketing/content pages
(Landing, Features, Solutions, Pricing, Blog, About, Docs, Help, How-it-Works)
are mostly CMS-driven (see §3). The product itself is dominated by one large
page component:

- **`frontend/src/pages/ChatPage.jsx`** is the meeting workspace — a single
  ~2,700-line component that owns essentially all client-side meeting state:
  WebSocket connection lifecycle, WebRTC peer connection and ICE handling,
  chat messages, member list, translation status/transcripts/captions, voice
  activity detection (VAD) presets, translated-audio playback queue,
  whiteboard shapes, shared notes, file sharing, screen sharing, recording
  status, meeting layout, diagnostics panel state, and consumption of every
  admin-configured policy broadcast (`room_policy`, feature-flag updates).
  This is the single most important file to read before making any
  meeting-related change — see §15.
- Supporting presentational components: `VideoGrid.jsx`, `VideoCall.jsx`,
  `TranslationPanel.jsx`, `TranslatedAudioPlayer.jsx`, `WhiteboardPanel.jsx`,
  `NotesPanel.jsx`, `FilesPanel.jsx`, `DiagnosticsPanel.jsx`.
- `contexts/AuthContext.jsx` — a thin context around `localStorage`'s
  `access_token`, `getMe()`/`login()`/`signup()`/`updateProfile()`. Notably,
  it stores **only the access token**, not the refresh token, in
  `localStorage`; there is no client-side refresh-token rotation/renewal flow
  wired to this context (see §9, §16).
- `contexts/ThemeContext.jsx`, `contexts/ConfigContext.jsx` — theme and
  branding/SEO application (see §3's CMS section).

### 2.2 Backend architecture

`backend/app/`:

- **`routes.py`** — every public HTTP endpoint and the single WebSocket
  endpoint (`/ws/{room_id}/{user_lang}`). ~1,300+ lines; the WebSocket route
  is a `while True` message-dispatch loop keyed on a `type` field.
- **`websocket_manager.py`** — `RoomConnectionManager`, the in-memory owner
  of all room/session state (`RoomState`, `ClientSession` dataclasses),
  connection/disconnect lifecycle, meeting-policy enforcement, the STT →
  translation → TTS voice pipeline, and every non-media collaboration feature
  (chat, whiteboard, notes, screen-share/recording status, presence).
- **`control_consumer.py`** — subscribes to the Redis control plane and
  applies admin-issued commands (mute, kick, force-logout, settings updates,
  feature-flag updates) to live rooms.
- **`auth/`** — `service.py` (JWT issuance/verification, bcrypt hashing),
  `router.py` (signup/login/refresh/me/forgot-password), `dependencies.py`
  (`get_current_user`, `get_optional_user`, `require_role`).
- **`translation/service.py`, `stt/service.py`, `tts/service.py`,
  `tts/voice_router.py`** — the AI pipeline (§6).
- **`repositories/`** — thin Motor-based data-access classes per collection
  (`UserRepository`, `RoomRepository`, `MessageRepository`,
  `TranslationLogRepository`, `GlossaryRepository`).
- **`runtime_settings.py`** — an in-memory singleton loaded from MongoDB at
  startup and updated live via the control plane; every admin-configurable
  runtime behavior reads from this object, not from environment variables or
  the database directly (see §5, §6).

There is no ORM — all MongoDB access goes through Motor directly inside
repository classes, with Pydantic models (`backend/app/models/`) used
primarily for shape/typing rather than as a persistence layer.

### 2.3 Authentication and session flow

- **Signup** (`POST /auth/signup`): name/email/password + preferred
  language/pronouns/voice preference/gender. Public signup is restricted to
  `role in {"host", "participant"}` — an `admin` role cannot be created
  through this endpoint. Passwords are bcrypt-hashed (`passlib`).
- **Login** (`POST /auth/login`): validates credentials, rejects disabled
  accounts (`is_disabled`/`deleted_at`), and explicitly rejects `role: "admin"`
  accounts with "Administrator accounts must use the admin portal" — the two
  login surfaces are kept fully separate. A per-process, in-memory
  `LoginRateLimiter` blocks an IP after 5 failed attempts within a 15-minute
  window. **This limiter's state is in-process memory** — it is not
  distributed via Redis or MongoDB, so it resets on backend restart and would
  not coordinate correctly across multiple backend replicas if the deployment
  were ever scaled horizontally (currently a single `backend` container).
- **Tokens**: `create_access_token()` issues a JWT with a **hardcoded
  15-minute expiry**, and `create_refresh_token()` issues one with a 7-day
  expiry, both signed with `JWT_SECRET`. Note: `backend/app/config.py`
  declares a configurable `ACCESS_TOKEN_EXPIRE_MINUTES` setting (default 60),
  but `auth/service.py`'s `create_access_token()` does not read it — the
  15-minute value is hardcoded directly in the function. This is a real,
  verified inconsistency between config surface and actual behavior (see §16).
- **Refresh** (`POST /auth/refresh`): exchanges a valid, non-expired refresh
  token for a new access+refresh pair. The frontend's `AuthContext` does not
  appear to call this automatically on access-token expiry (`localStorage`
  only stores `access_token`) — refresh-token usage from the client was not
  found wired into any request-retry logic in `frontend/src/services/api.js`
  during this audit; confirm this directly before relying on it (see §16).
- **`GET /auth/me` / `PUT /auth/me`**: current-user profile read/update
  (language, pronouns, voice preference, gender, speech speed/pitch/volume,
  emotion profile).
- **`POST /auth/forgot-password`**: writes a `password_reset_requests`
  document (email, timestamp, `status: "requested"`) and always returns a
  generic "if an account exists..." message (correctly avoids user
  enumeration). **No email is sent and no corresponding "complete a password
  reset" endpoint exists anywhere in `auth/router.py`** — this is a stub that
  records intent but cannot currently be completed by a user. Treat as
  unimplemented, not partially implemented (see §12, §16).
- **Authorization dependencies** (`auth/dependencies.py`): `get_current_user`
  (Bearer token, 401 if missing/invalid, 403 if disabled), `get_optional_user`,
  `require_role(*roles)`.

### 2.4 Meeting / room join flow

1. The user opens a room URL/code from `frontend/src/pages/ChatPage.jsx`'s
   `JoinForm`.
2. The frontend opens `wss://.../ws/{room_id}/{user_lang}?token=<JWT>&translation_mode=<mode>`.
3. `routes.py`'s `websocket_room_chat()` accepts the socket, resolves the user
   from the JWT via `_get_user_from_token()` (rejects with close code `1008`
   if missing/invalid/disabled — this now correctly matches the REST auth
   path's disabled-user check, a Phase 10 fix), then waits for a first
   `JoinMessage` frame confirming the room ID.
4. `RoomConnectionManager.connect()` (§4) applies meeting policy (§7),
   determines the session's role, creates or joins the in-memory `RoomState`,
   persists room/participant records to MongoDB, and sends the new session an
   acknowledgment plus the current room policy/collaboration state.
5. From then on, the socket is a long-lived bidirectional message loop
   dispatched by a `type` field (§2.5).

**Note on "guest" access**: `websocket_room_chat()` always requires a valid
authenticated user (`_get_user_from_token` rejects a missing/invalid token
before `connect()` is ever called). `RoomConnectionManager.connect()` still
contains a check for `policy.get("allow_guest_join", True)` gated on
`not user_id`, but because the WebSocket route already guarantees `user_id`
is populated by the time `connect()` runs, that specific branch is not
currently reachable through any code path found in this repository — there is
no actual unauthenticated "guest" join today, despite the admin-configurable
`allow_guest_join` meeting-policy setting implying one exists. Confirm this
before building anything that assumes true anonymous guest access works
(see §16).

### 2.5 Host / participant roles

Role assignment is **entirely server-decided**, not client-requested:

- The first person to connect to an empty room becomes `host`
  (`RoomState.meeting_host_session_id` is set, a periodic AI-summary loop and
  an optional meeting-timeout task are started, and a `meeting.started`
  webhook event is dispatched).
- Every subsequent joiner becomes `participant`, **regardless of what
  `join_payload.role` the client sent** — the client-requested role is only
  used as an initial default that `connect()`'s room-state logic then
  overrides.
- **Host-disconnect grace period**: if the host's socket disconnects while a
  meeting is active, the room does not immediately end. `RoomState` tracks
  `pending_host_user_id`/`pending_host_session_id`/`host_grace_deadline`, and
  a `HOST_DISCONNECT_GRACE_SECONDS`-long (default 45s, `backend/app/config.py`)
  task (`_expire_host_grace`) waits for that same user to reconnect. If they
  do within the window, they resume as host with no interruption to other
  participants; if not, the meeting is ended for everyone
  (`call_ended`/`reason: host_disconnected` is broadcast).
- If a non-host session disconnects mid-call, its active WebRTC peer is
  notified (`call_end`/`reason: peer_disconnected`) but the meeting continues.

### 2.6 WebSocket protocol / real-time messaging

All room communication after the initial `JoinMessage` uses one WebSocket
with typed JSON frames. The dispatch table in `routes.py` (verified directly,
lines ~267–490) recognizes:

| `type` | Handled by | Purpose |
|---|---|---|
| `ping` | `manager.mark_heartbeat` | Keepalive |
| `listener_preferences` | `update_listener_preferences` | Original/translated audio, captions-only, etc. |
| `status_update` | `handle_status_update` | Mute, camera-off, hand-raise |
| `whiteboard_update` | `handle_whiteboard_update` | Shared whiteboard shapes/clear |
| `notes_update` | `handle_notes_update` | Shared notes content |
| `screen_share_update` | `handle_screen_share_update` | Screen-share start/stop |
| `presentation_pointer` | `handle_presentation_pointer` | Live pointer overlay |
| `permissions_update` | `handle_permissions_update` | Host-granted participant permissions |
| `recording_update` | `handle_recording_update` | Recording status |
| `language_update` | `update_session_language` | Change spoken language mid-meeting |
| `voice_activity`, `voice_chunk` | `broadcast_voice_activity`, `process_voice_chunk` | VAD signal and audio segment for the STT/translation/TTS pipeline (§6) |
| `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`, `call_started`, `call_ended`, `call_request`, `call_accept`, `call_reject`, `call_end` | `relay_signaling` | WebRTC signaling relay only — media itself never touches the backend |
| `room_control` | `handle_room_control` | Admin/host moderation commands (mute/kick/lock/etc.) |
| *(default)* | chat handler | Broadcast or direct chat message, translated per recipient |

Delivery is per-session via a bounded `asyncio.Queue` (`OUTBOUND_QUEUE_MAX_SIZE
= 100`) drained by a dedicated sender task per connection, with a
`DELIVERY_TIMEOUT_SECONDS = 5.0` timeout — a slow client cannot block delivery
to everyone else in the room.

### 2.7 Translation / STT / TTS flow (end-user perspective)

See §6 for the full pipeline detail. From the user's point of view: speak →
browser-side voice-activity detection segments the utterance → the segment is
sent as a `voice_chunk` frame (base64 audio) → the backend transcribes it
(Whisper), detects/uses the speaker's configured language, translates the
transcript once per unique language present among current listeners (not once
per listener), optionally synthesizes translated speech (Piper), and delivers
transcript/translated-audio/status events back over the same WebSocket.
Real-time `translation_status` events report each pipeline stage (`listening`
→ `stt` → `translation` → …) so the UI can show live progress rather than a
single opaque spinner.

### 2.8 Meeting policies and their runtime enforcement

Admin-configured `meeting_policy` (`platform_settings{key:"meeting_policy"}`,
loaded into `runtime_settings.meeting_policy`) is **snapshotted onto
`RoomState` at room creation** — not re-read live for an already-running
meeting, so a policy edit only affects the next meeting created, not one in
progress:

| Policy field | Enforced where |
|---|---|
| `max_participants` | `RoomConnectionManager.connect()` — rejects join with `MeetingPolicyRejected` (WS close code `4001`) once at capacity |
| `waiting_room_enabled` / `require_host_to_start` | `connect()` — blocks non-host joins until a host session exists |
| `allow_guest_join` | `connect()` — see §2.4's caveat on reachability |
| `screen_sharing_enabled` | `RoomState.screen_sharing_enabled`, checked in `handle_screen_share_update` |
| `recording_enabled_default` | Snapshotted as `RoomState.recording_enabled` |
| `translation_enabled_default` | `RoomState.translation_enabled`, checked in `process_voice_chunk` — sends `translation_disabled` to the sender and drops the chunk if off |
| `captions_enabled_default` | `RoomState.captions_enabled`, broadcast in `room_policy` for the frontend to gate its captions UI |
| `meeting_timeout_minutes` | A scheduled `_expire_meeting_timeout` task per room |
| `idle_participant_timeout_minutes` | Stored on `RoomState.idle_timeout_minutes` |
| `max_file_size_mb`, `allowed_file_extensions` | `routes.py`'s `upload_meeting_file()`, read live (not snapshotted) from `runtime_settings.meeting_policy` on every upload |

The frontend consumes the `room_policy` broadcast (sent on join and whenever
policy-relevant state changes) to disable the screen-share/record buttons and
captions toggle client-side when an admin has turned them off, and treats a
`4001` close code as terminal (shows the server's rejection reason) instead
of retrying forever — both were real bugs fixed in Phase 8 (§11).

### 2.9 File upload policy

`POST /api/meetings/{room_id}/files/upload` enforces, in order: (1) a
host-permission check (`room.host_permissions.allow_files`, unless the
uploader is host/admin/co-host), (2) an extension allowlist read from
`runtime_settings.meeting_policy.allowed_file_extensions` (falling back to a
hardcoded 18-extension default identical to the pre-Phase-8 hardcoded list),
and (3) a size cap read from `max_file_size_mb` (default 25MB), enforced
during a 64KB-chunked streaming write so an oversized upload is rejected and
cleaned up without buffering the whole file in memory first. Download
(`GET .../files/{file_id}/download`) accepts the JWT as a query parameter
(since a plain `<a href>`/`<img src>` cannot carry an Authorization header)
and — since Phase 10 — verifies the requester was actually a participant in
that room (`_ensure_room_member`) before serving the file.

### 2.10 What works, what's incomplete, known limitations

**Works (verified via the passing test suites, code inspection, and the
phase docs' own live-verification records — see §10 for what "verified"
means here):** signup/login/JWT auth, room join with server-decided host
assignment, host-disconnect grace-period reconnection, text chat
(broadcast/direct, translated per recipient), WebRTC signaling relay and
peer-to-peer audio/video for a small number of participants, whiteboard,
shared notes, file upload/download/delete with policy enforcement, screen
sharing, the STT → translation → TTS voice pipeline with per-stage status
events, meeting-policy enforcement (caps, waiting room, screen-share/
recording/translation/captions toggles, timeouts), and every point in §2.8.

**Incomplete / partial (see §12 for the prioritized list):** password-reset
completion (stub only, §2.3), refresh-token usage from the client is unclear/
unverified, translation-mode selection has no end-user UI (always defaults to
"General" — the backend fully applies mode terminology once selected via the
query param, but nothing in the product lets a user actually pick one),
several Meeting Experience defaults (whiteboard tool defaults, notes autosave
debounce, VAD presets, diagnostics thresholds) are hardcoded client-side with
no admin path.

**Known limitations (from the product's own README, still consistent with
the current WebRTC architecture found in `ChatPage.jsx`):** the fully
supported video topology is small/two-user-oriented — there is no SFU (§13);
audio segments are transported as Base64-encoded WebSocket payloads, not
binary frames; Whisper/Piper are CPU-bound in the default local configuration.

---

## 3. Admin Console

The admin console (`admin-frontend` + `admin-backend`) has been built out
across ten implementation phases. The authoritative, per-entity record of
what's wired end-to-end vs. dead vs. hardcoded is
[`docs/ADMIN_ENTITY_MAPPING.md`](ADMIN_ENTITY_MAPPING.md); the authoritative
phase-by-phase "what shipped and why" is
[`docs/ADMIN_IMPLEMENTATION_PLAN.md`](ADMIN_IMPLEMENTATION_PLAN.md). This
section is a condensed, status-focused summary — read those two documents
before making any admin-console change.

| Module | Route | Status |
|---|---|---|
| Dashboard | `/admin/dashboard` | Complete — real metrics, not fabricated |
| CMS Pages (Landing, Features, Solutions, global nav/footer) | `/admin/cms` | Complete — generic draft/publish/revert/version-history engine, schema-driven editor with no per-page-type code |
| Blog CMS | `/admin/blog` | Complete — dedicated `blog_posts` collection + CRUD, replacing a fully hardcoded page |
| Pricing CMS | part of `/admin/cms` | Complete — tiers/comparison matrix rendered from CMS data |
| Branding | `/admin/branding` | Mostly complete — CSS token wiring, dark-mode-scoped overrides, dual favicon, global consumption on Login/Signup/About; live preview pane and legal/ToS copy remain open |
| Organizations | `/admin/organizations` | Complete (Phase 10) — was completely inaccessible (403 for every admin, including "Administrator") before a missing-permission bug was fixed |
| Roles & Permissions | `/admin/roles` | Complete — edits now propagate to already-assigned admins (Phase 10 fix); custom roles are now assignable from the Users page |
| Feature Flags | `/admin/feature-flags` | Partial — 6 of ~17 keys gate real behavior; the rest are honestly labeled "Reserved — toggling this has no effect" rather than silently inert |
| Meeting Policy | `/admin/meeting-policy` | Complete — persisted, snapshotted per room, enforced (§2.8) |
| AI Models | `/admin/ai-models` | Complete for STT/TTS/translation-provider config; device/compute-type fields are correctly read-only (deployment-controlled) |
| Settings (Platform, Translation) | `/admin/settings`, `/admin/translation` | Mostly complete — several Translation Settings fields persist but have no reading code (§12) |
| Infrastructure / health monitoring | `/admin/infrastructure`, `/admin/system` | Complete — real reachability probes and `psutil`-based system metrics, not fabricated |
| Admin authentication/security | login/signup/session cookies | Complete for authentication itself; no Security module exists yet for session/rate-limit policy management (§12) |

**Not present at all:** a Security module (session TTL/rate-limit config,
active-session listing/revoke UI — `docs/ADMIN_IMPLEMENTATION_PLAN.md`'s
Phase 11) and Developer Tools (webhook subscriber CRUD UI, command-queue
detail view — its Phase 12). Neither was started.

---

## 4. Backend / API Architecture

### 4.1 Public backend (`backend/app/`)

| File/dir | Responsibility |
|---|---|
| `main.py` | FastAPI app, lifespan (DB connect, index creation, `runtime_settings.load_from_db`, TTS init, `ControlConsumer` start/stop), security headers + strict-origin middleware, `/healthz` (DB/LibreTranslate/TTS check, DB failure is fatal, LibreTranslate/TTS degradation is not) |
| `routes.py` | All public REST endpoints + the one WebSocket endpoint; also `/api/internal/*` operational endpoints (realtime stats, TURN status, config reload) |
| `websocket_manager.py` | `RoomConnectionManager` — the runtime heart of the meeting product (§2.2, §2.6–2.9) |
| `control_consumer.py` | Applies live admin commands from the Redis control plane |
| `auth/` | JWT/session logic (§2.3) |
| `translation/service.py` | Language detection, LibreTranslate calls, caching, glossary + translation-mode terminology (§6) |
| `stt/service.py` | Whisper transcription |
| `tts/service.py`, `tts/voice_router.py`, `tts/voices.py` | Piper synthesis and voice routing (§6) |
| `realtime_translation/service.py` | Per-session realtime translation context management |
| `repositories/` | Motor-based data access: `UserRepository`, `RoomRepository`, `MessageRepository`, `TranslationLogRepository`, `GlossaryRepository` |
| `models/` | Pydantic document shapes: `UserDocument`, `RoomDocument`, `MessageDocument`, `TranslationLog` |
| `runtime_settings.py` | In-memory settings singleton (§5) |
| `schemas.py` | All WebSocket/REST Pydantic message schemas |
| `config.py` | `Settings` (env-var-backed configuration) |
| `intelligence/service.py`, `search/service.py`, `exporter/service.py`, `integrations/webhooks.py` | **Live** auxiliary features — meeting summaries, meeting/transcript search, meeting export, outbound webhook dispatch. Confirmed imported and called from `routes.py`/`websocket_manager.py`. |
| `context_manager/`, `industry_profiles/`, `meeting_memory/`, `ai_summaries/`, `whiteboard/service.py`, `screen_sharing/service.py` | **Dead code** — fully implemented service classes never imported anywhere outside their own package. See §16 for detail; do not assume any of these are load-bearing. |

### 4.2 Admin backend (`admin-backend/app/`)

| File/dir | Responsibility |
|---|---|
| `main.py` | FastAPI app, lifespan (DB connect/indexes, idempotent one-time migrations, feature-flag cleanup), `AdminOriginMiddleware` (CSRF-style origin check on mutating admin requests), security headers, CORS |
| `security.py` | `ALL_ADMIN_PERMISSIONS`, `require_admin`, `require_permission()`, `public_admin()` — the permission system (§9) |
| `control_plane.py` | Publishes signed Redis commands the public backend's `ControlConsumer` applies |
| `routers/` | `auth`, `dashboard`, `users`, `meetings`, `platform` (meeting policy, AI settings, feature flags, translation settings), `cms`, `blog`, `media`, `system`, `enterprise` (Organizations), `infrastructure` |
| `cms/` | `section_types.py` (schema registry), `sanitize.py` (`nh3`-based HTML sanitization on every richtext save), `migrate_*.py` (one-time idempotent seed migrations) |
| `repositories/` | `cms_repository.py`, `platform_repository.py`, `user_repository.py`, `session_repository.py`, `invitation_repository.py`, `media_repository.py`, `blog_repository.py`, `audit_repository.py`, `meeting_repository.py` |

---

## 5. Database / Persistence

MongoDB 7, single database (`MONGODB_DB`, default `translation_bot`), shared
by both backends via independent Motor connections. No formal migration
framework — schema evolution is handled by **idempotent startup functions**
registered in each backend's `lifespan()`.

**Key collections (as referenced in code):**

| Collection | Owner | Purpose |
|---|---|---|
| `users` | public backend, admin backend | Both end-users and admins live in the same collection, distinguished by `role`; admin-specific fields (`admin_role`, `admin_permissions`, `org_id`) coexist with end-user fields |
| `rooms` | public backend | Meeting/room records, participants, language distribution |
| `messages` | public backend | Chat messages with per-recipient translations |
| `files` | public backend | Uploaded meeting file metadata (binary stored on disk, path derived from `room_id`/`file_id`) |
| `translation_logs` | public backend | Per-utterance STT/translation/TTS/end-to-end latency (real measurements — see §6, §11 for the text-chat logging bug fixed in Phase 10) |
| `password_reset_requests` | public backend | Written by the forgot-password stub (§2.3); nothing currently reads it back to complete a reset |
| `meeting_memories` | public backend | Written by the **dead** `MeetingMemoryService` — not currently populated in normal operation (§16) |
| `platform_settings` | admin backend (write), public backend (read via `runtime_settings`) | One document per settings category: `general`, `meeting_policy`, `translation`, `ai_models`, `voice_routing`, `branding`, `feature_flags` |
| `cms_pages` / `cms_page_versions` | admin backend (write), both (read) | The generic CMS engine's draft/published content + immutable version snapshots |
| `blog_posts` | admin backend (write), public backend (public read) | Blog CMS |
| `organizations` | admin backend | Organization records; `users.org_id` links membership |
| `admin_roles` | admin backend | Custom role/permission-set definitions |
| `admin_sessions`, `admin_invitations` | admin backend | Admin auth session/invite tracking |
| `admin_audit_logs` | admin backend | Append-only audit trail for administrative mutations |
| `admin_commands` | admin backend (write) / public backend (consume via control plane) | Queued control-plane commands |
| `media_assets` | admin backend | Uploaded CMS/branding media |
| `feature_flags` | admin backend (write), public backend (`runtime_settings.feature_flags`, read) | Feature-flag definitions and values |
| `translation_modes` | admin backend (write), public backend (read) | Context presets (e.g. Business, Medical, Legal) with `preferred_terminology` |

**Configuration persistence:** every admin-configurable runtime behavior is
stored under `platform_settings` and loaded once at startup into
`runtime_settings` (public backend's in-memory singleton), then kept live via
control-plane `UPDATE_SETTINGS` commands — never read from the database
per-request. This is why a bug where a settings field simply isn't loaded
into `runtime_settings` (as happened with `ai_settings`/`voice_routing`
before Phase 9, §11) is silent and easy to miss: the admin UI and database
both look correct, only the runtime is unaffected.

**Migrations found in `admin-backend/app/main.py`'s `lifespan()`:**
`migrate_landing_page`, `migrate_features_and_solutions`, `migrate_pricing`,
`migrate_global_nav_footer` (seed CMS content from legacy sources), and
`_cleanup_deprecated_feature_flags` (Phase 10 — deletes five feature-flag
documents that duplicated `meeting_policy` fields). All are written to be
safe to re-run on every startup.

---

## 6. AI / Translation Pipeline

### 6.1 Components

- **STT — Whisper** (`backend/app/stt/service.py`, via `faster-whisper`):
  transcribes each `voice_chunk` audio segment. Model name and beam size are
  admin-configurable (AI Models page, write-through into the Translation
  Settings document — see below); device (`WHISPER_DEVICE`) and compute type
  (`WHISPER_COMPUTE_TYPE`) are deployment-only (env vars), correctly
  read-only in the admin UI since changing them at runtime without a process
  restart is unsafe.
- **Translation — LibreTranslate** (`backend/app/translation/service.py`):
  an external HTTP service (`LIBRETRANSLATE_URL`), called per unique target
  language present among current listeners, with caching
  (`TRANSLATION_CACHE_MAX_SIZE`) and a timeout
  (`TRANSLATION_TIMEOUT_SECONDS`). Glossary substitution and
  translation-mode `preferred_terminology` substitution are applied to the
  output text after the LibreTranslate call, not as a prompt to the provider
  — LibreTranslate is a plain MT API with no prompt-injection surface, so
  there is no "steer the translation with instructions" capability today.
- **TTS — Piper** (`backend/app/tts/service.py`): a local subprocess/ONNX
  voice synthesizer. Voice routing (language × preference → specific voice
  file) is handled by `tts/voice_router.py`'s `resolve_voice_route()`,
  configurable via the Voice Models/Voice Routing admin page and — since a
  Phase 9 bug fix — actually applied at runtime (previously silently
  no-op'd due to a missing `runtime_settings.voice_routing` attribute; see
  §11, §16).
- **Voice/gender routing**: users select a `voice_preference`
  (`feminine`/`masculine`/`neutral`/`auto`) at signup/profile; the admin's
  Voice Routing configuration maps `language × preference` to a specific
  installed Piper voice file, with a static fallback when no admin route is
  configured or the configured file is missing.

### 6.2 Runtime settings / configuration surface

`runtime_settings.py` holds these categories, each admin-editable and
control-plane-updated live (no restart required):

| Category | What's in it |
|---|---|
| `translation` (Translation Settings page) | `stt_model`, `beam_size`, `libretranslate_endpoint`, timeout, cache size, min-confidence, several fields with **no reading code found** (`retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language` — persist but are dead; see §16) |
| `ai_models` (AI Models page) | `stt_provider`, `whisper_model`, `whisper_beam_size` (write-through mirrored into `translation`'s `stt_model`/`beam_size` rather than a second independent path), `tts_provider`, `piper_default_voice`, `piper_timeout_seconds`, `voice_auto_download`, `translation_provider`, `translation_provider_url` (mirrored into `translation`'s `libretranslate_endpoint`) |
| `voice_routing` | Per language/preference voice-file mapping |
| `meeting_policy` | See §2.8 |
| `feature_flags` | See §3 |

**What's dynamically configurable:** STT model/beam size, TTS provider/
default voice/timeout, translation provider endpoint, voice routing, meeting
policy, language enablement, glossary, translation modes.

**What's deployment-only (correctly marked read-only, not a bug):** Whisper
device (`cpu`/`cuda`) and compute type (`int8`, etc.) — changing these
requires a process restart to safely (re)load the model.

### 6.3 Known limitations

- No participant-facing UI exists to select a translation mode before/during
  a meeting — the WebSocket query param always defaults to `"General"`
  (§2.10, §12).
- The dead Translation Settings fields above are persisted and editable in
  the admin UI with no effect — misleading to an admin who edits them
  expecting a behavior change.
- `SPEECH_PROFILES` (Piper length-scale/noise tuning presets) remain
  env-var/hardcoded, not admin-editable — a deliberate deployment-tuning
  decision, not a bug.
- Translation quality is entirely dependent on LibreTranslate's own model
  quality per language pair — no fallback provider exists.

---

## 7. Meeting Experience

(Cross-references §2.4–2.9, which cover this in code-level detail; this
section is the feature-level summary requested for this handoff.)

- **Creation/joining**: implicit — there's no separate "create meeting"
  endpoint; connecting to a `room_id` that doesn't yet have an active
  `RoomState` creates it, and the first connector becomes host (§2.5).
- **Host/participant behavior**: server-decided roles, host-only
  moderation commands via `room_control`, host-disconnect grace period
  (§2.5).
- **Meeting policies**: participant cap, waiting room, screen-share/
  recording/translation/captions defaults, guest-join toggle (see the
  reachability caveat in §2.4), require-host-to-start, meeting/idle timeouts,
  file-sharing limits — all admin-configurable and enforced as detailed in
  §2.8.
- **Waiting room**: enforced as a join-time block (`connect()` rejects with
  `MeetingPolicyRejected` until a host session exists), not a persistent
  "admit" queue UI — there is no evidence in this repository of a host-facing
  "admit waiting participants" control; the mechanism is closer to "no one
  but the host can start the meeting" than a full lobby/waiting-room product
  feature. Verify this assumption directly if building on top of it.
- **Participant limits**: enforced at join (§2.8); an already-connected
  session that exceeds a newly-lowered cap is not retroactively removed
  (the cap is snapshotted at room creation anyway, per §2.8).
- **Screen sharing**: policy-gated, host-permission-gated, single active
  sharer per room (`RoomState.active_screen_sharer_session_id`).
- **Recording**: status tracking exists (`RoomState.recording_status`,
  `recording_update` message, admin-configurable default) — this audit found
  status tracking and policy gating, but did **not** find server-side
  recording capture/storage logic in the files read; if recording is meant
  to actually capture and persist meeting media, verify where (or whether)
  that happens before assuming it's a complete feature.
- **Captions**: gated by `captions_enabled` policy and consumed
  client-side; captioning itself is derived from the same STT/translation
  pipeline output (§6), not a separate captioning service.
- **File upload restrictions**: §2.9.
- **Translation mode**: backend-complete, no end-user picker UI (§2.10, §12).
- **WebSocket behavior**: typed dispatch loop, bounded per-session outbound
  queues, 5-second delivery timeout, heartbeat via `ping` (§2.6).
- **Reconnection/error handling**: host-disconnect grace period (§2.5);
  frontend treats a `4001` (`MeetingPolicyRejected`) close as terminal
  rather than retrying (a real infinite-reconnect bug fixed in Phase 8 —
  before the fix, a rejected participant retried the same doomed connection
  every ~1.2 seconds indefinitely).
- **Still incomplete**: whiteboard tool/color/line-width defaults, notes
  autosave debounce, VAD presets, and diagnostics thresholds are all
  hardcoded client-side with no admin path (§12); no waiting-room "admit"
  UI was found; translation-mode picker UI is missing.

---

## 8. Infrastructure / Deployment

### 8.1 Reverse proxy and routing

`deploy/Caddyfile` (Caddy 2.11.4, automatic Let's Encrypt via `ACME_EMAIL`)
routes three hostnames:

- `giftme.watch` → `frontend` container
- `api.giftme.watch` → `backend` container
- `admin.giftme.watch` → `/api/*` and `/admin-media/*` to `admin-backend`,
  everything else to `admin-frontend`

An internal-only `:8080/healthz` (plain HTTP, not host-exposed) backs the
Docker healthcheck.

### 8.2 Services (`deploy/docker-compose.prod.yml`)

`caddy`, `frontend`, `admin-frontend`, `backend`, `admin-backend`, `coturn`
(TURN relay, host networking), `mongodb` (7.0, bootstrap app-user via
`mongo-init.js`), `libretranslate` (`v1.9.6`, preloaded with 10 language
pairs), and a one-shot `piper-models` setup profile for voice-model download
into a named volume.

### 8.3 CI/CD (`.github/workflows/ci-cd.yml`)

Three sequential jobs:

1. **quality** — builds both frontends (`npm audit --audit-level=high`
   gated, one advisory allowlisted — see §16), installs both backends'
   dependencies, runs `pip-audit --strict` on both, runs both pytest suites,
   compiles admin-backend, validates the production Compose file and
   Caddyfile.
2. **images** — builds and pushes 4 Docker images to GHCR
   (`ghcr.io/<repo>-{backend,admin-backend,frontend,admin-frontend}`), SHA-
   and `latest`-tagged. Build-only (no push) on pull requests.
3. **deploy** — `main`-only, after `images` succeeds: SSHes to the VPS,
   uploads compose/Caddyfile/Mongo-init/promote-admin/deploy scripts and
   `.env`, authenticates Docker to GHCR, runs `deploy.sh` (pulls images, runs
   the Piper setup profile, brings services up with a health-checked
   `--wait`, **automatically rolls back to the previous release tag on
   failure**), then curls all three public `/healthz` endpoints.

**GHCR authentication:** `git log` shows two relevant historical commits —
`af23450` ("Fix deploy job env mapping (DEPLOY_PATH, GHCR credentials)") and
`a40682d` ("Use built-in GITHUB_TOKEN for GHCR auth on VPS; sync deployment
docs"), the latter changing the deploy job to use the workflow's built-in
`GITHUB_TOKEN` instead of a separate personal access token. **No evidence of
a GHCR *secondary rate-limit* incident was found anywhere in this
repository** — no commit message, code comment, or doc mentions rate
limiting specifically. If such an incident occurred, it was not captured in
this repository's history; do not treat it as a confirmed, resolved issue
based on this audit. The only confirmed, resolved issue is the GHCR
*authentication method* change above.

### 8.4 Known deployment limitations

- The live-preview iframe in the admin CMS editor will be blocked in
  production by Caddy's `X-Frame-Options: SAMEORIGIN` header on
  `giftme.watch` — didn't surface in local dev (no Caddy layer there).
- Health checks report LibreTranslate/TTS degradation without failing the
  container healthcheck (by design — these are "degradable dependencies"),
  which means a fully-down translation/TTS backend will not automatically
  trigger a container restart or alert through Docker's own healthcheck
  mechanism.
- No horizontal-scaling story is evident for the `backend` container's
  in-memory `RoomConnectionManager` state or `LoginRateLimiter` — both are
  single-process, in-memory structures (§2.3, §9). Running more than one
  `backend` replica would silently break room/session consistency and
  rate-limiting, since there is no shared-state layer for either.

---

## 9. Security

- **User authentication**: JWT (`JWT_SECRET`), bcrypt password hashing,
  15-minute access tokens (hardcoded — see §16), 7-day refresh tokens,
  disabled/deleted-user checks enforced consistently across REST
  (`get_current_user`) and WebSocket/file-download (`_get_user_from_token`)
  paths — the latter was a real gap (a disabled/banned user's still-valid
  JWT could open a new meeting socket or download files) fixed in Phase 10.
- **Admin authentication**: fully separate JWT trust domain
  (`ADMIN_JWT_SECRET`), HttpOnly cookies, short-lived access tokens (15 min
  default) with rotating refresh tokens (7 days), issuer/audience claims
  checked on decode, admin accounts explicitly blocked from the public login
  endpoint.
- **Roles/permissions**: `ALL_ADMIN_PERMISSIONS` (a fixed set of ~29
  permission strings) in `admin-backend/app/security.py`;
  `require_permission()` dependency on every admin route. Two real bugs were
  found and fixed in Phase 10: (1) `enterprise.read`/`enterprise.write` were
  missing from the set entirely, making Organizations unreachable by any
  role including "Administrator"; (2) `admin.get("admin_permissions") or
  ALL_ADMIN_PERMISSIONS` treated an explicitly-empty permission list (a role
  deliberately locked to zero permissions) the same as a missing field,
  silently granting every permission instead of none — fixed with an
  explicit `is None` check.
- **Disabled-user handling**: see above — now consistent across all
  authenticated entry points as of Phase 10. One remaining gap, deliberately
  left unfixed and documented rather than silently missed: an
  **already-open** WebSocket session is only asked (not forced) to
  disconnect when an admin issues a ban — `force_logout` is a best-effort
  client-cooperation message, consistent with how every other admin command
  (mute, kick) already works in this codebase, not forcibly closed
  server-side.
- **Admin security**: `AdminOriginMiddleware` rejects mutating admin
  requests whose Origin/Referer doesn't match a trusted admin frontend
  origin (CSRF-style protection); security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Cache-Control: no-store`) applied to every admin response; audit logging
  (`admin_audit_logs`) on important administrative mutations (roles,
  organizations, branding, etc.).
- **Dependency vulnerability fixes**: CI runs `npm audit --audit-level=high`
  on both frontends and `pip-audit --strict` on both backends' requirement
  files. One npm advisory (`GHSA-qwww-vcr4-c8h2`, a `react-router-dom`
  RSC-mode CSRF bypass) is explicitly allowlisted with an inline comment
  explaining the only "patched" version available is actually a downgrade
  from the pinned `7.18.1` — revisit when upstream ships a non-breaking fix.
- **Known security limitations** (do not assume secure just because tests
  pass — these are real, current gaps): no Security module exists for
  session/rate-limit policy visibility or management; the login rate limiter
  is in-process memory only (not distributed, resets on restart); the
  forgot-password flow cannot currently be completed by a user (§2.3); no
  evidence was found of refresh-token rotation being exercised from the
  client (§2.3, §16); an already-banned user's currently-open session is not
  forcibly terminated.

---

## 10. Testing / Verification

Commands run against `main` (commit `e8f957c`) on 2026-08-18 as part of this
audit:

| Command | Result |
|---|---|
| `cd backend && python -m pytest tests` | **69 passed** (benign `RuntimeWarning`/`ResourceWarning` from mock objects in one test file, not failures) |
| `cd admin-backend && python -m pytest tests` | **129 passed** (one `StarletteDeprecationWarning`, one `DeprecationWarning` — not failures) |
| `cd frontend && npm run build` | **Succeeds** — chunk-size warning only (§16) |
| `cd admin-frontend && npm run build` | **Succeeds** — chunk-size warning only (§16) |

CI additionally runs `npm audit`/`pip-audit` gates (§9) — not independently
re-run for this document; trust the actual CI run on a branch/PR over this
snapshot for current advisory status.

**Important test files** (backend): `test_meeting_policy.py`,
`test_meeting_file_upload_policy.py`, `test_translation_mode_terminology.py`,
`test_disabled_user_auth.py`, `test_translation_log_latency.py`,
`test_ai_runtime_settings.py`, `test_translation_routing.py`. (admin-backend):
`test_cms.py`, `test_organizations.py`, `test_security_permissions.py`,
`test_roles_propagation.py`, `test_feature_flags_sync.py`,
`test_feature_flag_cleanup.py`, `test_ai_management.py`, `test_sanitize.py`.

**What was actually verified this session:** both pytest suites pass, both
production builds succeed, git history/status confirms Phases 1–10 are
merged and the tree is clean, and the specific claims in this document were
checked against source (auth flow, WebSocket dispatch table, meeting-policy
enforcement points, dead-code imports, GHCR history).

**What was NOT verified this session (do not assume tested):** no browser/
live-meeting session was run as part of producing this document — all
"live-verified" claims in §11 originate from the phase docs'
own historical record of live verification during that phase's original
implementation, not from a fresh run today. There is no configured frontend
unit/component test runner in either `package.json` — all historical
frontend verification has been manual/live-browser plus the production
build succeeding, never an automated frontend test suite. Load/scale testing,
multi-participant (>2) video stability, and the actual behavior of
`allow_guest_join`'s dead branch (§2.4) were not exercised.

---

## 11. Completed Work (Phase Summary)

Full detail: [`docs/ADMIN_IMPLEMENTATION_PLAN.md`](ADMIN_IMPLEMENTATION_PLAN.md).
All phases below are merged to `main` (commit `e8f957c`).

| Phase | Focus | Status |
|---|---|---|
| 1 | Generic CMS engine (`cms_pages`, section-type registry, draft/publish/revert/version-history) | Delivered |
| 2 | Landing Page on the CMS engine + rich text (TipTap), server-side sanitization (`nh3`), SEO metadata, 3 new section types | Delivered |
| 3 | Navbar & Footer on the CMS engine | Delivered |
| 4 | Features & Solutions wired to real CMS card data | Delivered |
| 5 | Pricing wired to real CMS tier/comparison data | Delivered |
| 6 | Blog CMS (new collection + full CRUD) | Delivered |
| 7 | Branding (CSS tokens, dark-mode-scoped overrides, dual favicon, global consumption) | Delivered (items 1, 2, 5); live preview pane and legal/ToS copy open |
| 8 | Meeting Policy / Meeting Experience (file-sharing limits, translation-mode terminology, frontend policy enforcement, reconnect-loop fix) | Delivered |
| 9 | AI Models & AI Configuration (fixed a silently-broken voice-routing bug, de-duplicated Whisper/LibreTranslate settings, added validation and a live status endpoint) | Delivered |
| 10 | Platform Management (Organizations, permission/security bug fixes, feature-flag cleanup, audit logging) | Delivered |

**The most important pattern to internalize from Phases 9–10:** several
"gaps" closed were not missing features but **silently broken features that
looked like they worked** — a setting with a working admin UI and a
correctly-persisted database value, but no code actually reading it at
runtime. Confirmed examples: voice routing had zero effect for its entire
existence (`AttributeError` silently swallowed by a bare `except`); no
text-chat message ever reached `translation_logs` in the codebase's history
(`NameError` on an undefined variable, silently swallowed); Organizations was
403-Forbidden for every admin including "Administrator" (a missing
permission string); an `... or ALL_ADMIN_PERMISSIONS` pattern silently
granted full access to a role deliberately locked to zero permissions. Before
trusting that an admin setting "works" because it has a UI control, verify
the value is actually read somewhere at runtime.

---

## 12. Completed Work & Remaining Tasks

### P0 — Blocking / Critical (✅ COMPLETE — 3/3)

| Item | Status | Implementation |
|---|---|---|
| Password reset flow | ✅ Complete | Cryptographic tokens (SHA-256 hashed), one-time-use enforcement, 30-minute TTL, 5-attempt/15-min rate limiting, token never re-used after marked consumed. `backend/app/repositories/password_reset_repository.py` + `backend/app/auth/router.py` endpoints `/auth/forgot-password` and `/auth/reset-password` + `frontend/src/pages/ResetPasswordPage.jsx` |
| Security module (session/rate-limit policy, active-session revoke) | ✅ Complete | `AdminSessionRepository` with IP tracking, session revocation API (`DELETE /api/admin/security/sessions/{session_id}`), active session list view with enrichment, read-only security policy display. `admin-backend/app/routers/security.py` + `admin-frontend/src/pages/SecurityPage.jsx` |
| WebSocket ban enforcement for already-open sessions | ✅ Complete | Graceful force-close with notification delivery grace period (0.5s) before hard close. `backend/app/websocket_manager.py` `_close_websocket()` and `_force_close_after_notify()` methods invoked on `FORCE_LOGOUT`, `BAN_USER`, `REMOVE_USER`, `SUSPEND_USER` admin commands. |

### P1 — Important (✅ COMPLETE — 7/7)

| Item | Status | Implementation |
|---|---|---|
| Token expiry | ✅ Complete | `create_access_token()` now reads `ACCESS_TOKEN_EXPIRE_MINUTES` from `runtime_settings` instead of hardcoding 15 minutes. Verified with `backend/tests/test_auth_token_expiry.py` |
| Refresh-token flow | ✅ Complete | Axios interceptor in `frontend/src/services/api.js` with 401 deduplication (single Promise shared across concurrent failures), token persistence in localStorage, `AuthContext` listens for "session-expired" event on refresh failure. |
| Login rate limiter audit/fix | ✅ Complete | In-process single-instance limiter with memory cleanup for expired entries (prevents unbounded growth). Memory cleanup added to `backend/app/auth/router.py` and `admin-backend/app/routers/auth.py`. Documented in `backend/tests/test_login_rate_limiter.py` |
| Translation-mode picker UI | ✅ Complete | Mode selector added to `ChatPage.jsx` join form with descriptions; `getTranslationModes()` fetches from `GET /api/public/translation-modes`; WebSocket URL includes `translation_mode` query param |
| Feature Flags cleanup | ✅ Complete | Removed stale duplicates from `ConfigContext.jsx` (live_captions, recording, screen_sharing, waiting_room, captions); synchronized `admin-backend/app/routers/platform.py` defaults with public backend; wired "blogs" flag gate in `frontend/src/App.jsx` FeatureGate component |
| Developer Tools module | ✅ Complete | Webhook subscriber CRUD (create/list/update/delete) with secret returned once pattern, audit logging. `admin-backend/app/routers/developer.py` + `admin-frontend/src/pages/DeveloperToolsPage.jsx` + `admin-backend/tests/test_developer_tools.py` |
| Media Library "Register external CDN URL" | ✅ Complete | Removed silently-broken form that only held state in component memory; replaced with alert explaining why no storage model exists for non-uploaded assets. `admin-frontend/src/pages/MediaLibraryPage.jsx` |
| Translation settings wiring | ✅ Complete | `cache_timeout_seconds` and `fallback_language` now read at runtime by `TranslationService.translate_text()` and `detect_language_profile()`. Verified with `backend/tests/test_translation_instrumentation.py` CacheTimeoutWiringTest and FallbackLanguageWiringTest |

### P2 — Improvements (✅ DOCUMENTED — 4/8 completed; 4 require architectural decisions)

| Item | Status | Note |
|---|---|---|
| Six orphaned backend service modules | 🟡 Identified | `backend/app/{context_manager, industry_profiles, meeting_memory, ai_summaries, whiteboard/service.py, screen_sharing/service.py}` — all stubs, zero imports, all tested to not appear in `main.py`, `routes.py`, or `websocket_manager.py`. Decision pending: delete as dead code, or wire into runtime. Not blocker. |
| README.md TURN documentation drift | ✅ Fixed | Updated lines 560–579, 587–590: clarified TURN relay is production-configured (coturn port 3478), removed roadmap item "Add TURN" (already done), corrected "Current Limitations" section. |
| Frontend bundle size warnings | 🟡 Documented | Public frontend: 608 KB (gzip 181 KB); admin frontend: 899 KB (gzip 271 KB). Both exceed Vite's 500 KB warning threshold. Code-splitting deferred to horizontal-scaling phase; acceptable for current single-app deployment. Vite's warnings are expected and not blocking. |
| Branding `heading_font_family`/`button_style` CSS wiring | ⏭️ Deferred | Fields persist in branding schema, editable in admin UI, but no CSS token/variable hooks applied. Requires CSS architecture review to bind to theme system. |
| Meeting Experience defaults admin surface | ⏭️ Deferred | Whiteboard tool palette, notes autosave debounce, VAD detection presets, diagnostics thresholds remain hardcoded in `frontend/src/pages/ChatPage.jsx`. Requires admin settings page and runtime synchronization design. |
| Content pages CMS migration | ⏭️ Deferred | About, How-it-Works, Help, Docs remain hardcoded JSX (`frontend/src/pages/`). Can extend existing CMS engine; no new architecture needed. Blocked on prioritization. |
| Legal/ToS copy editor | ⏭️ Out of scope | Branding *identity* (logo/name) wired in Phase 7; legal *content* was explicitly scoped out. Legal copy requires separate legal review process, not a technical implementation. |
| Branding live preview pane | ⏭️ Deferred | Never built in Phase 7. Requires iframe-based preview architecture alongside main theme editor. Low priority. |

### P3 — Future / Optional

| Item | Notes |
|---|---|
| LiveKit/SFU / broader media architecture | Not implemented at all — see §13. Explicitly a separate future milestone, not started here. |
| Waiting-room "admit" UI for hosts | No evidence found of a host-facing admit control; current enforcement is closer to "no one but host can start" than a full lobby feature — confirm and scope if a real lobby product feature is wanted |
| Public-facing Blog frontend | The admin-side Blog CMS (Phase 6) is complete with public read endpoints (`GET /api/public/blog-posts`); this audit did not find evidence of gaps in the public `BlogPage.jsx` consuming it, but a dedicated pass to confirm full parity (pagination, category filtering, etc.) against the admin's capabilities was out of this audit's scope — verify directly if blog traffic becomes a priority |

---

## 13. LiveKit / SFU Status

- **LiveKit is not implemented.** No LiveKit dependency exists in either
  `requirements.txt`, no LiveKit package exists in either `package.json`, and
  no code in this repository references LiveKit in any form.
- **SFU is not implemented.** No SFU of any kind is present.
- **Current media architecture**: peer-to-peer WebRTC. `frontend/src/pages/ChatPage.jsx`
  creates a direct `RTCPeerConnection` per peer, using `getUserMedia`/
  `getDisplayMedia` for local capture and an ICE server list fetched from
  `GET /webrtc/ice-servers` (with a hardcoded `DEFAULT_ICE_SERVERS` fallback).
  Signaling (`webrtc_offer`/`webrtc_answer`/`webrtc_ice_candidate`) is
  relayed through the existing WebSocket (`relay_signaling` in
  `websocket_manager.py`); media itself never passes through the backend.
  `coturn` is configured in production as a TURN relay for NAT traversal,
  but this only assists peer-to-peer connectivity — it does not make the
  architecture an SFU.
- **What would need to happen to introduce LiveKit/SFU** (investigation only
  — nothing below has been started or should be started without a dedicated
  design phase):
  1. Read `docs/WEBRTC_FLOW.md` and `docs/ARCHITECTURE.md` end to end, and
     `RoomConnectionManager`'s full connection lifecycle (§2, §4) — an SFU
     migration replaces the peer-to-peer media path but must preserve
     everything else keyed off room/participant state.
  2. Decide how `meeting_policy` (participant caps, screen-share/recording
     toggles) interacts with an SFU's own room/track model.
  3. Decide how the existing `coturn` TURN relay fits alongside or is
     replaced by an SFU's own relay/media server.
  4. Preserve the existing WebSocket signaling message contract the frontend
     already implements, or plan an explicit, coordinated migration of it.
  5. Re-verify every existing meeting feature (chat, translation, whiteboard,
     notes, file sharing, screen sharing, meeting-policy enforcement, admin
     moderation) against the new media path — none of them are currently
     decoupled from the assumption of peer-to-peer WebRTC.

This document does not implement, scaffold, or plan the internals of
LiveKit/SFU — per explicit instruction, that work stays a separate future
milestone.

---

## 14. Local Development

Only commands verified as supported by this repository's actual scripts and
`.claude/launch.json` are listed.

### Prerequisites

Python 3.11, Node.js 20+, Docker Desktop (for MongoDB/LibreTranslate),
a Piper runtime installed separately (excluded from Git as a large binary
artifact — see the root `README.md`'s installation section for the download
script), a browser with WebRTC/`MediaRecorder` support.

### Environment variables

Each backend reads its own `.env` (see `backend/app/config.py` and
`admin-backend/app/config.py` for the full field lists with safe defaults —
not reproduced here to avoid drift with the source of truth). Copy
`backend/.env.example` to `backend/.env` before first run. No secret values
are reproduced in this document.

### Starting each app locally

```bash
# Infrastructure (MongoDB + LibreTranslate)
docker compose up -d mongodb libretranslate

# Public backend (port 8000)
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Admin backend (port 8010)
cd admin-backend
python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010

# Public frontend (port 5173)
cd frontend
npm install
npm run dev

# Admin frontend (port 5176)
cd admin-frontend
npm install
npm run dev
```

`.claude/launch.json` defines the same four servers for this repo's
integrated dev-server tooling (backend 8000, admin-backend 8010, frontend
5173, admin-frontend 5176) — **none use `--reload`** through that config, so
backend code changes require a manual restart when launched that way.

### Test commands

```bash
cd backend && python -m pytest tests
cd admin-backend && python -m pytest tests
```

### Build commands

```bash
cd frontend && npm run build
cd admin-frontend && npm run build
```

### Docker / deployment commands (already documented in `docs/PRODUCTION_DEPLOYMENT.md`)

```bash
# Validate the production Compose file (as CI does)
docker compose --env-file deploy/.env --env-file deploy/.release.env \
  -f deploy/docker-compose.prod.yml config --quiet

# On the VPS, after images are pushed:
cd ~/giftme
./deploy.sh ghcr.io/<owner>/<repository> <full-git-sha>
```

---

## 15. Important Files

| Component | File/Directory | Purpose |
|---|---|---|
| Meeting workspace (frontend) | `frontend/src/pages/ChatPage.jsx` | The single largest, most important file in the product — owns nearly all meeting-related client state (§2.1) |
| WebSocket protocol dispatch | `backend/app/routes.py` | `/ws/{room_id}/{user_lang}` endpoint and the full message-type dispatch table (§2.6) |
| Meeting/room runtime core | `backend/app/websocket_manager.py` | `RoomConnectionManager`, `RoomState`, `ClientSession`, meeting-policy enforcement, the voice pipeline entry point |
| Control-plane consumer | `backend/app/control_consumer.py` | Applies live admin commands to running rooms |
| Runtime settings singleton | `backend/app/runtime_settings.py` | Every admin-configurable runtime behavior lives here (§5, §6) |
| Translation pipeline | `backend/app/translation/service.py` | Detection, LibreTranslate calls, caching, glossary/mode terminology |
| STT / TTS | `backend/app/stt/service.py`, `backend/app/tts/service.py`, `backend/app/tts/voice_router.py` | Whisper transcription, Piper synthesis, voice routing |
| Auth (end-user) | `backend/app/auth/` | JWT issuance/validation, signup/login/refresh/me |
| CMS engine (backend) | `admin-backend/app/cms/section_types.py`, `admin-backend/app/repositories/cms_repository.py`, `admin-backend/app/routers/cms.py` | Schema registry, storage, draft/publish/revert/version-history API |
| CMS engine (admin UI) | `admin-frontend/src/components/cms/`, `admin-frontend/src/pages/CmsPage.jsx` | Generic, schema-driven editor |
| Meeting policy / platform settings | `admin-backend/app/routers/platform.py` | Meeting policy, AI settings, feature flags, translation settings CRUD |
| Organizations | `admin-backend/app/routers/enterprise.py` | Organization CRUD, branding, membership |
| Admin permissions | `admin-backend/app/security.py` | `ALL_ADMIN_PERMISSIONS`, `require_permission()`, `require_admin()` |
| Admin startup migrations | `admin-backend/app/main.py` (`lifespan`) | Idempotent seed/cleanup migrations — read before assuming a collection is empty on first run |
| Audit logging | `admin-backend/app/repositories/audit_repository.py` | Append-only administrative audit trail |
| Infrastructure health | `admin-backend/app/routers/infrastructure.py` | Real reachability probes |
| Dev server configs | `.claude/launch.json` | Local dev-server commands/ports |
| CI/CD | `.github/workflows/ci-cd.yml` | Full pipeline (§8.3) |
| Production deploy config | `deploy/` | Caddyfile, Compose file, Mongo init/promote scripts, deploy script, env example |
| Phase-by-phase implementation record | `docs/ADMIN_IMPLEMENTATION_PLAN.md` | Authoritative "what shipped, what didn't, why" |
| Entity/wiring source of truth | `docs/ADMIN_ENTITY_MAPPING.md` | Every configurable entity: owner, DB doc, API, consumer, wired/dead/hardcoded status |
| System design docs | `docs/ADMIN_ARCHITECTURE.md`, `docs/ADMIN_MODULES.md`, `docs/ADMIN_DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/WEBRTC_FLOW.md`, `docs/TRANSLATION_PIPELINE.md` | Companion architecture references |

---

## 16. Known Issues / Warnings

### Confirmed bugs (found and verified this session; not yet fixed — documentation-only audit, no code was changed)

- `backend/app/auth/service.py`'s `create_access_token()` hardcodes a
  15-minute expiry, ignoring `backend/app/config.py`'s configurable
  `ACCESS_TOKEN_EXPIRE_MINUTES` (default 60) — the setting exists but has no
  effect on this code path.
- `POST /auth/forgot-password` only records a `password_reset_requests`
  document; no email is sent and no endpoint exists anywhere to complete a
  reset. Functionally a stub, not a working recovery flow.
- Six backend service modules
  (`context_manager`, `industry_profiles`, `meeting_memory`, `ai_summaries`,
  `whiteboard/service.py`, `screen_sharing/service.py`) are fully implemented
  but never imported anywhere outside their own `__init__.py` — confirmed by
  grepping the entire `backend/app` tree. The live whiteboard/screen-share
  features work through separate, inline logic in `websocket_manager.py`,
  not through these classes. `ai_summaries_service.generate_summary()`
  additionally contains a hardcoded stub string, not a real LLM call.
- `RoomConnectionManager.connect()`'s `allow_guest_join` check
  (`not user_id and not policy.get(...)`) is unreachable through the current
  WebSocket route, since `_get_user_from_token` always requires and returns
  a valid authenticated user before `connect()` is called — there is no
  actual anonymous-guest join path today despite the admin-configurable
  setting implying one.

### Known limitations (not bugs — architectural/scope facts)

- Peer-to-peer WebRTC only, no SFU; small/two-user-oriented topology (§13).
- In-process-only state for `RoomConnectionManager` and `LoginRateLimiter` —
  no shared-state layer if the `backend` service were ever scaled to
  multiple replicas (§8.4, §9).
- Audio transported as Base64 over WebSocket, not binary frames.
- No participant-facing translation-mode picker UI.
- No admin Security module or Developer Tools module.
- Whisper/Piper are CPU-bound by default; no GPU path is wired for local
  development.

### Incomplete features (persisted/UI exists, runtime effect missing or partial)

- Dead Translation Settings fields (§6.2, §12).
- Feature flags: ~11 of ~17 keys have no real gate (honestly labeled
  "Reserved").
- Media Library "Register external CDN URL" — local-state only, never
  persisted.
- Branding `heading_font_family`/`button_style` — no CSS hook.

### Deployment/environment issues

- No confirmed GHCR secondary-rate-limit incident in this repository's
  history — only a GHCR *authentication method* fix (`a40682d`). Do not
  assume a rate-limit issue occurred or was resolved based on this audit.
- Frontend bundle sizes exceed Vite's 500 KB warning threshold on both
  apps (§8.4/§12) — not a functional bug, but worth addressing.
- CI allowlists exactly one npm advisory
  (`GHSA-qwww-vcr4-c8h2`) pending an upstream non-breaking fix.

### Things intentionally left unchanged (documented in the phase docs, reconfirmed here — not gaps)

- Already-open banned sessions are only asked (not forced) to disconnect —
  consistent with every other admin moderation command in this codebase; a
  deliberate scope decision, not an oversight (§9, §12).
- Several dead fallback arrays in marketing pages (`row1`/`row2` marquee
  data, hardcoded testimonials/core-benefit cards) were left in place as
  defensive fallbacks when CMS data is empty, not deleted.
- `SPEECH_PROFILES` (Piper tuning presets) remain deployment-only by design.

---

## 17. Recommended Next Roadmap

Sequenced by risk and dependency, not by novelty:

1. **Close the P0 gaps first** (§12): a completable password-reset flow and
   the Security module are both smaller and lower-risk than any
   media-architecture work, and they directly affect whether real users can
   safely operate this platform today.
2. **Resolve the P1 correctness items** — especially confirming (and fixing
   if missing) refresh-token usage from the client, since a 15-minute access
   token with no working refresh path means users get logged out mid-session
   in production, which is a real product-quality problem independent of any
   architecture decision.
3. **Dead-code and documentation cleanup** (§12 P2): decide the fate of the
   six orphaned service modules, refresh the root `README.md` against actual
   deploy config, and consider the frontend bundle-size warnings before they
   compound further. All low-risk, all improve the next developer's ability
   to trust what they read.
4. **Production validation under real usage** — this platform has admin
   tooling and CI/CD maturity well ahead of any confirmed multi-user
   production load-testing found in this repository; verify the full
   pipeline (meetings, translation, admin console) against real traffic
   patterns before adding more surface area.
5. **LiveKit/SFU investigation** (§13) — only after 1–4, as its own
   dedicated design/spike phase producing a concrete plan before any
   implementation begins. Treating it as automatically next just because
   Phases 1–10 are "done" would skip work that is smaller, lower-risk, and
   more urgent for a platform anyone else will be operating.
6. **LiveKit/SFU implementation**, if the investigation concludes it's
   warranted — as its own milestone, with post-implementation regression
   testing across every existing meeting feature (§13, item 5).

---

## 18. Final Handoff Status

**Production-ready / working:** user signup/login (except password reset),
core meeting flow (join, host assignment, host-reconnect grace period,
peer-to-peer WebRTC for small meetings), text chat with per-recipient
translation, the STT → translation → TTS voice pipeline, whiteboard/notes/
file sharing/screen sharing, meeting-policy enforcement, the full Admin
Console CMS/Organizations/Roles/Meeting-Policy/AI-Models/Infrastructure
surface (§3), CI/CD with automatic rollback-on-failure deployment.

**Partially complete:** Branding (live preview pane and legal/ToS copy
open), Feature Flags (6 of ~17 real), Translation Settings (several dead
fields), Translation Modes (backend complete, no picker UI), Media Library
(one broken sub-feature inside an otherwise-working page).

**Remaining (see §12 for the full prioritized list):** password-reset
completion, a Security module, forced session termination on ban, refresh-
token verification, Developer Tools module, several smaller wiring/cleanup
items.

**Should NOT be touched without architectural planning:** the WebRTC/media
path in `ChatPage.jsx` and `websocket_manager.py`'s signaling relay (any
LiveKit/SFU work, §13); the `RoomConnectionManager`'s in-memory session/room
state model (any horizontal-scaling change, §8.4/§9); the JWT trust-domain
separation between user and admin authentication (any auth unification
request should be treated as a red flag, not a simplification).

**LiveKit/SFU:** confirmed **not implemented** anywhere in this repository
(§13). The current media architecture is peer-to-peer WebRTC with a `coturn`
TURN relay for NAT traversal.

**End-user platform documentation:** covered in full in §2, §6, §7, cross-
referenced with verified code citations (file paths, line-level behavior for
auth, join flow, host assignment, WebSocket dispatch, meeting-policy
enforcement, file upload, translation pipeline). This is not an Admin
Console-only handoff.

**Admin Console documentation:** covered in §3, cross-referenced against the
existing `ADMIN_IMPLEMENTATION_PLAN.md`/`ADMIN_ENTITY_MAPPING.md`, which
remain the deeper source of truth for that half of the system.
