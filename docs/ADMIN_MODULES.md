# VOXO Admin Console — Module Architecture (Task 2)

This document defines the final set of top-level admin modules, why each exists, what it owns, and its current state relative to the [gap analysis](ADMIN_GAP_ANALYSIS.md). It supersedes the flat 16-item module list in the previous `ADMIN_ARCHITECTURE.md` by consolidating overlapping pages and adding the modules needed to close the hardcoding gaps found in the audit.

Each module is tagged with its current state:
- **Exists (complete)** — fully wired, real CRUD, no changes needed beyond permission/preview polish.
- **Exists (needs consolidation)** — functionality exists today but is split across duplicate/overlapping pages that must merge.
- **Exists (needs enforcement fix)** — the admin UI and data model exist, but the runtime doesn't consume the setting (see Gap Analysis Part B.2/B.3).
- **New** — no current admin page; closes a hardcoding gap identified in the audit.

---

## 1. Dashboard
**State:** Exists (complete), light polish only.
**Why it exists:** A single at-a-glance operational summary is the front door of any admin console — usage totals, recent activity, and recent errors, so an administrator's first screen tells them whether anything needs attention before they go looking for it.
**Owns:** Nothing writable — pure aggregation view over Users, Meetings, Messages, Translation logs.
**Gap-driven change:** Merge with Analytics's overlapping metrics (see module 19) so there is one metrics home, not two.

## 2. Content
**State:** Exists (needs consolidation) — absorbs `ContentPage.jsx`, `PageBuilderPage.jsx`, and the `Announcements` half of `RegistryPage.jsx`, and becomes the new home for blog posts, FAQs, testimonials, and pricing plans.
**Why it exists:** This is the single most important module for the stated objective ("nothing should require editing React code"). The gap analysis found that features/solutions cards, pricing tiers, blog posts, FAQs, and testimonials are 100% hardcoded in the React bundle with no CMS path at all, while the three *existing* content-adjacent pages (Content, Page Builder, Brand) already compete for ownership of overlapping copy with no arbitration. Rather than adding a fourth competing surface, Content becomes the one CMS that owns all structured and unstructured site copy, organized by **content type**, each type reusing the same generic section/card data model already proven in Page Builder rather than inventing a new shape per page.
**Owns:**
- Landing/marketing page sections (today's Page Builder model: eyebrow/title/body/CTA/cards)
- Features, Solutions, Pricing, About, How-it-works, Help, Docs page bodies and card arrays
- Blog posts (new content type — title, body, author, date, category, published/draft state)
- FAQs (today's `site.faqs` key, extended so `AboutPage`/`HelpPage` consume it instead of hardcoded defaults)
- Testimonials (today's PageBuilder `cards`, given a first-class content type instead of overloading a generic section)
- Announcements/notices (folded in as a content type instead of sharing a component with Feature Flags, which is an unrelated concern)
- Auth-page copy (Login/Signup marketing text, legal/ToS/privacy-policy text — currently absent entirely)
**Does not own:** Design tokens (colors/fonts/logo) — that stays in Branding. Draft/publish workflow is shared across all content types (see [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) versioning section).

## 3. Branding
**State:** Exists (needs enforcement fix) — the page and its backend endpoint are complete; the CSS consumption of most of its fields is dead (Gap Analysis Part B.5).
**Why it exists:** Visual identity (colors, logo, fonts, footer/legal text, company contact info) is a distinct concern from content copy — it's applied globally as design tokens, not authored per-page, and should have one owner.
**Owns:** Accent/primary/secondary color, font family, border radius, button style, logo/favicon/OG image, SEO metadata, footer text, copyright text, company name/email.
**Gap-driven change:** Fix the CSS variable wiring so primary/secondary color, font family, and border radius actually reach `styles.css`/`tailwind.config.js` in both the public frontend and the meeting workspace (today only accent color does); wire `Footer.jsx`'s company-contact block and `AboutPage.jsx`'s duplicate contact block to read from here instead of their own hardcoded copies; add a live preview pane (see [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) Task 4).

## 4. Media Library
**State:** Exists (needs consolidation) — merge `MediaPage.jsx` (real CRUD) and `MediaLibraryPage.jsx` (broken prototype) into one page; delete the local-state-only "add asset" flow.
**Why it exists:** Every content type in module 2 and the branding fields in module 3 need image/video assets; a single asset library with real upload/replace/crop/compress/delete avoids every content editor reinventing file handling.
**Owns:** Media asset metadata and storage (already backed by a complete CRUD+transform router).

## 5. Blogs
**State:** New content type inside Content (module 2), called out separately in navigation per the requested module list, since blog content has its own lifecycle (author, publish date, category) distinct from static page sections.
**Why it exists:** Currently the least CMS-integrated surface in the app — 3 full articles, including rich-text bodies, are compiled directly into the JS bundle. This is the clearest, highest-visibility win for "no code changes needed for content."
**Owns:** Blog post documents (see [ADMIN_DATA_MODEL.md](ADMIN_DATA_MODEL.md)).

## 6. Users
**State:** Exists (complete) — the most fully-built page in the console today (full CRUD, search/filter/sort/pagination, CSV export, activity drill-down, lifecycle actions).
**Why it exists:** Account administration is foundational and already done well; used as the reference implementation for what "complete" looks like for other list pages.
**Owns:** User accounts, roles, status, lifecycle actions (disable/activate/promote/reset-password).

## 7. Organizations
**State:** Exists (backend only) — `admin-backend/app/routers/enterprise.py` has working list/create endpoints with no dedicated admin-frontend page yet.
**Why it exists:** Multi-tenant/enterprise customers need org-level grouping of users, independent from individual account management, ahead of any org-scoped billing, SSO, or org-level feature-flag overrides.
**Owns:** Organization records and org-to-user membership.

## 8. Meetings
**State:** Exists (complete) — full moderation command palette, participant management, logs/export.
**Why it exists:** Live operational control over in-progress and historical meetings is a distinct concern from meeting *policy* (module 9) — this module is about acting on a specific meeting right now.
**Owns:** Per-meeting moderation commands, participant actions, recordings/logs/export.

## 9. Meeting Experience *(New)*
**State:** New — closes the largest set of findings in Gap Analysis Part B.4.
**Why it exists:** The audit found an entire category of meeting behavior that is hardcoded and has no admin or persistence path at all: host permission defaults (duplicated three ways with no DB backing), VAD presets, diagnostics color thresholds, whiteboard defaults, notes autosave timing, and file-sharing limits/extensions. None of this belongs in "Meetings" (which is about acting on live/past meetings) or "Translation" (which is about the translation pipeline specifically) — it needs its own home: the *default policy* new meetings start with, and the *workspace experience* constants that today only a code change can adjust.
**Owns:**
- Default host permissions for new rooms (allow_share/whiteboard/notes/files/annotations) — replacing the three hardcoded copies with one DB-backed default, applied when a room is created
- File-sharing limits (max size, allowed extensions)
- Whiteboard defaults (default tool, color, line width, canvas size)
- Notes autosave debounce
- VAD presets (Quiet Room/Office/Classroom/Noisy/Custom threshold values) and diagnostics color thresholds
- Default meeting layout and default translation mode for new rooms (also wiring the currently-unreachable `translation_mode` selector into the join flow)

## 10. Languages
**State:** Exists (complete) for the enable/disable/display-name concern; see AI Models (module 12) for the deeper "which languages the pipeline itself understands" gap.
**Why it exists:** Controls which languages are selectable across signup, profile, and the meeting join form.
**Owns:** `platform_languages` records (code, display name, native name, flag, per-capability enable toggles).

## 11. Voice Models
**State:** Exists (needs enforcement fix) — the admin page, backend endpoints, and Redis round-trip all work; the actual voice-routing effect is broken (Gap Analysis Part B.3) because `runtime_settings` never loads or exposes the `voice_routing` document.
**Why it exists:** Piper voice assignment (which model file serves which language × gender preference) is asset/config management distinct from Translation's behavioral settings.
**Owns:** Scanned voice model metadata, per-language/preference voice routing assignments.
**Gap-driven change:** Add `voice_routing` to `RuntimeSettingsManager` and load it in `load_from_db()` so the existing admin feature actually takes effect; remove the silent `except Exception: pass` that currently hides this class of bug.

## 12. Translation
**State:** Exists (needs enforcement fix) — several editable fields are dead (Gap Analysis Part B.2).
**Why it exists:** Owns the behavioral tuning of the translation pipeline: timeouts, thresholds, caching, and the mode catalog (General/Business/Education/…).
**Owns:** Translation settings (`platform_settings{key:"translation"}`), translation modes (`translation_modes` collection).
**Gap-driven change:** Either wire `retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language` into real consuming code, or remove them from the editable surface — an admin setting that silently does nothing is worse than no setting. Wire the existing `translation_modes` CRUD through to an actual selector in the meeting join flow (currently unreachable end-to-end).

## 13. AI Models *(New)*
**State:** New — consolidates STT (Whisper) and TTS (Piper) model/behavior configuration that today lives only in environment variables and hardcoded Python dicts.
**Why it exists:** `stt_model` is technically DB-driven already, but beam size, VAD silence thresholds (the *server-side* Whisper VAD, distinct from the client-side presets in module 9), and the entire `SPEECH_PROFILES` dict (length_scale/sentence_silence/noise_scale/noise_w per profile) are hardcoded env-var-only constants. As VOXO's AI pipeline grows (additional STT/TTS providers, summarization models), this module is where model selection and provider-level tuning belongs — distinct from Voice Models (module 11), which is about *which voice file* plays, not *how the models behave*.
**Owns:** Whisper model/device/compute-type/beam-size defaults, TTS speech-profile parameter sets, future LLM/summarization provider configuration (`ai_summaries` service already exists as a stub integration point).

## 14. System
**State:** Exists (complete) for health monitoring; general platform settings currently live in a generic `SettingsPage.jsx` instance and should be surfaced here alongside health, since both are "how the platform behaves" concerns for operators rather than content editors.
**Why it exists:** Infrastructure health (CPU/RAM/disk/queue/service probes) and platform-wide operational settings (maintenance mode, retention days, default language, STUN server) belong together as the operator's control room, distinct from content or meeting-specific settings.
**Owns:** Health snapshot (read-only), general platform settings, the inter-backend control-plane/reload-config notification status.

## 15. Security *(New)*
**State:** New — closes a real gap: session lifetime, cookie policy, rate limits, and origin allow-lists currently only exist as environment variables (`ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES`, `ADMIN_COOKIE_SECURE`, `ADMIN_COOKIE_SAMESITE`, `ADMIN_COOKIE_DOMAIN`, login rate-limit thresholds) and require a redeploy to change.
**Why it exists:** Security posture needs to be inspectable and (within safe bounds) adjustable by an administrator without a code deployment — session TTLs, whether the login rate limiter is tripped for a given IP, active admin sessions with the ability to revoke one, and CORS/origin allow-lists.
**Owns:** Session/cookie policy display (and revocation actions against `admin_sessions`), rate-limit status, origin allow-list. Read-mostly initially; write access to security-critical fields is deliberately staged late (see Implementation Plan) given the blast radius of getting it wrong.

## 16. Developer Tools *(New)*
**State:** New — closes the `webhooks` collection gap (has a fully-implemented dispatch mechanism with **no admin endpoint to register a subscriber**) and gives visibility into the control plane.
**Why it exists:** External integrations (webhook subscribers for `meeting.started`/`meeting.ended`) currently require direct database access to configure — defeating the purpose of an admin console. This module also surfaces the `admin_commands` queue and control-plane health so operators can see whether admin actions are actually reaching the live meeting backend.
**Owns:** Webhook subscriber CRUD, control-plane/command-queue visibility, (future) API key management for third-party integrations.

## 17. Feature Flags
**State:** Exists (needs enforcement fix) — the CRUD and control-plane propagation both work; most flags have no effect on the meeting workspace (Gap Analysis Part B.4/C).
**Why it exists:** A simple boolean switchboard for gating features platform-wide, independent of Content (which is about copy, not behavior).
**Owns:** Feature flag records.
**Gap-driven change:** Split from Announcements (moved to Content, module 2); each flag this module exposes must have a corresponding server-side or client-side gate in the meeting workspace, or be removed from the editable list.

## 18. Roles & Permissions
**State:** Exists (complete) as the data model; the enforcement gap is entirely on the *consuming* side (module 6-17's pages don't read the logged-in admin's own permissions).
**Why it exists:** This is the actual source of truth for what each admin role can do — every other module's write actions should be gated by it, in the UI as well as the API.
**Owns:** Role definitions and permission sets, admin invitations.
**Gap-driven change:** Every other module must consume `admin.permissions` client-side to hide/disable controls the current admin can't use — today this data exists on the auth object but nothing reads it.

## 19. Audit Logs
**State:** Exists (needs bug fix) — the log viewer and CSV export work; the "Rollback State" button is broken (missing import) and, even fixed, is not scoped correctly to the log entry's actual target.
**Why it exists:** An immutable record of every administrative mutation, required for accountability and incident review.
**Owns:** Audit log records (read-only by nature).
**Gap-driven change:** Either properly implement per-entity rollback (requires storing before/after snapshots per entity type) or remove the button until it can be done correctly — a fake rollback control is worse than none.

## 20. Analytics
**State:** Exists (complete), to be merged/cross-linked with Dashboard (module 1) rather than kept as a fully separate, non-overlapping surface.
**Why it exists:** Deeper usage/language/role distribution reporting than the Dashboard's at-a-glance tiles.
**Owns:** Nothing writable — aggregation over Users/Meetings/Translation logs.

---

## Consolidation Summary

| Old pages | New module | Action |
|---|---|---|
| `ContentPage.jsx` + `PageBuilderPage.jsx` + Announcements half of `RegistryPage.jsx` | **Content** | Merge into one content-type-driven CMS |
| `MediaPage.jsx` + `MediaLibraryPage.jsx` | **Media Library** | Merge, delete the broken local-state prototype |
| `RegistryPage.jsx` (Feature Flags half) | **Feature Flags** | Keep, drop Announcements out of it |
| `SettingsPage.jsx` (Translation Settings instance) | **Translation** | Keep, get a dedicated page instead of the generic flat-form component |
| `SettingsPage.jsx` (Platform Settings instance) | **System** | Keep, merge display alongside System Health |
| `DashboardPage.jsx` + `AnalyticsPage.jsx` | **Dashboard** / **Analytics** | Keep both, cross-link; consider a shared metrics-fetching layer |
| *(none — new)* | **Meeting Experience**, **AI Models**, **Security**, **Developer Tools** | Build new, per findings above |

Full data-model detail for every module is in [ADMIN_DATA_MODEL.md](ADMIN_DATA_MODEL.md); the entity-by-entity ownership mapping (which page owns which document owns which API owns which frontend consumer) is in [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md).
