# VOXO Admin Console — Phased Implementation Plan

This plan sequences the work identified in [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md) and [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md) into phases. The order below is the authoritative sequencing, confirmed after review: build the reusable CMS engine first, then spend it down page-by-page in traffic order, defer Branding's harder CSS-token work until real usage has proven out which tokens matter, then move to the meeting workspace, the AI/translation pipeline, and finally the operator-facing modules (Security, Developer Tools) that carry the least end-user impact but the most blast radius if rushed.

Companion documents: [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) · [ADMIN_MODULES.md](ADMIN_MODULES.md) · [ADMIN_DATA_MODEL.md](ADMIN_DATA_MODEL.md) · [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md) · [ADMIN_GAP_ANALYSIS.md](ADMIN_GAP_ANALYSIS.md)

---

## Phase 0 — Confirmed bug fixes (parallel track, not blocking)

**Why separate from Phase 1:** these three items are small, isolated, and independent of the CMS work — they fix things that are already *supposed* to work today. They should not wait for or block Phase 1, but they're easy to lose track of once deep in content work, so they're called out as their own fast track to be done alongside or just before Phase 1 starts.

1. **Fix the voice-routing bug** — add a `voice_routing` attribute to `RuntimeSettingsManager` and load it from `platform_settings{key:"voice_routing"}` in `load_from_db()`. Makes an entire existing admin feature (Voice Models routing) actually work for the first time.
2. **Fix or remove the Audit Logs "Rollback State" button** — it currently throws a runtime error (`postAdmin` is never imported). Remove it for now; proper per-entity rollback is deferred to Phase 10 once there's snapshot infrastructure to do it correctly.
3. **Wire client-side permission enforcement** — every admin-frontend page/nav item reads `admin.permissions` (already present on the auth object) to hide/disable controls the current admin can't use. Doing this now means every module built from Phase 1 onward is permission-aware from the start, instead of retrofitting it into a growing number of pages later.

---

## Phase 1 — CMS Foundation ← **Delivered (items 1–3); items 4–5 still open**

**Why first:** every page-specific phase that follows (Landing, Navbar/Footer, Features/Solutions, Pricing, Blogs) is really the same generic problem — structured content with draft/publish state, sections/cards, and image assets — applied to a different page. Building the reusable engine once, before any specific page, means Phase 2 onward is "author content for page X," not "build another one-off editor."

**What was built**, additively, alongside (not replacing) the existing `admin_content`/`landing_sections` collections so nothing already live was touched:

1. **Data model** — a new `cms_pages` collection (`admin-backend/app/repositories/cms_repository.py`): one document per page key, holding a `draft` section list and a separately-snapshotted `published` section list side by side, plus a `version` counter. Every publish also writes an immutable snapshot to `cms_page_versions`, so version history exists from day one, not bolted on later. A page's status (`draft` / `modified` / `published`) is derived by comparing draft vs. published, not stored redundantly.
2. **Generic schema + API** — `admin-backend/app/cms/section_types.py` is a single registry of section types (hero, richtext, feature_grid, testimonials, faq, cta, custom) and their field schemas (text/textarea/richtext/image/url/boolean/number/select), consumed by `admin-backend/app/routers/cms.py`: `GET /api/admin/cms/section-types`, page CRUD (`GET/POST/DELETE /api/admin/cms/pages[/{page}]`), draft save (`PUT`), section add (`POST .../sections`), publish/revert (`POST .../publish`, `.../revert`), and version history (`GET .../versions`). `GET /api/public/cms/pages/{page}` (mirrored in `backend/app/routes.py`, matching how `/api/public/content` and `/api/public/languages` already read straight from Mongo) returns only the published, non-hidden sections — verified by 15 automated tests in `admin-backend/tests/test_cms.py` (now wired into CI as a new "Test admin backend" step) that a page's public output never leaks unpublished draft edits.
3. **Generic editor UI** — `admin-frontend/src/components/cms/{DynamicField,AssetPickerInput,SectionEditor,PagePreview}.jsx` render every field of every section type from the schema returned by step 2; none of them know what a "hero" or "faq" is. `admin-frontend/src/pages/CmsPage.jsx` (nav: **Pages**) is the one page-agnostic editor: create a page, add sections from the type registry, edit fields/cards, preview, save draft, publish, or revert — the same UI regardless of which page is selected. A generic public-side counterpart also now exists (`frontend/src/components/cms/GenericSectionRenderer.jsx`, `frontend/src/pages/CmsPageView.jsx`) but is **not yet wired into any route** — Phase 2 is where a real page first uses it.

**Still open, carried forward rather than done speculatively:**

4. **Media Library merge** — deferred, unchanged from Phase 0's description below. The new `AssetPickerInput` component uses `MediaPage.jsx`'s existing upload/list API as-is (upload + browse-and-pick), so the CMS editor isn't blocked on the merge, but the merge itself (deleting `MediaLibraryPage.jsx`'s broken non-persisting flow) still hasn't happened.
5. **Content vs. Branding ownership boundary** — not yet formally decided/enforced. No Branding-owned setting was moved, and no page content has been authored yet, so this decision is unforced for now but must be made before Phase 7 (Branding) or earlier phases risk producing content that should have lived in Branding instead.

**Output of this phase:** a working, tested generic content-type editor and API, proven with ad-hoc test pages during development — no *real* page's production content has been migrated onto it yet. Phase 2 is the first real content authored through it, and is also where the legacy `landing_sections`/`PageBuilderPage.jsx`/`ContentPage.jsx` path for the landing page gets retired in favor of this engine.

---

## Phase 2 — Landing Page ← **Delivered**; a few cleanup items carried forward

**Why second:** the highest-traffic page and the one with the most section/card variety (hero, marquee/showcase cards, core benefits, testimonials, FAQ, CTA) — proving the Phase 1 engine against the hardest case first surfaces any gaps in the generic editor before they're baked into five more pages' worth of content.

**What was built:**

1. **Data migration, not re-authoring** — a one-time, idempotent startup migration (`admin-backend/app/cms/migrate_landing.py`) copies whatever was already live (the legacy `landing_sections` collection if an admin had ever opened the old Page Builder, or the same `DEFAULT_PAGE_SECTIONS` seed otherwise) into `cms_pages["landing"]` as both draft and published v1 — so the live site's appearance did not change at all the moment this shipped. Landing's real content (hero, showcase, benefits, testimonials, FAQ, CTA) now flows through the Phase 1 engine end-to-end.
2. `HeroSection.jsx`'s CTA button labels and the 3 "micro indicator" strings now read from `cms` (with the exact previous strings as defaults), as originally planned.
3. Two new section types (`showcase`, `benefits`) were added to the Phase 1 registry, and the `testimonials` card fields were corrected to match what `TestimonialsSection.jsx` actually reads (`company`, `image_url` instead of a generic `avatar`) — gaps only visible once a real page exercised the schema, exactly as flagged as a risk in the Phase 1 report.
4. **Pixel-accurate Live Preview** (beyond what Phase 1 shipped): a short-lived, page-scoped signed token (`CMS_PREVIEW_SECRET`, mirroring the `CONTROL_PLANE_SECRET` pattern) lets the admin "Pages" editor open the *real* public `LandingPage.jsx` in an iframe against DRAFT content via a new `/preview/:page` public route, instead of the generic structural preview. The generic structural `PagePreview` remains the fallback for any page without a dedicated public route.
5. The legacy `PageBuilderPage.jsx` admin UI was retired (deleted; its route now redirects to `/admin/cms`) now that Landing is edited exclusively through the generic "Pages" module — eliminating the duplicated-editor risk of two UIs writing to two different places for the same page.

**Explicitly not done in this pass** (the hardcoded fallback data these items refer to is now dead in practice — real cards always come first — but the dead code itself was left alone to keep this migration's blast radius to data-source wiring only):
- `row1`/`row2` marquee arrays in `LandingPage.jsx` and `CoreBenefits`' 3 hardcoded cards were **not** deleted — they remain as a defensive fallback if a showcase/benefits section's `cards` array is ever empty.
- `TestimonialsSection.jsx`'s 4 hardcoded `defaultTestimonials` (including the pre-existing "Sarah Lin" `role`-duplicates-`author` data bug) were **not** touched.
- `FAQ.jsx`'s hardcoded `defaultQuestions` were **not** removed; `site.faqs` (`admin_content`) is still passed in as a secondary fallback.
- The now-superseded `admin_content` keys `landing.hero`, `landing.features`, `landing.testimonials` are dead (no longer read by `LandingPage.jsx`) but not deleted from the database.
- Publishing a Landing change is "page refresh required" (Architecture §4.3, Class 3), not yet an instant/live push — no control-plane broadcast was added for CMS publishes.

A follow-up cleanup pass (not blocking Phase 3) should delete the dead fallback arrays/keys above once confidence is high nothing depends on them, and consider promoting CMS publishes to the live-broadcast class.

### Phase 2 extension — rich text, SEO, scheduling schema, three new section types ← **Delivered**

A second pass over Phase 2, driven by a more detailed spec: full draft/publish/version/revert/visibility/order support (already delivered above) plus rich text, per-page SEO, a scheduling field, and three additional section types required for a complete Landing Page CMS.

1. **Real WYSIWYG editor, CMS-wide.** The `richtext` field type — declared in the Phase 1 registry but rendered as a plain `<textarea>` — now renders `admin-frontend/src/components/cms/RichTextEditor.jsx`, built on TipTap: headings (H2–H4), bold/italic/underline, links, bulleted/numbered lists, blockquote, code block, tables, images (reusing the existing Asset Library, not a separate upload path), video embeds (YouTube/Vimeo URLs normalized to their privacy-enhanced embed hosts), and a custom CTA-button node. Every section type's `body` field was switched from `textarea` to `richtext`. This is one component, reused by every current and future page/section — not a per-page or per-section-type copy.
2. **Server-side sanitization is the security boundary.** `admin-backend/app/cms/sanitize.py` (using `nh3`, a Rust-backed HTML sanitizer with prebuilt wheels — no compiler needed in the Docker build) runs an explicit tag/attribute allowlist over every `richtext` field on every draft save, including stripping `<script>`, event-handler attributes, `javascript:` URLs, and iframe `src` hosts outside an explicit allowlist (YouTube, YouTube-nocookie, Vimeo). The public frontend's `SafeHtml` component (DOMPurify) renders the already-sanitized HTML as defense-in-depth, not as the primary filter. Covered by 12 new unit tests in `admin-backend/tests/test_sanitize.py`.
3. **Three new section types**, added to `admin-backend/app/cms/section_types.py`: `statistics` and `trusted_by` — both ship with **zero cards by default**, since no real metrics or partner names/logos existed anywhere in the prior design; an admin must add real content before publishing, and the public components (`StatisticsSection.jsx`, `TrustedBySection.jsx`) render nothing extra when empty rather than showing placeholder data. `footer_cta` — a schema deliberately distinct from the existing general-purpose `cta` type (own `FooterCtaSection.jsx`), scoped to the closing banner immediately before the site footer, per an explicit decision that these serve different layout purposes.
4. **Page-level SEO metadata.** `seo` (`meta_title`/`meta_description`/`og_image_url`) was added alongside `sections` in the `cms_pages` draft/published documents, round-tripped through publish/revert/version snapshots the same way sections are, editable via a collapsible panel in the "Pages" admin module, and returned by the public page API. `LandingPage.jsx` applies these to `document.title` and the page's meta tags **only when explicitly set** — the static defaults already in `index.html` are left untouched otherwise, so this is additive, not a behavior change for pages that haven't set SEO yet. This substantially delivers Phase 7 item 5 ("verify SEO metadata fields... actually reach page `<head>` tags") early, for Landing specifically; Phase 7 should extend the same panel to every other page rather than re-deciding the mechanism.
5. **Scheduling — schema only, as scoped.** `scheduled_publish_at` is persisted on every draft save and cleared on revert, but there is no cron/worker that acts on it and no admin UI to set it yet. This is intentionally inert; a future phase would need to add both an enforcement job and a UI control before this does anything.
6. **Known gap carried forward, not introduced by this pass:** the Phase 2 live-preview iframe (`admin.giftme.watch` framing `giftme.watch/preview/*`) will be blocked in production by the `X-Frame-Options: SAMEORIGIN` header Caddy applies to `giftme.watch` — see [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) §4.4. Didn't surface in local testing since local dev has no Caddy/security-headers layer.

**Not done in this pass:** `docs/ADMIN_IMPLEMENTATION_PLAN.md`/`ADMIN_ARCHITECTURE.md` updates for anything beyond what's described here; the CI/CD workflow and Caddyfile needed no changes (new npm/pip dependencies are picked up automatically by the existing install/audit/build steps; no new routes, ports, or build args were introduced).

---

## Phase 3 — Navbar & Footer

**Why third:** this is the cheapest, highest-visibility fix in the entire plan — the data already exists (branding fields are already fetched by `ConfigContext`), so this phase is pure consumption wiring, not new CMS or backend work, and it removes brand-identity duplication (the "VX"/"VOXO" hardcoded 4 times) sitewide in one pass.

1. `Navbar.jsx` reads `branding.logo_url`/`branding.product_name` instead of hardcoded "VX"/"VOXO" text.
2. `Footer.jsx` receives its `cms` prop (via `MarketingPage.jsx`) on every page that uses it, not just the landing page — and its legal/copyright line reads `branding.copyright_text` instead of its own hardcoded string.
3. `LoginPage.jsx`/`SignupPage.jsx` read the same branding fields instead of their own hardcoded "VOXO" text.
4. `AboutPage.jsx`'s duplicate company-contact block reads `branding.company_name`/`company_email` instead of its own hardcoded copy.
5. Footer nav links move into the Phase 1 content engine (currently a hardcoded array) so they're editable without a deploy.

---

## Phase 4 — Features & Solutions

**Why fourth:** both pages already have a *dead* content fetch (they read `title`/`body` from the CMS but ignore the `items` field entirely) — this phase is "finish what's already half-wired," using the now-proven Phase 1 engine.

1. `FeaturesPage.jsx` renders its `flagship` (4 cards) and `capabilities` (20 items) from `admin_content{key:"features.page"}.items` instead of the hardcoded arrays.
2. `SolutionsPage.jsx` renders its 11 `solutions` tuples from `admin_content{key:"solutions.page"}.items` the same way.

---

## Phase 5 — Pricing

**Why fifth:** structurally similar to Phase 4 (fix a dead fetch), but sequenced after Features/Solutions since pricing tiers have a slightly different shape (numeric price fields, per-tier feature-comparison rows) that benefits from the content-type schema having already been exercised twice.

1. `PricingPage.jsx` actually renders `content.plans` (Starter/Professional/Enterprise tiers, the 9-row comparison matrix) instead of its fully hardcoded page.
2. Fix the inconsistent contact email (`sales@giftme.watch` vs. `support@worknai.tech` used elsewhere) as part of this migration.

---

## Phase 6 — Blogs

**Why sixth:** the most structurally distinct content type (posts have an author, publish date, category, and slug-based routing, unlike the flat sections used so far) — sequenced last among the content pages so it can reuse a mature, proven editor rather than being the page that first stress-tests the schema.

1. New `blog_posts` collection + CRUD router (list/create/edit/publish), replacing the hardcoded `articles` object in `BlogPage.jsx` entirely.
2. Wire `featureFlags.blogs` to actually gate whether the Blog nav link/page is shown (currently fetched but never checked).

---

## Phase 7 — Branding

**Why seventh:** deliberately after all the content-consuming pages, so implementation targets exactly the CSS variables real pages turned out to need, rather than guessing upfront. This is also the point where Login/Signup auth-page copy and legal/ToS/privacy-policy text (currently absent entirely) get added, since Branding owns the "company identity" surface those pages need.

1. Fix the CSS token wiring: primary/secondary color, font family, and border radius actually reach `tailwind.config.js`/`styles.css` (today only accent color does).
2. Wire `general_settings.theme` (light/dark default) so it actually influences `ThemeContext`'s initial state instead of being 100% client-preference-driven.
3. Add a live preview pane to `BrandPage.jsx` (a mock/iframe rendering of the current tokens applied) so the page's existing "live" claims become true.
4. Add auth-page marketing copy and real legal/ToS/privacy-policy text and links to Login/Signup (currently absent).
5. ~~Verify SEO metadata fields (meta description, keywords, OG/Twitter image) actually reach page `<head>` tags~~ — **partially delivered early**, in the Phase 2 extension above, for Landing only (`meta_title`/`meta_description`/`og_image_url`). Remaining for this phase: extend the same panel to every other page, and add `keywords`/dedicated Twitter-card fields if still needed beyond the `og:*` fallback most platforms already use.

---

## Phase 8 — Meeting Experience

**Why eighth:** the largest hardcoding category outside marketing content, and architecturally self-contained — it doesn't depend on any of Phases 1–7, only on the control-plane propagation pattern already documented in [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) §4.

1. **`meeting_policy_defaults` collection + API**: default host permissions, default layout, default translation mode. Wire `websocket_manager.py`'s room-creation path to read this instead of the hardcoded `RoomState` dataclass defaults, and delete the two duplicate hardcoded copies in `ChatPage.jsx`.
2. **Wire the translation-mode selector end-to-end**: `translation_modes` CRUD and the public endpoint already exist and are unreachable — add a mode picker to the join form and have it actually pass `translation_mode` on WS connect.
3. **File-sharing limits**: centralize the 25MB size limit and allowed-extensions list into one admin-editable setting consumed by both the backend upload validation and `FilesPanel.jsx`, removing the hand-synced duplication.
4. **Whiteboard/Notes defaults**: default tool/color/line-width/canvas-size and the autosave debounce become admin-editable.
5. **VAD presets and diagnostics thresholds**: make the preset threshold values and the diagnostics color cutoffs admin-editable, and resolve their disconnect from the existing `segment_silence_ms`/`maximum_latency_ms` DB settings (design decision needed: unify, or keep as deliberately separate, cross-documented tunables).

---

## Phase 9 — AI Models (+ Translation cleanup)

**Why ninth:** touches the STT/TTS pipeline directly, higher-risk than pure content/policy settings, so sequenced after every lower-risk phase has proven out the propagation pattern.

1. **Ship the AI Models module**: Whisper model/beam-size/device/compute-type and the `SPEECH_PROFILES` parameter sets move from env-vars/hardcoded dicts into `platform_settings{key:"ai_models"}`, admin-editable.
2. **Resolve the dead Translation settings** (`retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language`): implement the consuming logic for each, or remove it from the editable UI — don't leave settings that silently do nothing.
3. **Feature flag audit**: for each of the ~20 flags, wire an actual gate in the meeting workspace or remove it from the Feature Flags module until it does something; document which flags are live vs. reserved.
4. **Reconcile the default-flag-value mismatch** between the public backend's in-memory defaults and the admin backend's Mongo-seed defaults.

---

## Phase 10 — Platform Management

**Why tenth:** consolidates the remaining operator-facing surfaces (Users, Organizations, Roles & Permissions, System, Dashboard/Analytics) that are largely already complete or backend-only — this phase is about finishing/cross-linking them, not building new architecture.

1. **Organizations admin-frontend page** — the backend (`enterprise.py`) already has list/create endpoints; build the missing UI.
2. **Cross-link/merge Dashboard and Analytics** into one coherent metrics home.
3. **Consistency pass** across list pages: replace the ad hoc `axios` calls in `FeedbackPage.jsx`/`LanguagesPage.jsx`/`VoicesPage.jsx` with the shared API client; bring server-side pagination to pages that currently only filter client-side.
4. **Proper audit-log rollback** (deferred from Phase 0): now that content versioning (Phase 1) and meeting policy defaults (Phase 8) exist as concrete per-entity models, implement real before/after snapshot rollback instead of the removed placeholder button.
5. **Migrate the legacy HTTP reload-config webhook onto the control-plane pattern** — replace the hardcoded, unauthenticated direct POST (branding/page-builder/general-settings changes) with signed control-plane commands, and add authentication to `/api/internal/reload-config` as a safety net regardless.

---

## Phase 11 — Security

**Why eleventh:** deliberately near the end — session/cookie/rate-limit policy has the highest blast radius of any module (a bad value can lock out every administrator), so it's built only once every earlier phase has established a working, trusted pattern for propagation and permission-gating.

1. **Read-only first**: surface session TTLs, cookie policy, rate-limit thresholds, and the list of active `admin_sessions` with a revoke action (the repository method already exists, just needs a route).
2. **Editable settings, only after the read-only version has been in use**: session lifetime and rate-limit thresholds become editable last of all.

---

## Phase 12 — Developer Tools

**Why last:** the lowest end-user impact of any module — useful for operators integrating third-party systems, not something any admin needs day-to-day.

1. **Webhook subscriber CRUD** — the `webhooks` collection and `dispatch_event` logic already exist; this is purely adding the missing admin endpoint and UI.
2. **Command-queue detail view**, extending the existing `admin_commands` count already shown in System into a full inspection view for debugging control-plane delivery.

---

## Summary table

| Phase | Focus | Depends on | Primary risk |
|---|---|---|---|
| 0 | Confirmed bug fixes (parallel track) | Nothing | Low |
| 1 | CMS Foundation | Nothing (Phase 0 recommended alongside) | Low — **delivered** (schema/API/editor); Media merge + Content/Branding boundary still open |
| 2 | Landing Page (+ extension: rich text, SEO, scheduling schema, 3 new section types) | Phase 1 | Low — **delivered**; dead fallback-array/key cleanup, live-broadcast-on-publish, and the preview-iframe `X-Frame-Options` production gap (§4.4) still open |
| 3 | Navbar & Footer | Nothing (pure consumption of existing data) | Low |
| 4 | Features & Solutions | Phase 1 | Low |
| 5 | Pricing | Phase 1, informed by Phase 4 | Low |
| 6 | Blogs | Phase 1, informed by Phases 2–5 | Low–Medium |
| 7 | Branding | Informed by real usage from Phases 2–6 | Low–Medium |
| 8 | Meeting Experience | Control-plane pattern only (Architecture §4) | Medium |
| 9 | AI Models + Translation cleanup | Control-plane pattern proven by Phase 8 | Medium–High |
| 10 | Platform Management | Phases 1 (versioning) and 8 (policy model) for rollback | Medium |
| 11 | Security | Every earlier phase's propagation/permission pattern | Medium–High |
| 12 | Developer Tools | Nothing blocking | Low |

Each phase should conclude with updates to [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md), flipping the relevant rows from ❌/⚠️ to ✅, so the mapping document stays a living, accurate reflection of the system rather than a one-time snapshot.
