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

## Phase 3 — Navbar & Footer ← **Delivered**, with one scope change from the original plan

**Why third:** originally scoped as pure branding-field consumption wiring (see the struck-through plan below). Once actually implemented, the requirement grew to include full Draft/Publish/Revert/Version-History for nav and footer links — that needs the Phase 1 generic CMS pages/sections/cards engine (the same one Features/Solutions/Pricing use), not a flat `admin_content` read. Delivered using that engine instead, so nothing here is a second CMS system.

**What shipped:**
1. Two new CMS pages via the existing generic engine — `cms_pages{page:"global-nav"}` (section type `navbar`) and `cms_pages{page:"global-footer"}` (section type `footer`) — both manageable through the same `/admin/cms` Pages UI Features/Solutions/Pricing already use, with zero new admin-frontend code required.
2. `Navbar.jsx` and `Footer.jsx` now self-fetch their CMS page (`getCmsPage("global-nav"/"global-footer")`), replacing the hardcoded "VX"/"VOXO" text with `logo_image_url`/`product_name` (falls back to the original text mark when no image is set) and the hardcoded link arrays with CMS cards — original hardcoded arrays kept only as the fallback when CMS data is empty/unreachable.
3. Nav links support optional dropdown/mega-menu nesting via a card's `parent_label` field (set it to another link's label to nest under it); footer links support optional grouping via a card's `group` field. Both are inert by default (seeded data has neither set), preserving the original flat layout exactly.
4. Footer gained optional `contact_email`/`contact_phone` fields (blank by default, rendered only when set) and social-link icons sourced from the *existing* `platform_settings{key:"branding"}` `social_twitter`/`social_linkedin`/`social_github`/`social_youtube` fields (already admin-editable in `BrandPage.jsx`, previously fetched but never rendered anywhere) — reused rather than duplicated.
5. `ConfigContext.applyThemeTokens` now also writes `meta[name=description]`, `meta[name=keywords]`, `og:*`, and `twitter:*` tags from the same already-fetched `branding` object, closing the "Global Site Settings" gap without any new backend surface (favicon/title were already wired).

**Deliberately not done in this pass** (out of the phase's stated scope, tracked for later): `LoginPage.jsx`/`SignupPage.jsx` reading branding fields instead of their own hardcoded "VOXO" text, and `AboutPage.jsx`'s duplicate company-contact block reading `branding.company_name`/`company_email`. Both remain good candidates for Phase 7 (Branding), whose item 4 already covers auth-page copy.

<details>
<summary>Original plan (superseded by the above)</summary>

**Why third:** this is the cheapest, highest-visibility fix in the entire plan — the data already exists (branding fields are already fetched by `ConfigContext`), so this phase is pure consumption wiring, not new CMS or backend work, and it removes brand-identity duplication (the "VX"/"VOXO" hardcoded 4 times) sitewide in one pass.

1. `Navbar.jsx` reads `branding.logo_url`/`branding.product_name` instead of hardcoded "VX"/"VOXO" text.
2. `Footer.jsx` receives its `cms` prop (via `MarketingPage.jsx`) on every page that uses it, not just the landing page — and its legal/copyright line reads `branding.copyright_text` instead of its own hardcoded string.
3. `LoginPage.jsx`/`SignupPage.jsx` read the same branding fields instead of their own hardcoded "VOXO" text.
4. `AboutPage.jsx`'s duplicate company-contact block reads `branding.company_name`/`company_email` instead of its own hardcoded copy.
5. Footer nav links move into the Phase 1 content engine (currently a hardcoded array) so they're editable without a deploy.

</details>

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

## Phase 7 — Branding ← **Delivered (items 1, 2, 5)**; item 3 (live preview pane) and the legal/ToS copy half of item 4 remain open

**Why seventh:** deliberately after all the content-consuming pages, so implementation targets exactly the CSS variables real pages turned out to need, rather than guessing upfront. This is also the point where Login/Signup auth-page copy and legal/ToS/privacy-policy text (currently absent entirely) get added, since Branding owns the "company identity" surface those pages need.

**What shipped:**
1. **CSS token wiring fixed** — but not the way originally sketched. `primary_color`/`secondary_color` were found to share the *exact same* `:root` CSS variables (`--color-bg-primary`/`--color-surface`) as the light/dark theme system, with values (`#0F172A`/`#1E293B`) that closely match the existing dark-theme defaults — confirming these fields were designed as dark-theme customization, not theme-invariant colors like `accent_color`. Applying them as an unconditional inline-style override (the way `accent_color` already worked) would have visibly broken light mode by default. Fixed instead via a dynamically-managed `<style>` tag scoped to `[data-theme="dark"]`, so light mode is untouched and dark mode picks up the admin's colors — verified live in both states. `font_family` now has a real consumer (`body`'s CSS now reads `var(--font-family, <original literal stack>)` instead of a static list). `border_radius` is wired to `--radius-panel` only, not `--radius-control` (that var has a different default value — 10px vs. panel's 12px, which happens to equal the field's own default of `0.75rem` — aliasing both would have shifted button/input corners by 2px on every unconfigured install). `heading_font_family` and `button_style` remain unwired — no existing CSS hook for either without inventing new per-heading/per-button-variant rules, which was judged out of "reuse existing" scope.
2. **`general_settings.theme` now influences the default theme** — `ThemeContext` reads it as a fallback, but only before the visitor has ever made an explicit choice (a stored preference at mount, or a manual toggle during the session, always wins and is tracked separately so a later live settings update can't silently override a user's manual choice).
3. **Dual light/dark favicon** — `favicon_url`/`favicon_dark_url` now render as two `<link rel="icon" media="prefers-color-scheme:...">` tags (native browser-level light/dark selection, independent of the site's own theme toggle since favicons render against OS/browser chrome).
4. **SEO/OG/Twitter meta tags** (delivered in Phase 6, unchanged here) plus a genuinely new closed loop: `company_website` (new field, added to the schema, `BrandPage.jsx`, and both backends' defaults) plus the existing `company_name`/`company_email`/social links are now actually consumed — see "Global Branding Consumption" below.
5. **Global Branding Consumption**: `LoginPage.jsx`/`SignupPage.jsx` now read `branding.product_name`/`logo_url` instead of hardcoded "VOXO" text. `AboutPage.jsx`'s company-contact block now reads `branding.company_name`/`company_email`/`company_website` instead of its own hardcoded "WorknAI Technologies..." copy (only its static "India" location line stays hardcoded — not a branding-schema field). `Navbar.jsx`/`Footer.jsx` (already CMS-driven per-page since Phase 3/6) now fall back to the site-wide `branding.logo_url`/`logo_dark_url` (theme-aware) and `branding.footer_text`/`copyright_text` before their final hardcoded literal, so Branding is a real fallback tier, not dead data, without re-doing Phase 6's CMS work.

**Deliberately not done in this pass** (out of today's stated scope): a live preview pane on `BrandPage.jsx` (item 3, unchanged from the original plan — no live task requested it); real legal/ToS/privacy-policy marketing copy on Login/Signup (item 4's *content* half — only the *branding-consumption* half, product name/logo, was requested and delivered).

---

## Phase 8 — Meeting Experience ← **Delivered (items 1–3, revised scope below)**; items 4–5 remain open

**Why eighth:** the largest hardcoding category outside marketing content, and architecturally self-contained — it doesn't depend on any of Phases 1–7, only on the control-plane propagation pattern already documented in [ADMIN_ARCHITECTURE.md](ADMIN_ARCHITECTURE.md) §4.

**Audit correction:** item 1 as originally scoped assumed `websocket_manager.py` still read hardcoded `RoomState` defaults. That turned out to be stale — Phase 3 (`meeting_policy` + its `RoomConnectionManager.connect()` wiring) had already closed that gap: `max_participants`, `waiting_room_enabled`, `screen_sharing_enabled`, `recording_enabled_default`, `translation_enabled_default`, `captions_enabled_default`, `meeting_timeout_minutes`, `idle_participant_timeout_minutes`, `allow_guest_join`, and `require_host_to_start` were all already persisted, snapshotted onto each room at creation, and enforced. What Phase 8 actually found and fixed instead:

**What shipped:**
1. **Two silent enforcement gaps closed on the frontend.** The backend already computed and broadcast `screen_sharing_enabled`/`recording_enabled`/`captions_enabled` in its `room_policy` event, but `ChatPage.jsx`'s handler only read `locked`/`chat_enabled`/`translation_enabled` off that same payload — the other three fields were sent and silently dropped. A participant with screen sharing or recording disabled by policy could still click the button and get a no-op with no explanation; captions had no gate at all. Fixed: the screen-share button, the record button, and the captions checkbox now read the live policy state, disable themselves, and show "disabled by an administrator" — matching the task's own examples ("Screen sharing disabled → existing screen-share control behaves accordingly").
2. **Infinite-reconnect bug on meeting-policy rejection fixed.** `MeetingPolicyRejected` (participant limit reached, waiting for host, guests disabled) closes the socket with code 4001 and a reason string — but `ChatPage.jsx`'s `onclose` handler had no branch for 4001, so it fell into the generic path and retried the same doomed connection every 1.2s forever, showing a misleading "Reconnecting..." message. Fixed with a dedicated 4001 branch (same pattern as the existing 1008/auth-failure branch): stop retrying, surface the server's exact reason. Live-verified: a rejected third participant now sees a stable "This meeting has reached its participant limit." with zero further WS attempts.
3. **File-sharing limits centralized and made admin-configurable**, per the task's explicit ask. The 25MB size cap and the 18-extension allowlist were hardcoded directly in `routes.py`'s upload handler. Both are now `meeting_policy` fields (`max_file_size_mb`, `allowed_file_extensions`), defaulting to the exact prior hardcoded values (zero behavior change until an admin edits them), read live from `runtime_settings.meeting_policy` on every upload. The generic admin `SettingsPage.jsx` form had no array-field support at all — editing `allowed_file_extensions` and saving would have silently corrupted it into a string (then exploded character-by-character by Python's `set()` on the next upload). Added array-aware editing (draft-then-commit-on-blur, so typing a comma doesn't fight the re-render) as a small, targeted fix to the shared component, not a new one-off widget.
4. **Translation-mode flow completed end-to-end**, per the task's explicit ask. `translation_mode` (selected at WS-join, "General" by default) was already threaded from admin CRUD → persisted room state → runtime → translation pipeline, but the pipeline only used it as a cache-key discriminator — a mode's admin-authored `preferred_terminology` dict was captured and stored but never read back and applied. Added `TranslationService._load_mode_terminology()`, applied the same way as the existing general glossary (term substitution on the translated output), scoped to non-"General" modes only. `translation_prompt`/`llm_config` remain genuinely unconsumed — LibreTranslate is a plain MT API with no prompt-injection surface, so "applying" a prompt to it isn't possible without swapping providers, which is out of scope here.

**Deliberately not done in this pass** (out of today's stated scope — the task asked to "preserve the current UI," not add to it): a frontend mode-*picker* UI. No page in `frontend/src` reads `/api/public/translation-modes` or lets a user choose a mode before/during join; the query param defaults to `"General"` unconditionally today. Building that selector is a new UI surface, not "make the existing UI reflect configured policy," so it's left for a future phase. Also not touched: item 4 (whiteboard/notes defaults) and item 5 (VAD presets/diagnostics thresholds) — neither was part of this task's explicit scope.

---

## Phase 9 — AI Models (+ Translation cleanup) ← **Delivered (item 1, revised scope below)**; items 2–4 remain open

**Why ninth:** touches the STT/TTS pipeline directly, higher-risk than pure content/policy settings, so sequenced after every lower-risk phase has proven out the propagation pattern.

**Audit correction:** item 1 as originally scoped assumed the AI Models page's settings were simply never wired up. The actual state was worse and more interesting: `runtime_settings.py` never defined `self.ai_settings` or `self.voice_routing` at all. `ai_settings` being undefined meant the AI Models page's edits were pure write-only storage. `voice_routing` being undefined was an active, silently-swallowed bug: `app/tts/voice_router.py`'s `resolve_voice_route()` referenced `runtime_settings.voice_routing` inside a bare `try/except Exception: pass`, so every call raised `AttributeError`, was silently caught, and fell through to static file-based routing — meaning the admin's already-fully-built Voice Routing UI (`VoicesPage.jsx`, `POST /api/admin/voices/routing`) had **zero effect** despite looking completely functional end-to-end in the admin console.

**What shipped:**
1. **`voice_routing` bug fixed.** Added `self.voice_routing: dict` to `RuntimeSettingsManager`, loaded from `platform_settings{key:"voice_routing"}` on startup, updated live via the already-existing `UPDATE_SETTINGS` control-plane command (admin-backend's publish side was already correct — only the receiving side was missing). Live-verified: routing `en/masculine` to a different installed voice via the admin API changed `GET /tts/status`'s `voices.en.routes.masculine.selected_model` on the running backend with no restart.
2. **`ai_settings` loaded and consumed, but de-duplicated rather than given a second life as an independent store.** Auditing where Whisper's model name actually gets read (`app/stt/service.py`) found it already reads `runtime_settings.translation_settings.get("stt_model", ...)` — a *different* field on the *Translation Settings* page, already wired to a live-reload path (`stt_service.update_model()` on change, via Phase 3's `websocket_manager.py` control-plane handler). The AI Models page's own `whisper_model`/`whisper_beam_size` fields were a second, completely disconnected copy of the same concept. Rather than build a competing pipeline, `update_ai_settings()` now write-throughs `whisper_model`→`stt_model` and `whisper_beam_size`→`beam_size` into the Translation Settings document and republishes only the changed keys (so a beam-size-only edit doesn't trigger an unnecessary Whisper reload); `get_ai_settings()` reads them back from there so both pages always agree. The same bug and fix applied to `translation_provider_url` (dead) vs. `libretranslate_endpoint` (the field `LibreTranslateProvider` actually reads). Live-verified: changing `whisper_model` via the AI Models page changed `GET /stt/status`'s reported model immediately; changing `translation_provider_url` changed the live `libretranslate_endpoint` on the Translation Settings document.
3. **`whisper_device`/`whisper_compute_type` classified as deployment-only**, per the task's explicit request to separate runtime-configurable settings from deployment-controlled ones. Changing the STT device/compute backend at runtime without a process restart is unsafe (no GPU context to switch to, no clean unload), so these are env-var-only (`WHISPER_DEVICE`/`WHISPER_COMPUTE_TYPE`), always echoed at their live value on GET, and silently stripped from any PATCH payload rather than persisted-but-ignored.
4. **Validation added** where none existed: unknown Whisper model names, beam size out of a 1–10 range, unsupported `stt_provider`/`tts_provider`/`translation_provider` values (only one implementation of each currently exists), non-positive Piper timeouts, and unknown voice-routing keys (checked against the scanned `voice_models` catalog) all now return `400` instead of silently persisting.
5. **Live runtime status surfaced**: new `GET /api/admin/ai-settings/status` proxies the public backend's own `/stt/status`/`/tts/status` (model loaded, ready, per-voice file existence) — read-only, no secrets, no filesystem paths beyond what those endpoints already exposed.
6. **Admin UI reorganized without a redesign**: `SettingsPage.jsx` (the same generic component every settings module already uses) gained three new optional, reusable props — `sections` (labeled grouping), `readOnlyKeys` (disabled fields with a "deployment-controlled" note), `statusEndpoint` (a small live-status card) — and the AI Models route now uses all three to group its fields into Speech-to-Text / Text-to-Speech / Translation Provider, exactly as requested. Also fixed in passing: the array-field editing added in Phase 8 had no equivalent gap here, but a genuinely new bug was found and fixed — `SettingsPage`'s save button previously sent whatever partial `values` state was in memory, which is fine for normal use (the form always loads the complete object first) but was a trap for anything that PATCHed a subset directly.

**Deliberately not done** (items 2–4, out of this task's explicit scope): auditing and either wiring or removing each of the still-inert Translation settings (`retry_count`, `maximum_latency_ms`, `cache_timeout_seconds`, `max_segment_seconds`, `tts_profile`, `auto_play_translated_audio`, `fallback_language`); a full audit of all ~20 feature flags for a live gate; reconciling the public backend's in-memory feature-flag defaults against the admin backend's Mongo-seed defaults. Also not done: moving `SPEECH_PROFILES` (Piper's length-scale/noise tuning presets) to admin-editable storage — these remain env-var/hardcoded, which is defensible as deployment-level audio tuning rather than per-meeting policy, but wasn't explicitly requested either way this pass.

---

## Phase 10 — Platform Management ← **Delivered (revised scope below)**; items 2–3, 5 remain open

**Why tenth:** consolidates the remaining operator-facing surfaces (Users, Organizations, Roles & Permissions, System, Dashboard/Analytics) that are largely already complete or backend-only — this phase is about finishing/cross-linking them, not building new architecture.

**Audit correction:** a parallel audit across Organizations, Dashboard/Analytics/Monitoring, User Management, Feature Flags, and Infrastructure found the *shape* of the original plan roughly right (mostly finishing work, not new architecture) but the *content* very different from what item 1 assumed. Dashboard/Analytics/System Health/Infrastructure were already fully real (no fabricated metrics anywhere — CPU/memory via `psutil`, latency via real `translation_logs` aggregation, service health via genuine network probes). The real problems were concentrated in Organizations, permissions, and feature flags, several of them serious enough to reclassify this from "polish pass" to "fix real bugs":

**What shipped:**
1. **Organizations was completely inaccessible to every admin, including "Administrator."** `enterprise.read`/`enterprise.write` — the exact permission strings `enterprise.py`'s three routes require — were simply absent from `ALL_ADMIN_PERMISSIONS`. Since the "Administrator" system role's permission list *is* `sorted(ALL_ADMIN_PERMISSIONS)`, no account of any role could ever reach `/api/admin/enterprise/*` — the admin-frontend page rendered fine and every API call it made 403'd. Fixed by adding both scopes. Then completed the CRUD itself: added `PATCH` (name/domain/branding/status — previously create+read only), audit logging on create/update (previously none), a branding editor in the UI (backend already stored it, UI never exposed it), and membership assignment reusing the existing user-update endpoint (`org_id` added to `UserUpdate`) rather than a new membership-mutation route.
2. **A real security gap in `require_permission()`/`public_admin()`:** `admin.get("admin_permissions") or ALL_ADMIN_PERMISSIONS` treats an explicitly-empty list (a role deliberately given zero permissions) the same as a missing field, silently granting *every* permission instead of none. Fixed by checking `is None` instead of falsy.
3. **A disabled/banned user's still-valid JWT could open a brand-new meeting WebSocket connection** (and download meeting files) after being banned — REST calls already correctly rejected disabled users (`get_current_user` checks `is_disabled`/`deleted_at`), but `routes.py`'s `_get_user_from_token` (used by `/ws/{room_id}/...` and the file-download route) never did the same check. Fixed to match. Live-verified against the real running server: a disabled user's pre-issued token now gets a `1008` close, same as an unauthenticated connection. (Not fixed, and flagged as remaining debt: an *already-open* session at the moment of a ban is only asked to disconnect via a best-effort `force_logout` message, not forcibly closed server-side — see the Security-relevant gaps note below.)
4. **Editing a role's permissions never propagated to admins already assigned that role** (a stale snapshot taken at assignment time) — `update_role()` now fans the new permission list out to every `users` document with that `admin_role`. Relatedly, `UsersPage.jsx`'s admin-role dropdown was hardcoded to 3 options, so a custom role created on the Roles page could never actually be assigned to anyone from the UI; it now fetches the real role list.
5. **Feature flags: 20 of 22 keys were dead**, and only 2 (`video_calling`, `voice_translation`) gated anything, both client-side only. Three of the dead ones (`live_captions`, `recording`, `screen_sharing`, plus `waiting_room`/`captions` which were never even reachable from the admin UI) were pure duplicates of `meeting_policy`'s already-live, already-enforced equivalents — removed entirely from `runtime_settings.py`, with a one-time startup cleanup (`_cleanup_deprecated_feature_flags` in admin-backend's `main.py`) deleting the now-orphaned documents so the duplication doesn't just move from the defaults list into the database. `admin-backend`'s `FEATURE_FLAG_DEFAULTS` only had 7 of the remaining ~17 keys, so most flags were invisible in the Admin Console despite existing at runtime — synced to the full set. Four previously-dead flags were given real gates where the UI made it cheap and safe: `whiteboard`/`meeting_notes`/`files`/`diagnostics` now actually hide their tab in the meeting workspace when disabled (live-verified: toggling `whiteboard` off in the admin console removed it from the running meeting's tab list with no reload). The remaining ~13 keys are explicitly labeled "Reserved — toggling this has no effect" in their admin-facing description rather than left silently inert, per the instruction that every configurable-looking setting must either work or say so.
6. **A pre-existing, much larger bug found while fixing the latency-metric dilution issue**: text-chat's translation-log call referenced `translated_text`, a name never assigned anywhere in that function's scope — every call raised `NameError`, silently caught by the surrounding `except`, meaning **no text-chat message has ever actually reached `translation_logs` or `update_translation_stats`** in this codebase's history. Fixed to `result.translated`. While in there, also fixed the originally-targeted bug: chat translation logging hardcoded `latency_ms=0`, diluting the Dashboard/System Health average-latency metrics with fake zeros; it's now measured with `perf_counter()` around the real translation call, matching the voice pipeline's convention of `None` (excluded by Mongo's `$avg`) rather than a fabricated number when a stage doesn't apply.

**Deliberately not done** (items 2, 3, 5 from the original plan — out of this pass's scope): merging Dashboard and Analytics into one page; the `axios`-to-shared-client consistency pass across `FeedbackPage.jsx`/`LanguagesPage.jsx`/`VoicesPage.jsx`; migrating the legacy unauthenticated `/api/internal/reload-config` webhook onto the control-plane pattern. Also not done: forcibly closing an *already-open* WebSocket session the instant a ban is issued (today's `force_logout` remains a best-effort client-cooperation notify, consistent with how every other admin command in this system already works — mute, kick, etc. — changing just this one path's semantics felt like a separate, riskier piece of work given how delicate the reconnect/host-grace-period logic already is, not something to fold into a permissions-audit pass); and wiring real, independent gates for the ~13 feature flags that don't map to any existing togglable UI surface (`payments`, `breakout_rooms`, `stt`/`tts` independent of `voice_translation`, etc.) — building fake behavior for flags with no real feature behind them isn't in scope, so they're honestly labeled reserved instead.

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
| 3 | Navbar & Footer | Phase 1 (generic CMS engine, once scope grew to require Draft/Publish/Version History) | Low — **delivered** |
| 4 | Features & Solutions | Phase 1 | Low |
| 5 | Pricing | Phase 1, informed by Phase 4 | Low |
| 6 | Blogs | Phase 1, informed by Phases 2–5 | Low–Medium |
| 7 | Branding | Informed by real usage from Phases 2–6 | Low–Medium — **delivered** (items 1, 2, 5); live preview pane and legal/ToS auth-page copy still open |
| 8 | Meeting Experience | Control-plane pattern only (Architecture §4) | Medium |
| 9 | AI Models + Translation cleanup | Control-plane pattern proven by Phase 8 | Medium–High |
| 10 | Platform Management | Phases 1 (versioning) and 8 (policy model) for rollback | Medium |
| 11 | Security | Every earlier phase's propagation/permission pattern | Medium–High |
| 12 | Developer Tools | Nothing blocking | Low |

Each phase should conclude with updates to [ADMIN_ENTITY_MAPPING.md](ADMIN_ENTITY_MAPPING.md), flipping the relevant rows from ❌/⚠️ to ✅, so the mapping document stays a living, accurate reflection of the system rather than a one-time snapshot.
