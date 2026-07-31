# VOXO Admin Console — Gap Analysis (Task 1 Findings)

This document is the factual output of a full repository audit performed before any implementation work. It records what is hardcoded, what is already admin/DB-driven, what is broken, and what overlaps — across the public frontend, the meeting workspace, the backend, and the existing admin console. No code was changed to produce this document.

Companion documents: [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) · [ADMIN_MODULES.md](ADMIN_MODULES.md) · [ADMIN_DATA_MODEL.md](ADMIN_DATA_MODEL.md) · [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md) · [ADMIN_IMPLEMENTATION_PLAN.md](ADMIN_IMPLEMENTATION_PLAN.md)

---

## Part A — Public Frontend: Hardcoded Content Inventory

`frontend/src/contexts/ConfigContext.jsx` already fetches `branding`, `featureFlags`, `sections` (page-builder), and `settings` from admin-backend-driven public endpoints, and is the intended foundation for a fully CMS-driven site. In practice, most pages never call `useConfig()` at all, and even the pages that do only consume a thin slice of what they render.

### A.1 Pages with (partial) CMS wiring

| Page | What's dynamic | What's still hardcoded |
|---|---|---|
| `LandingPage.jsx` | `sections` (PageBuilder), `content["landing.hero"]`, `content["site.faqs"]`, `content["site.footer"]` | 14-card marquee fallback array (`row1`/`row2`, lines 25–43) with hardcoded titles/images/icons; `DynamicShowcase`/`CoreBenefits`/FAQ/CTA section fallback copy; CoreBenefits' 3 hardcoded benefit cards (emoji icons, not lucide); default `activeSections` order |
| `HeroSection.jsx` | `cms` prop (eyebrow/title/body) | Fallback copy strings; **all CTA button labels** ("Open Workspace", "Explore Features"); 3 hardcoded "micro indicator" strings + icons |
| `TestimonialsSection.jsx` | `data.cards` (PageBuilder) | `defaultTestimonials`: **4 fully hardcoded testimonials** with hardcoded external Unsplash avatar URLs; one entry's `role` duplicates its `author` (data bug) |
| `FAQ.jsx` | `cms`/`customCards` props | `defaultQuestions`: 5 hardcoded Q&A pairs — and **only `LandingPage` ever passes props**; `AboutPage.jsx:207` and `HelpPage.jsx:55` render `<FAQ />` with no props at all, so they always show hardcoded defaults, never `site.faqs` |
| `FeaturesPage.jsx` | `content["features.page"]` → `title`/`body` only | `flagship` (4 hardcoded feature blocks) and `capabilities` (20 hardcoded capability tuples) — the entire substance of the page. Backend's `CONTENT_DEFAULTS["features.page"]` even defines an `items: []` field that is never read. |
| `SolutionsPage.jsx` | `content["solutions.page"]` → `title`/`body` only | `solutions`: 11 hardcoded solution tuples with pain-point bullets and image paths; same unused `items: []` pattern |
| `SignupPage.jsx` | `getPublicLanguages()` → language dropdown | `PRONOUN_OPTIONS`, `VOICE_OPTIONS` (not API-backed at all); no ToS/privacy-policy text or links anywhere on the page |

### A.2 Pages with zero CMS wiring (100% hardcoded)

- **`PricingPage.jsx`** — fetches `pricing.page` content but **never renders any field from it** (dead fetch). All 3 pricing tiers, the full 9-row comparison matrix, and billing-toggle copy are hardcoded. Enterprise contact email (`sales@giftme.watch`) is inconsistent with the `support@worknai.tech` used elsewhere.
- **`AboutPage.jsx`** — `helpTopics` (10 hardcoded topics), mission/vision paragraphs, 4 core-value cards (each with its own hardcoded accent color), and a full company-contact block (name/email/website) that duplicates `Footer.jsx` and ignores the `branding.company_name`/`company_email` fields ConfigContext already fetches.
- **`BlogPage.jsx`** — **the least CMS-integrated page in the app**: 3 full blog posts, including rich-text body content, are baked directly into the React bundle as a hardcoded `articles` object. `featureFlags.blogs` exists but is never checked here.
- **`HowItWorksPage.jsx`**, **`HelpPage.jsx`**, **`DocsPage.jsx`** — fully hardcoded stage/topic/guide arrays, headers, and CTAs.
- **`LoginPage.jsx`** — fully hardcoded copy; no legal/ToS/privacy-policy text or links.

### A.3 Cross-cutting content problems

1. **Duplicated literals that should be one CMS field**: the 10-language display list is independently hardcoded in `SignupPage.jsx`, `ProfilePage.jsx`, and referenced in prose in `AboutPage.jsx`, `HelpPage.jsx`, and `FAQ.jsx`.
2. **Brand identity hardcoded 4 times**: the "VX" mark + "VOXO" wordmark appears literally in `Navbar.jsx`, `Footer.jsx`, `LoginPage.jsx`, and `SignupPage.jsx` — none reference `branding.logo_url`/`branding.product_name`, despite `ConfigContext` already fetching them.
3. **`Footer.jsx` only ever receives a `cms` prop from `LandingPage.jsx`** — every other page (via `MarketingPage.jsx`) shows the hardcoded fallback tagline/copyright, never `site.footer`.
4. **No admin editor exists at all for**: blog posts, pricing tiers, features/solutions card arrays, auth-page copy, or the ProfilePage voice/emotion/gender select options.
5. **Auth pages have no legal/ToS/privacy-policy content or links** in either Login or Signup.

---

## Part B — Meeting Workspace: Configurability Findings

### B.1 Settings that are genuinely DB/admin-driven and consumed

- Translation timeout, LibreTranslate endpoint, detection confidence, STT model, segment silence (all read by `translation/service.py` / `stt/service.py`).
- Enabled-language set (`platform_languages` collection, gates the join-form dropdown and translation eligibility).
- Feature flags are fetched from the DB — but see B.3.

### B.2 Settings that are DB/admin-editable but functionally dead (no code path consumes them)

| Setting | Where it's stored/edited | Why it's dead |
|---|---|---|
| `retry_count` | `runtime_settings.translation_settings`, admin `PATCH /translation-settings` | No retry logic anywhere reads it |
| `maximum_latency_ms` | same | No timeout/cutoff logic reads it; also disconnected from the *different*, hardcoded latency-color thresholds in `DiagnosticsPanel.jsx` (1000/2500ms) |
| `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language` | same | Not found wired into any consuming code |
| Translation modes list (General/Business/…) | `translation_modes` collection, full admin CRUD | **The meeting workspace has no UI to select a mode at all** — the WS route accepts a `translation_mode` query param but the frontend never sends it, so every meeting is always `"General"` regardless of what the admin configures |

### B.3 A confirmed, currently-non-functional admin feature: Voice Routing

`admin-backend`'s `POST /voices/routing` writes a custom language→preference→voice-file mapping to `platform_settings{key:"voice_routing"}`, and the runtime backend's `voice_router.py` attempts to read `runtime_settings.voice_routing`. **`RuntimeSettingsManager` never defines a `voice_routing` attribute, and `load_from_db()` never loads that document.** The `AttributeError` this causes is silently swallowed by a bare `except Exception: pass`, so voice routing changes made in the admin console round-trip through the control plane successfully but have **zero effect** on actual TTS output. This is a real bug, not a design gap, and should be an early fix regardless of the broader admin-console project.

### B.4 Hardcoded, not admin-configurable at all

- **Meeting defaults**: default role-on-join, default translation mode, default layout (`"gallery"`).
- **Host permission defaults** (`allow_share`/`allow_whiteboard`/`allow_notes`/`allow_files`/`allow_annotations`): defined only as in-memory Python dataclass defaults, reset every time a room is created, **duplicated in three places** (backend `RoomState`, and twice in `ChatPage.jsx`) with no shared source and no persistence.
- **VAD presets** (Quiet Room/Office/Classroom/Noisy/Custom) and their RMS/silence-timeout values — 100% hardcoded client-side, and **entirely disconnected from** the DB-driven `segment_silence_ms` (two independent "silence" concepts, only one of which an admin can touch).
- **Speech profiles** (standard/natural/expressive: length_scale/sentence_silence/noise_scale/noise_w) — hardcoded dict, only overridable via env vars.
- **Available voices per language, voice preference options** — hardcoded, duplicated frontend/backend.
- **File size limit (25MB) and allowed extensions** — hardcoded and duplicated in both frontend and backend; must be kept in sync by hand.
- **Whiteboard tool set, defaults (color/line width), canvas size, sticky-note size** — 100% hardcoded.
- **Notes autosave debounce (400ms)** — hardcoded.
- **Diagnostics latency/packet-loss color thresholds** — 100% hardcoded, and disconnected from the (also-dead) `maximum_latency_ms` setting.
- **Chat delivery modes** (broadcast/direct only) — hardcoded, no admin-configurable delivery modes.
- **Feature flags are fetched but barely enforced**: of ~20 flags, only `video_calling` gates anything in `ChatPage.jsx`. Whiteboard/files/notes/diagnostics/recording/screen_sharing flags are fetched into state and never checked — toggling them in the admin console currently has no effect on the meeting UI.

### B.5 Theme/branding: only accent color actually reaches the meeting workspace

`ConfigContext.applyThemeTokens` sets 5 CSS variables from `branding_settings`: accent color, primary color, secondary color, font family, border radius.
- **Accent color works** — Tailwind's `brand-accent` token maps to `var(--color-accent)` and is used throughout the meeting UI.
- **Primary/secondary color, font family, and border radius are dead** — `tailwind.config.js` and `styles.css` reference a completely different, hardcoded set of CSS variables/hex values for backgrounds, surfaces, and radii; the admin-settable ones are never read anywhere in the stylesheet.
- **`general_settings.theme` (light/dark default) is fetched but never applied** — theme is 100% client/browser-preference-driven via a separate `ThemeContext`/`localStorage`, with no code path reading the DB setting.

---

## Part C — Backend: Confirmed Issues Beyond the Voice-Routing Bug

- **Two backends independently seed different default flag values.** The public backend's in-memory defaults (`runtime_settings.py`) and the admin backend's Mongo-seed defaults (`platform.py`) disagree on the default-enabled state of `recording`, `screen_sharing`, and `meeting_summary`. Until the DB is authoritative (first load), these two systems tell different stories about the same flags.
- **No server-side flag enforcement in the meeting pipeline.** Feature flags are advisory/UI-facing only (with the one exception of `video_calling`, enforced client-side, not server-side either) — there is no `if runtime_settings.feature_flags["whiteboard"]:` style gate anywhere in `websocket_manager.py`.
- **Two independent, coexisting inter-backend notification mechanisms** with different reliability guarantees: (1) a signed, acknowledged Redis pub/sub control plane used for flags/languages/translation-settings/moderation, and (2) a **hardcoded, unauthenticated** direct HTTP POST to `http://127.0.0.1:8000/api/internal/reload-config` used only for branding/page-builder/general-settings changes — this URL ignores the `PUBLIC_BACKEND_URL` setting that exists specifically for this purpose, and the receiving endpoint has no authentication check of any kind.
- **`webhooks` collection has no populating admin endpoint.** `WebhookManager.register_webhook()` exists and is fully implemented, but no router anywhere calls it — external webhook subscribers can currently only be created via direct database access, defeating the point of having an admin console.
- **`UPDATE_TRANSLATION_MODE` command type is defined and handled** in `apply_admin_command()` but **no admin-backend router ever issues it** — dead code on the receiving end, mirroring the frontend-side gap in B.2 (translation mode is unreachable from both directions).
- **Stale architecture doc corrected**: `docs/ADMIN_ARCHITECTURE.md`'s prior "Meeting controls" section described live command delivery as unimplemented future work ("Production live enforcement requires the public backend to consume those commands through Redis Streams, NATS, or MongoDB change streams"). This is **out of date** — the Redis pub/sub control plane already implements exactly this, today, with HMAC-signed commands and acks. The rewritten architecture doc corrects this.

---

## Part D — Admin Console Frontend: Completeness & Overlap Findings

### D.1 Direct duplication (same data, two competing pages)

- **`MediaPage.jsx` vs `MediaLibraryPage.jsx`** — both read `GET /api/admin/media`. `MediaPage` has real, complete CRUD + crop/compress/replace. `MediaLibraryPage`'s "Add to Media Library" form **only updates local React state — it is never persisted**, and the page has no edit or delete capability at all. It looks like an abandoned prototype sitting alongside the real feature.
- **`ContentPage.jsx` vs `PageBuilderPage.jsx` vs `BrandPage.jsx`** — three separate site-content/appearance editors against three different backend endpoints (`/content`, `/page-builder`, `/settings/branding`), with **no visible arbitration of overlapping concerns**. Footer/copyright/company text lives in BrandPage; generic page copy lives in ContentPage; landing-page sections/cards live in PageBuilderPage. An admin has no way to know which one governs a given piece of text on the live site.
- **`LanguagesPage.jsx` vs `VoicesPage.jsx`** — both fetch the same language list; low-severity, since Voices only uses it as a read-only lookup.
- **`DashboardPage.jsx` vs `AnalyticsPage.jsx`** — two separate metrics surfaces hitting two separate endpoints with real conceptual overlap and no cross-navigation.

### D.2 Reused generic components hiding distinct concerns

- **`RegistryPage.jsx`** renders both "Feature Flags" and "Announcements" as identical generic list-editors — architecturally fine, but it means Announcements (which is really a Content concern) is nav-adjacent to Feature Flags (a System/behavior concern) purely because they share a component, not because they're related.
- **`SettingsPage.jsx`** likewise renders both "Translation Settings" and "Platform Settings" — same pattern, same caveat.

### D.3 Broken or misleading features

- **`AuditLogsPage.jsx`'s "Rollback State" button is non-functional** — it calls `postAdmin`, which is never imported in the file, so clicking it throws a runtime `ReferenceError`. Even if the import were fixed, the call unconditionally POSTs to `/settings/branding` regardless of what the log entry actually changed — it would silently misfire for a user/meeting/content rollback.
- **`BrandPage.jsx` and `PageBuilderPage.jsx` both claim real-time WebSocket-broadcast behavior in their own UI copy** ("updates connected clients in real time via WebSockets with zero browser refresh") **but neither contains any WebSocket client code or preview pane** — the claim is unsubstantiated by the implementation. (The broadcast *does* happen server-side via the reload-config webhook in Part C — the misleading part is that the admin UI shows no confirmation of it and no preview of the result.)

### D.4 Missing capabilities, consistently, across most pages

- **No page enforces client-side permissions.** The logged-in admin's own `admin.permissions` array is available on the auth object but is never read by any page or by `AdminLayout.jsx`'s navigation — every admin sees every nav item and every create/edit/delete control regardless of their actual role, relying entirely on the backend to reject unauthorized actions after the fact.
- **No live preview anywhere** in Content, Branding, Media, or Page Builder — every "visual" editing surface is a plain form; none render what the change will look like on the live site before saving.
- **Inconsistent API client usage** — `FeedbackPage.jsx`, `LanguagesPage.jsx`, and `VoicesPage.jsx` each bypass the shared `services/api.js` client with raw `axios` calls for at least one operation, which is both a consistency smell and a place where auth-header/error-handling conventions could silently diverge.
- **Search/sort/pagination is inconsistent across list pages.** `UsersPage.jsx` has full search+filter+sort+pagination. Most other list pages (`Content`, `Languages`, `Voices`, `Registry`, `AuditLogs`, `MediaLibrary`) have only a client-side substring search, if that, with no server-side pagination — fine at current data volumes, a real problem at scale.

---

## Summary: What This Means for Design

The gap analysis drives three concrete design decisions carried into [ADMIN_MODULES.md](ADMIN_MODULES.md) and [ADMIN_IMPLEMENTATION_PLAN.md](ADMIN_IMPLEMENTATION_PLAN.md):

1. **Consolidate before extending.** Content, Page Builder, and Branding must become one coherent content domain with a single ownership model before adding new content types (blog posts, pricing plans, FAQs, testimonials) to it — otherwise the "which page owns this text" ambiguity gets worse, not better. Media and Media Library must become one page.
2. **Close the enforcement gap, not just the editing gap.** Several "admin-configurable" settings already exist in the database and the admin UI but do nothing at runtime (voice routing, retry_count, maximum_latency_ms, translation modes, most feature flags). Any new admin capability must be built together with the runtime code path that actually consumes it — otherwise the console grows more decorative settings that don't work.
3. **New modules are needed, not just new pages inside old ones**, for: meeting policy defaults (host permissions, VAD, diagnostics thresholds, file-sharing limits — currently only in code), AI/voice model behavior (STT/TTS parameters — currently only in code/env vars), security policy (session/cookie/rate-limit settings — currently only in env vars), and developer tools (webhook subscriber management, control-plane visibility — currently only reachable via direct DB access).
