# VOXO Release Changelog

All notable changes to the VOXO platform are documented in this file.

## [v2.5.0] - Production Release & Rebrand

### Rebranding & UI/UX Overhaul
- **Brand Identity**: Rebranded platform from *Translation Bot* to **VOXO**.
- **SaaS Header Layout**: Redesigned main header layout with centered navigation links (`Home`, `Features`, `Solutions`, `Pricing`, `Help Centre`, `About`), fixed left brand logo, right CTA actions, sticky blur glassmorphism backdrop, and responsive mobile drawer menu.
- **Original Vector Artwork**: Created custom, infinitely scalable SVG/React vector hero illustration (`HeroIllustration.jsx`) with connected global nodes, speech translation waves, and live caption cards.
- **Executive Testimonials Section**: Created `TestimonialsSection.jsx` featuring glassmorphic review cards and verified privacy/compliance highlights.
- **About Page**: Implemented `/about` page for *WorknAI Technologies India Pvt. Ltd.* outlining company mission, engineering philosophy, and privacy-first values.

### Root-Cause Bug Fixes
- **False Disconnect Badges**: Fixed `MemberCard` in `ChatPage.jsx` where room participants were marked as "Disconnected" because presence checked WebRTC media stream connections instead of WebSocket room presence. Added distinct badges for `In Room` vs. `Audio Connected`.
- **Tab-Switching Disconnects**: Resolved WebSocket teardown bug where clicking side-panel tabs (`Chat`, `Notes`, `Whiteboard`, `Files`, `Diagnostics`, `Translation`) disconnected the socket and killed calls. Removed `meetingPanel` from the WebSocket connection `useEffect` dependency array and decoupled UI tab state from session connectivity.

### Multi-Modal Translation Pipeline
- **Language Normalization**: Fixed language code normalizations (`es-ES` $\rightarrow$ `es`, `zh-CN` $\rightarrow$ `zh`) across text and voice pipelines.
- **Fallback Recovery**: Updated `detect_language_profile` in `translation/service.py` to prevent short messages from defaulting to unsupported languages; enforce user preference language hints.

### Real-Time Admin Control Plane
- **Live Configuration Propagations**: Added `POST /api/internal/reload-config` endpoint in `backend/app/routes.py` to reload in-memory runtime settings and broadcast real-time `system_config_updated` WebSocket events to connected workspace clients whenever feature flags or system settings change.
- **Audit Logging**: Verified end-to-end recording of administrative actions in the MongoDB `audit_logs` collection.

### Security Hardening
- **Security Headers Middleware**: Implemented `SecurityHeadersMiddleware` returning `nosniff`, `DENY` frame options, `1; mode=block` XSS protection, `Strict-Transport-Security`, and strict referrer policy.
- **Strict Origin & File Size Validation**: Hardened CORS validation and enforced 25MB file upload stream chunk limits.

### Performance Optimization
- **Route Code Splitting**: Applied `React.lazy` and `Suspense` across all user pages in `App.jsx` with loading fallbacks and error boundaries.
