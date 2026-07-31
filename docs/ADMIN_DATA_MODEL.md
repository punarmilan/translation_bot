# VOXO Admin Console — Data Model Reference

Full inventory of MongoDB collections, the Pydantic models that touch them, and the repositories that own them, as they exist today — plus the new collections required to close the gaps in [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md). One MongoDB database (`translation_bot` / `MONGODB_DB`) is shared by both backends.

Companion documents: [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) · [ADMIN_MODULES.md](ADMIN_MODULES.md) · [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md) · [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md)

---

## 1. Existing collections

| Collection | Owning repository | Written by | Read by | Purpose |
|---|---|---|---|---|
| `users` | `UserRepository` (backend) / `AdminUserRepository` (admin-backend) | Signup, admin Users module | Auth, WS join, Users module, meeting/translation activity lookups | Account records: name, username, email, password hash, role, preferred_language, pronouns, voice_preference, gender, online status |
| `rooms` | `RoomRepository` (backend) / `AdminMeetingRepository` (admin-backend) | Room create/join/end | Meetings module, analytics | Meeting room documents: room_id, name, host_id, participants, translation_mode, active state, voice/translation stats |
| `messages` | `MessageRepository` | Chat send | Meetings export, replay timeline | Persisted chat messages (room_id, sender, text, translations, delivery_mode, timestamp) |
| `translation_logs` | `TranslationLogRepository` | Translation pipeline | Meetings logs, Analytics, Users activity | Per-translation-event record (room_id, languages, success, cache_hit, latency) |
| `glossaries` | `GlossaryRepository` | Translation module (future) | Translation pipeline | Term-substitution entries per target language |
| `feature_flags` | `PlatformRepository` (generic) | Feature Flags module | `runtime_settings.load_from_db`, public `/api/public/feature-flags` | Boolean flag records `{key, enabled}` |
| `platform_settings` | `PlatformRepository` (generic, keyed docs) | Translation / System / Branding modules | `runtime_settings.load_from_db` | Keyed settings blobs: `translation`, `general`, `branding`, `voice_routing` |
| `platform_languages` | `PlatformRepository` (generic) | Languages module | `runtime_settings.load_from_db`, public `/api/public/languages` | Per-language display metadata + per-capability enable flags |
| `voice_models` | `PlatformRepository` (generic) | Voice Models module (`/voices/scan`) | Voice routing resolution (once fixed) | Scanned Piper voice metadata (file path, inferred gender/language/quality) |
| `landing_sections` | `PlatformRepository` (generic) | Page Builder / Content module | `runtime_settings.load_from_db`, public `/api/public/page-builder` | Ordered landing-page section/card documents |
| `admin_content` | `PlatformRepository` (generic) | Content module | Public `/api/public/content` | Generic keyed content sections (title/body/items), one doc per page key |
| `translation_modes` | `PlatformRepository` (generic) | Translation module | Public `/api/public/translation-modes` (currently unreachable from the meeting UI — see gap analysis) | Named translation-mode catalog (General/Business/Education/…) |
| `announcements` | `PlatformRepository` (generic) | (to be moved to Content module) | Public read | Site announcement/banner records |
| `feedback` | `PlatformRepository` (generic) | Public feedback form, admin triage | Feedback module | User-submitted feedback tickets with status/assignee/reply thread |
| `admin_roles` | `PlatformRepository` (generic) | Roles & Permissions module | `require_permission` on every guarded route | Role → permission-set mapping |
| `admin_sessions` | `AdminSessionRepository` | Admin login/refresh/logout | `require_admin` | Refresh-token rotation/revocation records (TTL-indexed) |
| `admin_invitations` | `AdminInvitationRepository` | Roles module invite flow | Admin registration | Single-use, expiring admin-invite tokens (TTL-indexed) |
| `admin_audit_logs` | `AuditRepository` | Every admin mutation | Audit Logs module | Immutable action trail: actor, action, target, metadata, timestamp |
| `admin_bootstrap` | (direct) | First-admin registration | First-admin registration | Atomic single-document claim preventing a bootstrap race |
| `media_assets` | `MediaRepository` | Media Library module | Every content/branding editor | Uploaded/replaced asset metadata (checksum, dimensions, folder) + filesystem storage |
| `organizations` | (direct, `enterprise.py`) | Organizations module | Organizations module, future org-scoped features | Org records; unique domain constraint |
| `admin_commands` | `AdminMeetingRepository` | Meetings/Users moderation actions | Durable audit trail alongside the Redis round-trip | Record of dispatched moderation commands (not the delivery mechanism itself — see Architecture §4) |
| `recordings` | (direct, `meetings.py`) | Recording pipeline | Meetings module | Recording session metadata |
| `meeting_summaries` | (direct, `meetings.py`) | AI summary pipeline | Meetings module | Generated meeting summary documents |
| `webhooks` | `WebhookManager` (backend) | **Nothing today** — no admin endpoint exists | `dispatch_event()` on `meeting.started`/`meeting.ended` | External webhook subscriber records (url, secret, subscribed events) |
| `cms_pages` *(Phase 1, new)* | `CmsRepository` | Pages module (`/admin/cms`) | `/api/admin/cms/*`, `/api/public/cms/pages/{page}` (mirrored in `backend/app/routes.py`) | Generic page-agnostic CMS: one doc per page key with `draft`/`published` section lists side by side and a `version` counter |
| `cms_page_versions` *(Phase 1, new)* | `CmsRepository` | Written automatically on every publish | `/api/admin/cms/pages/{page}/versions` | Immutable per-publish snapshot (page, version, sections, published_by, published_at) for future rollback UI |

## 2. New collections required to close gap-analysis findings

| New collection | Owning module | Replaces | Purpose |
|---|---|---|---|
| `meeting_policy_defaults` | Meeting Experience | The 3 hardcoded copies of `RoomState.host_permissions` defaults | Single DB-backed source for default host permissions, default layout, default translation mode applied to every newly created room |
| `workspace_experience_settings` (or a new `platform_settings` key, e.g. `key: "workspace"`) | Meeting Experience | Hardcoded VAD presets, diagnostics thresholds, whiteboard defaults, notes debounce, file-sharing limits/extensions | Admin-editable versions of every constant enumerated in Gap Analysis Part B.4 |
| `blog_posts` | Content (Blogs) | Hardcoded `articles` object in `BlogPage.jsx` | Blog post documents: title, slug, body, author, category, published date, draft/published state |
| New `admin_content` keys (`site.faqs`, `site.testimonials`, `pricing.plans`, `features.page.items`, `solutions.page.items`) | Content | Hardcoded arrays audited in Gap Analysis Part A | Reuses the existing generic `admin_content` shape — no new collection needed, just new keys and frontend consumers that actually read `items`/`cards` |
| New `platform_settings` key (`key: "ai_models"`) | AI Models | Env-var-only Whisper/Piper tuning (`WHISPER_BEAM_SIZE`, `SPEECH_PROFILES` dict) | Admin-editable STT/TTS model behavior, reusing the existing keyed-document pattern |
| New `platform_settings` key (`key: "security"`) | Security | Env-var-only session/cookie/rate-limit config | Admin-visible (and selectively editable) session TTLs, cookie policy, rate-limit thresholds |

Note that most new needs are **new keys in the existing generic `admin_content`/`platform_settings` collections**, not new collections — consistent with the instruction to prefer reusable models over duplicate structures. Only `meeting_policy_defaults` and `blog_posts` warrant a dedicated collection, because they have query patterns (applied-at-room-creation-time; listed/paginated/slugged) distinct from a flat settings blob.

## 3. Pydantic models (backend, non-MongoDB — WebSocket/API schemas)

`backend/app/schemas.py` defines the WebSocket message contract, unaffected by this project except where new settings need to flow into `ConnectionAckMessage`/`room_policy` broadcasts (e.g. meeting policy defaults, once added, should be included in the ack payload alongside today's `host_permissions`).

`backend/app/models/*.py` defines the four persisted-document shapes: `UserDocument`, `RoomDocument`, `MessageDocument`, `TranslationLogDocument` — all unaffected by this project; no new top-level document types are needed beyond `meeting_policy_defaults` and `blog_posts` above.

## 4. Settings currently duplicated across env vars, code constants, and the DB

These should each resolve to **one** source of truth once migrated — DB-backed, with the env var/code constant becoming only the seed default, never a parallel live source:

| Setting | Currently lives in | Target |
|---|---|---|
| Translation timeout/cache-size/confidence | Both `backend/app/config.py` (env) and `backend/app/translation/service.py` module constants (env) **and** `platform_settings.translation` (DB) | DB only; env vars become first-run seed values |
| Whisper model/device/compute-type/beam-size | `backend/app/stt/service.py` env constants, partially shadowed by DB | AI Models module, DB-backed |
| Speech profile parameters | `backend/app/tts/service.py` hardcoded dict + per-field env overrides | AI Models module, DB-backed |
| Voice preference options | Hardcoded independently in `voice_router.py` and `ProfilePage.jsx` | Voice Models module, DB-backed, one list consumed by both |
| Language display list | Hardcoded independently in `SignupPage.jsx`, `ProfilePage.jsx`, prose in 3 other pages | Already DB-backed via `platform_languages` — just needs every hardcoded copy removed in favor of the existing `/api/public/languages` fetch |
| File size limit / allowed extensions | Hardcoded independently in `routes.py` and `FilesPanel.jsx` | `workspace_experience_settings`, DB-backed, one value consumed by both frontend and backend validation |
