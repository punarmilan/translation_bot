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
| Auth page brand identity (product name, logo) | Branding | `platform_settings{key:"branding"}` (`product_name`/`logo_url`) | `GET /api/public/branding` | `LoginPage.jsx`, `SignupPage.jsx` now read `branding.product_name`/`logo_url` instead of hardcoded "VOXO" text | ✅ |
| Auth page marketing copy + legal/ToS/privacy links | Content *(new keys, not yet built)* | `admin_content{key:"auth.login"}`/`{key:"auth.signup"}` | same pattern | `LoginPage.jsx`, `SignupPage.jsx` (absent today — distinct from brand identity above) | ❌ |
| Footer logo, description, copyright/legal text, contact info, links (optionally grouped) | Content (generic CMS) | `cms_pages{page:"global-footer"}` section `sec_footer` (type `footer`) | Generic `GET/PUT/POST /api/admin/cms/pages/global-footer[...]` + public `GET /api/public/cms/pages/global-footer` | `Footer.jsx` — self-fetches via `getCmsPage("global-footer")`, falls back to the original hardcoded 7-link array if empty/unreachable | ✅ |
| Navbar logo, product name, nav links (with optional dropdown/mega-menu nesting), sign-in/CTA labels | Content (generic CMS) | `cms_pages{page:"global-nav"}` section `sec_navbar` (type `navbar`) | Generic `GET/PUT/POST /api/admin/cms/pages/global-nav[...]` + public `GET /api/public/cms/pages/global-nav` | `Navbar.jsx` — self-fetches via `getCmsPage("global-nav")`, falls back to the original hardcoded 5-link array if empty/unreachable | ✅ |
| Company name/email/website/contact info | Branding + Content | `platform_settings{key:"branding"}` (`company_name`/`company_email`/`company_website`, new field) + `cms_pages{page:"global-footer"}` (`contact_email`/`contact_phone`, optional) | `GET /api/public/branding` + public CMS read | `AboutPage.jsx` now reads `branding.company_name`/`company_email`/`company_website` instead of its own hardcoded copy (its static "India" location line remains hardcoded, not a branding field); `Footer.jsx` renders `contact_email`/`contact_phone` when set (blank by default) | ✅ |
| Accent/primary/secondary color, font, border radius | Branding | `platform_settings{key:"branding"}` | `PATCH /api/admin/settings/branding` | `ConfigContext.applyThemeTokens`: accent color unconditional (unchanged); primary/secondary color scoped to a dynamically-managed `[data-theme="dark"]` `<style>` override (these fields' defaults match the dark theme, and an unconditional override would break light mode); `font_family` now has a real consumer (`styles.css` `body` reads `var(--font-family, ...)`); `border_radius` wired to `--radius-panel` only (matches its default; `--radius-control` has a different default and was left alone to avoid a 2px shift on unconfigured installs). `heading_font_family`/`button_style` remain unwired — no existing CSS hook | ✅ (accent/primary/secondary/font/panel-radius); ⚠️ (heading font + button style still dead) |
| Theme (light/dark) default | Branding / System | `platform_settings{key:"general", "key:"branding"}` (`theme` field) | `GET /api/public/settings` | `ThemeContext.jsx` now applies `settings.theme` as the initial default, but only before the visitor has made an explicit choice (stored preference or manual toggle always wins) | ✅ |
| Site title, SEO metadata (meta description, keywords), favicon (+dark variant), OG/Twitter image+card, social links (Twitter/LinkedIn/GitHub/YouTube) | Branding | `platform_settings{key:"branding"}` | `GET /api/public/branding` | `ConfigContext.applyThemeTokens` writes `document.title`, `description`/`keywords`/`og:*`/`twitter:*` `<meta>` tags, and now two `<link rel="icon" media="prefers-color-scheme:...">` tags when `favicon_dark_url` is set (falls back to a single tag otherwise); `Footer.jsx` renders the four social links when set; `Navbar.jsx`/`Footer.jsx` logos now fall back to `branding.logo_url`/`logo_dark_url` (theme-aware) before their final hardcoded text mark | ✅ |

## Media

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Uploaded images/video/asset metadata | Media Library | `media_assets` | Full CRUD + transform under `/api/admin/media` | Every content/branding editor's image picker | ✅ |
| "Register external CDN URL" asset | Media Library | *(currently local-state only — not persisted)* | None wired | `MediaLibraryPage.jsx` | ❌ (broken) |

## Users, Organizations, Roles

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| User accounts, roles, status | Users | `users` | Full CRUD under `/api/admin/users` | `Navbar`/`ProfilePage` (self-service), admin Users list | ✅ |
| Organization records, branding, status, membership | Organizations | `organizations`, `users.org_id` | Full CRUD under `/api/admin/enterprise/organizations` (Phase 10 added PATCH); membership reuses `PATCH /api/admin/users/{id}` | `OrganizationsPage.jsx` — create/edit/branding/status-toggle/member-assignment all live-verified | ✅ (Phase 10 — was previously 403 for every admin; see `enterprise.read`/`enterprise.write` fix below) |
| Roles & permission sets | Roles & Permissions | `admin_roles` | Full CRUD under `/api/admin/roles` | Every `require_permission`-guarded route; `UsersPage.jsx`'s admin-role dropdown now fetches the real role list instead of 3 hardcoded options | ✅ (Phase 10 — role-permission edits now propagate to already-assigned admins instead of being a stale snapshot) |
| Admin invitations | Roles & Permissions | `admin_invitations` | `POST /api/admin/auth/invitations` | Admin signup flow | ✅ |
| Admin permission scopes | *(constant, not DB-backed)* | `ALL_ADMIN_PERMISSIONS` in `admin-backend/app/security.py` | Read by every `require_permission()` check | — | ✅ (Phase 10 — was missing `enterprise.read`/`enterprise.write`, so no admin of any role, including "Administrator", could reach Organizations; also fixed an empty-permissions-list-grants-everything bug in the same function) |

## Meetings & Meeting Experience

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Live meeting moderation (mute/kick/promote/lock/end/etc.) | Meetings | *(no persistence — control-plane command)* | `POST /api/admin/meetings/{room_id}/command` | `ChatPage.jsx` WS message handling | ✅ |
| Meeting records, participants, logs, recordings | Meetings | `rooms`, `messages`, `translation_logs`, `recordings` | `GET /api/admin/meetings/*` | Meetings module only (not public-facing) | ✅ |
| Meeting policy: participant cap, waiting room, screen share/recording/translation/captions defaults, timeouts, guest join, require-host | Meeting Policy | `platform_settings{key:"meeting_policy"}` | `GET/PATCH /api/admin/meeting-policy` (+ safe public mirror) | `websocket_manager.py` `RoomConnectionManager.connect()` snapshots policy onto each room at creation and enforces it (join rejection, screen-share/recording gate, timeout task); `ChatPage.jsx` now consumes the `room_policy` broadcast to disable the screen-share/record buttons and captions toggle client-side, and treats a policy-rejection close (code 4001) as terminal instead of retrying | ✅ (Phase 3 persistence/enforcement + Phase 8 frontend consumption/UX gap closure) |
| Translation mode selection for a room | Meeting Policy / Translation Modes | `translation_modes` (catalog) + per-room `translation_mode` field | Room join WS query param `translation_mode` (defaults `"General"`) | `websocket_manager.py` threads the mode into `TranslationContext`; `TranslationService._load_mode_terminology()` applies the mode's `preferred_terminology` to the translated output | ⚠️ (pipeline now consumes it; no frontend UI lets a user pick a mode before/during join — `translation_prompt`/`llm_config` unconsumed, LibreTranslate has no prompt surface) |
| File-sharing size limit & allowed extensions | Meeting Policy | `platform_settings{key:"meeting_policy"}` (`max_file_size_mb`, `allowed_file_extensions`) | `GET/PATCH /api/admin/meeting-policy` | `routes.py` upload handler reads `runtime_settings.meeting_policy` on every upload; defaults match the previously-hardcoded 25MB / 18-extension list | ✅ |
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
| Voice model files, scan results | Voice Models | `voice_models` | `POST /api/admin/voices/scan`, `GET/PATCH /api/admin/voices` | `voice_router.py`'s dynamic routing (below) checks this catalog for validation; `tts/voices.py` still hardcodes the canonical fallback file table | ⚠️ (partial) |
| Voice routing (language × preference → voice file) | Voice Models | `platform_settings{key:"voice_routing"}` | `GET/POST /api/admin/voices/routing` | Phase 9: `runtime_settings.voice_routing` now loaded/updated; `voice_router.py`'s `resolve_voice_route()` consumes it and falls back to static routing only when the configured file is missing. Live-verified: routing a language/preference to a different installed voice changes `GET /tts/status`'s reported model with no restart. | ✅ |
| Speech profile parameters (standard/natural/expressive) | *(not exposed)* | env vars (`PIPER_*_LENGTH_SCALE` etc.) | — | `tts/service.py` `SPEECH_PROFILES` | ❌ (deliberately deployment-only — not part of Phase 9's scope) |
| Whisper model/beam-size | AI Models | `platform_settings{key:"ai_models"}`, write-through mirrored into `platform_settings{key:"translation"}`'s `stt_model`/`beam_size` | `GET/PATCH /api/admin/ai-settings` | `stt/service.py` reads `stt_model`/`beam_size` from the Translation Settings document (Phase 3's live-reload path); AI Models page write-throughs into the same document instead of a second copy. Live-verified: changing the model via AI Models updated `GET /stt/status` immediately. | ✅ |
| Whisper device/compute-type | AI Models *(read-only)* | env vars (`WHISPER_DEVICE`/`WHISPER_COMPUTE_TYPE`) | `GET /api/admin/ai-settings` (always reflects live env value; PATCH silently strips any submitted change) | `stt/service.py`'s `WhisperModel(...)` constructor | ⚠️ (deliberately deployment-only, clearly marked read-only in the admin UI per Phase 9's requirement) |
| STT/TTS provider selection | AI Models | `platform_settings{key:"ai_models"}` | `GET/PATCH /api/admin/ai-settings` | Single implementation of each (`faster_whisper`/`piper`) exists; PATCH validates against the supported set and rejects anything else with 400 | ⚠️ (validated, but no second provider to actually switch to) |
| Translation provider endpoint | AI Models | `platform_settings{key:"ai_models"}`'s `translation_provider_url`, write-through mirrored into `platform_settings{key:"translation"}`'s `libretranslate_endpoint` | `GET/PATCH /api/admin/ai-settings` | `translation/service.py`'s `LibreTranslateProvider` reads `libretranslate_endpoint`; same dead-duplicate-field bug as Whisper model, fixed the same way | ✅ |
| Live STT/TTS runtime status | AI Models | *(no persistence — live proxy)* | `GET /api/admin/ai-settings/status` | Proxies the public backend's own `/stt/status`/`/tts/status` | ✅ (Phase 9, new) |
| Translation timeout/endpoint/confidence/segment-silence | Translation | `platform_settings{key:"translation"}` | `GET/PATCH /api/admin/translation-settings` | `translation/service.py`, `stt/service.py` | ✅ |
| `retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language` | Translation | same document | same endpoint | **No consuming code found** | ⚠️ (dead) |
| Translation modes catalog | Translation | `translation_modes` | Full CRUD `/api/admin/translation-modes` | `routes.py` public endpoint exists; `TranslationService` now applies each mode's `preferred_terminology`, but **no meeting-workspace UI selects a mode** — see Meeting Experience section above | ⚠️ (pipeline wired, no picker UI) |

## System, Security, Developer Tools

| Entity | Admin page | DB document | API | Frontend consumer | Status |
|---|---|---|---|---|---|
| Infra health (CPU/RAM/disk/queue/service probes) | System | *(live probes, not persisted)* | `GET /api/admin/system` | System module only | ✅ |
| General platform settings (maintenance mode, retention, default language, STUN server) | System | `platform_settings{key:"general"}` | `GET/PATCH /api/admin/settings` | Public `/api/public/settings` (safe subset) | ✅ |
| Admin session lifetimes, cookie policy, rate limits | Security *(new)* | Env vars only today; target `platform_settings{key:"security"}` | New `GET/PATCH /api/admin/security` | `admin-backend/app/config.py`, `security.py` | ❌ |
| Active admin sessions (view/revoke) | Security *(new)* | `admin_sessions` (already exists) | New `GET /api/admin/security/sessions`, `DELETE /api/admin/security/sessions/{id}` | `AdminSessionRepository` (repository exists, no listing/revoke endpoint yet) | ⚠️ (repository exists, no route) |
| Webhook subscribers | Developer Tools *(new)* | `webhooks` (collection + dispatch logic already exist) | New `GET/POST/DELETE /api/admin/webhooks` | `WebhookManager.dispatch_event()` (fully implemented, unreachable from any UI) | ❌ (no admin route at all) |
| Control-plane / command-queue visibility | Developer Tools *(new)* | `admin_commands` | New `GET /api/admin/developer/command-queue` (System module's `/system` route already counts queued commands — extend, don't duplicate) | Operators debugging control-plane delivery | ⚠️ (partial — count only, no detail view) |
| Feature flags | Feature Flags | `feature_flags` | Full CRUD `/api/admin/feature-flags` | `runtime_settings.feature_flags`. Phase 10: `live_captions`/`recording`/`screen_sharing`/`waiting_room`/`captions` removed (pure duplicates of `meeting_policy`'s already-live fields, cleaned up from Mongo on startup); `admin-backend`'s editable defaults synced from 7 to the full ~17-key set (most were previously invisible in the Admin Console despite existing at runtime); `whiteboard`/`meeting_notes`/`files`/`diagnostics` now gate their meeting-workspace tab for real, alongside the pre-existing `video_calling`/`voice_translation`. The remaining ~11 keys are labeled "Reserved — toggling this has no effect" in their own description rather than left silently inert. | ⚠️ (6 of ~17 keys live, rest honestly labeled reserved — was 2 of 22 with no labeling) |
| Audit log entries | Audit Logs | `admin_audit_logs` | `GET /api/admin/logs`, `GET /api/admin/logs/export.csv` | Audit Logs module | ✅ |
| Audit log "rollback" | Audit Logs | *(none — button is broken)* | *(calls an unimported function)* | `AuditLogsPage.jsx` | ❌ (broken) |

---

## How to use this mapping during implementation

For every ❌ or ⚠️ row, the implementation work is exactly one of:
1. **Add the admin UI** (the DB/API side already exists — e.g. wiring `Footer.jsx`'s `cms` prop everywhere, or reading `items`/`cards` in Features/Solutions).
2. **Add the DB/API side** (a genuinely new capability — e.g. `meeting_policy_defaults`, blog posts, webhook CRUD).
3. **Fix the runtime consumption** (both admin UI and DB exist, but the value never reaches the code that should read it — e.g. voice routing, the dead translation settings, feature flag enforcement).

[ADMIN_IMPLEMENTATION_PLAN.md](ADMIN_IMPLEMENTATION_PLAN.md) sequences these by impact and dependency.
