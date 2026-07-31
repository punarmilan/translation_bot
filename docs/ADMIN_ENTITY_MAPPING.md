# VOXO Admin Console — Single Source of Truth Entity Mapping (Task 3)

For every configurable element found in the audit: which admin page owns it, which database document stores it, which API updates it, and which frontend consumes it. **Status** reflects today's reality per [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md):
✅ = fully wired end-to-end · ⚠️ = admin/DB path exists but doesn't reach the runtime (dead) · ❌ = no admin path exists at all (hardcoded)

Companion documents: [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) · [ADMIN_MODULES.md](ADMIN_MODULES.md) · [ADMIN_DATA_MODEL.md](ADMIN_DATA_MODEL.md) · [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md)

---

## Content & Branding

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Landing page hero/eyebrow/title/body | Content | `admin_content{key:"landing.hero"}` | `GET/PATCH /api/admin/content/landing.hero` | `LandingPage.jsx` → `HeroSection.jsx` | ✅ |
| Landing page CTA button labels | Content *(new field)* | `admin_content{key:"landing.hero"}` | same | `HeroSection.jsx` (currently hardcoded, ignores `cms`) | ❌ |
| Landing marquee/showcase feature cards | Content | `landing_sections` (Page Builder cards) | `GET/POST /api/admin/page-builder` | `LandingPage.jsx` (`row1`/`row2` fallback today) | ❌ |
| Core benefit cards | Content | `landing_sections` cards | same | `LandingPage.jsx` `CoreBenefits` | ❌ |
| Testimonials | Content *(new content type)* | `admin_content{key:"site.testimonials"}` or `landing_sections` cards | `PATCH /api/admin/content/site.testimonials` | `TestimonialsSection.jsx` (hardcoded 4 today) | ❌ |
| FAQs | Content | `admin_content{key:"site.faqs"}` | `PATCH /api/admin/content/site.faqs` | `FAQ.jsx` — **only** `LandingPage.jsx` passes it; `AboutPage.jsx`/`HelpPage.jsx` don't | ⚠️ (partial) |
| Features page body + capability/flagship cards | Content | `admin_content{key:"features.page"}` (`items` field unused) | `PATCH /api/admin/content/features.page` | `FeaturesPage.jsx` (only title/body read) | ⚠️ (partial) |
| Solutions page body + solution cards | Content | `admin_content{key:"solutions.page"}` (`items` unused) | same pattern | `SolutionsPage.jsx` (only title/body read) | ⚠️ (partial) |
| Pricing tiers, comparison matrix | Content *(new field)* | `admin_content{key:"pricing.page"}` (fetched, never rendered) | `PATCH /api/admin/content/pricing.page` | `PricingPage.jsx` | ❌ (dead fetch) |
| Blog posts | Blogs (Content) | `blog_posts` *(new collection)* | New `GET/POST/PATCH/DELETE /api/admin/blog-posts` + public `GET /api/public/blog-posts` | `BlogPage.jsx` (fully hardcoded today) | ❌ |
| About/How-it-works/Help/Docs page copy | Content | `admin_content` (one key per page) | `PATCH /api/admin/content/{key}` | Respective pages (fully hardcoded today) | ❌ |
| Auth page copy + legal/ToS/privacy links | Content *(new keys)* | `admin_content{key:"auth.login"}`/`{key:"auth.signup"}` | same pattern | `LoginPage.jsx`, `SignupPage.jsx` (absent today) | ❌ |
| Footer links, tagline, legal line | Branding + Content | `platform_settings{key:"branding"}` (tagline/legal) + `admin_content{key:"site.footer"}` (links) | `PATCH /api/admin/settings/branding`, `PATCH /api/admin/content/site.footer` | `Footer.jsx` — only reads `cms` on the landing page path | ⚠️ (partial) |
| Navbar links, brand mark/logo | Branding | `platform_settings{key:"branding"}` | `GET /api/public/branding` | `Navbar.jsx` (hardcoded "VX"/"VOXO" text, ignores `branding.logo_url`) | ❌ |
| Company name/email/contact info | Branding | `platform_settings{key:"branding"}` (`company_name`/`company_email` already exist) | `GET /api/public/branding` | `AboutPage.jsx`, `Footer.jsx` (both hardcode their own copy instead) | ⚠️ (fields exist, unused) |
| Accent/primary/secondary color, font, border radius | Branding | `platform_settings{key:"branding"}` | `PATCH /api/admin/settings/branding` | `ConfigContext.applyThemeTokens` → CSS vars; **only accent color is actually read by `tailwind.config.js`/`styles.css`** | ⚠️ (partial — 4 of 5 fields dead) |
| Theme (light/dark) default | Branding / System | `platform_settings{key:"general", "key:"branding"}` (`theme` field) | `GET /api/public/settings` | Fetched into `ConfigContext.settings.theme`, never applied — `ThemeContext.jsx` is 100% client-preference-driven | ⚠️ (dead) |
| SEO metadata (meta description, keywords, OG/Twitter image) | Branding | `platform_settings{key:"branding"}` | `GET /api/public/branding` | Not verified consumed in `<head>` tags — needs confirmation during implementation | ⚠️ (needs verification) |

## Media

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Uploaded images/video/asset metadata | Media Library | `media_assets` | Full CRUD + transform under `/api/admin/media` | Every content/branding editor's image picker | ✅ |
| "Register external CDN URL" asset | Media Library | *(currently local-state only — not persisted)* | None wired | `MediaLibraryPage.jsx` | ❌ (broken) |

## Users, Organizations, Roles

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| User accounts, roles, status | Users | `users` | Full CRUD under `/api/admin/users` | `Navbar`/`ProfilePage` (self-service), admin Users list | ✅ |
| Organization records | Organizations | `organizations` | `GET/POST /api/admin/enterprise/organizations` | *(no admin-frontend page yet)* | ⚠️ (backend only) |
| Roles & permission sets | Roles & Permissions | `admin_roles` | Full CRUD under `/api/admin/roles` | Every `require_permission`-guarded route (server-side only — no admin-frontend page reads its own permissions) | ⚠️ (server-enforced, not UI-enforced) |
| Admin invitations | Roles & Permissions | `admin_invitations` | `POST /api/admin/auth/invitations` | Admin signup flow | ✅ |

## Meetings & Meeting Experience

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Live meeting moderation (mute/kick/promote/lock/end/etc.) | Meetings | *(no persistence — control-plane command)* | `POST /api/admin/meetings/{room_id}/command` | `ChatPage.jsx` WS message handling | ✅ |
| Meeting records, participants, logs, recordings | Meetings | `rooms`, `messages`, `translation_logs`, `recordings` | `GET /api/admin/meetings/*` | Meetings module only (not public-facing) | ✅ |
| Default host permissions for new rooms | Meeting Experience *(new)* | `meeting_policy_defaults` *(new collection)* | New `GET/PATCH /api/admin/meeting-experience/policy-defaults` | `websocket_manager.py` `RoomState` initialization; `ChatPage.jsx` initial state (both currently hardcoded, in 3 places) | ❌ |
| Default meeting layout, default translation mode for new rooms | Meeting Experience *(new)* | `meeting_policy_defaults` | same | Room creation path (`connect()`); join-form WS URL construction (`translation_mode` never sent today) | ❌ |
| File-sharing size limit & allowed extensions | Meeting Experience *(new)* | `workspace_experience_settings` (or `platform_settings{key:"workspace"}`) | New `GET/PATCH /api/admin/meeting-experience/files` | `routes.py` upload validation + `FilesPanel.jsx` (both hardcoded, duplicated) | ❌ |
| Whiteboard defaults (tool/color/line width/canvas size) | Meeting Experience *(new)* | same | same pattern | `WhiteboardPanel.jsx` (hardcoded) | ❌ |
| Notes autosave debounce | Meeting Experience *(new)* | same | same pattern | `NotesPanel.jsx` (hardcoded 400ms) | ❌ |
| VAD presets (Quiet Room/Office/Classroom/Noisy/Custom) | Meeting Experience *(new)* | same | same pattern | `ChatPage.jsx` + `DiagnosticsPanel.jsx` (hardcoded, disconnected from `segment_silence_ms`) | ❌ |
| Diagnostics latency/packet-loss color thresholds | Meeting Experience *(new)* | same | same pattern | `DiagnosticsPanel.jsx` (hardcoded, disconnected from `maximum_latency_ms`) | ❌ |
| Chat delivery modes | *(not planned for Phase 1–3 — low value)* | — | — | `ChatPage.jsx` (hardcoded broadcast/direct) | ❌ |

## Languages, Voice, Translation, AI Models

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Enabled languages, display names | Languages | `platform_languages` | `GET/PATCH /api/admin/languages` | `SignupPage.jsx`/`ProfilePage.jsx`/`ChatPage.jsx` join form (all fetch `/api/public/languages`) | ✅ |
| Underlying translation-engine language set | AI Models *(new, exposed read-only initially)* | Hardcoded `LANGUAGE_NAMES` dict, `translation/service.py` | *(none — code-only today)* | Translation engine itself | ❌ |
| Voice model files, scan results | Voice Models | `voice_models` | `POST /api/admin/voices/scan`, `GET/PATCH /api/admin/voices` | Piper synthesis (`tts/voices.py` still hardcodes the canonical file table) | ⚠️ (partial) |
| Voice routing (language × preference → voice file) | Voice Models | `platform_settings{key:"voice_routing"}` | `GET/POST /api/admin/voices/routing` | **Never reaches TTS** — `runtime_settings` doesn't load this document | ⚠️ (dead — confirmed bug) |
| Speech profile parameters (standard/natural/expressive) | AI Models *(new)* | `platform_settings{key:"ai_models"}` *(new key)* | New `GET/PATCH /api/admin/ai-models/speech-profiles` | `tts/service.py` `SPEECH_PROFILES` (hardcoded + env-only today) | ❌ |
| Whisper model/beam-size/device/compute-type | AI Models *(new)* | `platform_settings{key:"ai_models"}` | same | `stt/service.py` (partially DB-driven for `stt_model` only) | ⚠️ (partial) |
| Translation timeout/endpoint/confidence/segment-silence | Translation | `platform_settings{key:"translation"}` | `GET/PATCH /api/admin/translation-settings` | `translation/service.py`, `stt/service.py` | ✅ |
| `retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language` | Translation | same document | same endpoint | **No consuming code found** | ⚠️ (dead) |
| Translation modes catalog | Translation | `translation_modes` | Full CRUD `/api/admin/translation-modes` | `routes.py` public endpoint exists, but **no meeting-workspace UI selects a mode** | ⚠️ (unreachable) |

## System, Security, Developer Tools

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Infra health (CPU/RAM/disk/queue/service probes) | System | *(live probes, not persisted)* | `GET /api/admin/system` | System module only | ✅ |
| General platform settings (maintenance mode, retention, default language, STUN server) | System | `platform_settings{key:"general"}` | `GET/PATCH /api/admin/settings` | Public `/api/public/settings` (safe subset) | ✅ |
| Admin session lifetimes, cookie policy, rate limits | Security *(new)* | Env vars only today; target `platform_settings{key:"security"}` | New `GET/PATCH /api/admin/security` | `admin-backend/app/config.py`, `security.py` | ❌ |
| Active admin sessions (view/revoke) | Security *(new)* | `admin_sessions` (already exists) | New `GET /api/admin/security/sessions`, `DELETE /api/admin/security/sessions/{id}` | `AdminSessionRepository` (repository exists, no listing/revoke endpoint yet) | ⚠️ (repository exists, no route) |
| Webhook subscribers | Developer Tools *(new)* | `webhooks` (collection + dispatch logic already exist) | New `GET/POST/DELETE /api/admin/webhooks` | `WebhookManager.dispatch_event()` (fully implemented, unreachable from any UI) | ❌ (no admin route at all) |
| Control-plane / command-queue visibility | Developer Tools *(new)* | `admin_commands` | New `GET /api/admin/developer/command-queue` (System module's `/system` route already counts queued commands — extend, don't duplicate) | Operators debugging control-plane delivery | ⚠️ (partial — count only, no detail view) |
| Feature flags | Feature Flags | `feature_flags` | Full CRUD `/api/admin/feature-flags` | `runtime_settings.feature_flags`; **only `video_calling` is actually enforced anywhere in the meeting UI** | ⚠️ (mostly dead) |
| Audit log entries | Audit Logs | `admin_audit_logs` | `GET /api/admin/logs`, `GET /api/admin/logs/export.csv` | Audit Logs module | ✅ |
| Audit log "rollback" | Audit Logs | *(none — button is broken)* | *(calls an unimported function)* | `AuditLogsPage.jsx` | ❌ (broken) |

---

## How to use this mapping during implementation

For every ❌ or ⚠️ row, the implementation work is exactly one of:
1. **Add the admin UI** (the DB/API side already exists — e.g. wiring `Footer.jsx`'s `cms` prop everywhere, or reading `items`/`cards` in Features/Solutions).
2. **Add the DB/API side** (a genuinely new capability — e.g. `meeting_policy_defaults`, blog posts, webhook CRUD).
3. **Fix the runtime consumption** (both admin UI and DB exist, but the value never reaches the code that should read it — e.g. voice routing, the dead translation settings, feature flag enforcement).

[ADMIN_IMPLEMENTATION_PLAN.md](ADMIN_IMPLEMENTATION_PLAN.md) sequences these by impact and dependency.
