# VOXO Stabilization Sprint — Session Handoff

**Date:** 2026-07-27
**Scope:** Priorities 0–4 of a production stabilization sprint (CI/CD, WebRTC, WebSocket layer, speech translation pipeline, collaboration features + security).
**Purpose of this document:** Complete, self-contained context for continuing this work in a new session without re-deriving anything already established.

---

# Project Overview

## Architecture

**VOXO** (internal name "LinguaLink" in earlier memory) is a real-time multilingual meeting platform. Repo root: `C:\Users\Bhumika\Documents\Codex\2026-05-22\translation_bot`.

**Backend** (`backend/`): FastAPI + uvicorn, single ASGI app (`app/main.py`).
- **Persistence:** MongoDB via `motor` (async driver), repository pattern (`app/repositories/*.py`) for users, rooms, messages, translation logs.
- **In-memory state:** `RoomConnectionManager` (`app/websocket_manager.py`) owns live `RoomState`/`ClientSession` objects for connected WebSocket sessions — this is ephemeral, per-process state, separate from MongoDB.
- **Auth:** JWT (PyJWT) + bcrypt (passlib), `Depends(get_current_user)` (`app/auth/dependencies.py`) for HTTP routes; WebSocket auth via `?token=` query param (headers aren't available for browser-native WS/`<img>`/`<a>` elements).
- **Speech pipeline:** faster-whisper (STT) → langdetect + script heuristics (language detection) → LibreTranslate (translation, separate Docker service) → Piper (TTS, subprocess-based).
- **Signaling:** WebRTC offer/answer/ICE relayed over the *same* authenticated WebSocket connection used for chat — no separate signaling server.
- **Admin:** fully separate `admin-backend/` + `admin-frontend/` apps (not touched this sprint except where shared, e.g. `runtime_settings`).

**Frontend** (`frontend/`): React 19, Vite 6, Tailwind, react-router-dom 7, axios. Single large page component `src/pages/ChatPage.jsx` owns the WebSocket, all `RTCPeerConnection` instances, and call state; feature panels (`WhiteboardPanel.jsx`, `NotesPanel.jsx`, `FilesPanel.jsx`, `DiagnosticsPanel.jsx`, `TranslationPanel.jsx`, `VideoGrid.jsx`, `VideoCall.jsx`) are presentational children.

**Infra:** Docker Compose (`docker-compose.yml` for local dev; `deploy/docker-compose.prod.yml` for production), Caddy reverse proxy + TLS, GitHub Actions CI/CD (`.github/workflows/ci-cd.yml`).

## Important Design Decisions Preserved (do not "fix" these — they're intentional)

- **Hub-and-spoke WebRTC topology, not full mesh.** Participants only ever create offers *to the host* (`createOfferForPeer(hostId)`); the host never proactively offers to participants. Correct for 2–4 person calls; would need an SFU for larger meetings (already noted in `docs/WEBRTC_FLOW.md`'s "Production Recommendation").
- **`sender.preferred_language` is dual-purpose by design.** It's explicitly labeled "Your Spoken Language" in the join form and serves as *both* the signal for what language the sender is speaking *and* what language they want translations delivered in. This was leveraged directly in the Priority 3 language-detection fix — treat it as a deliberate, trustworthy signal.
- **No auto-detect language option exists.** Every user picks one of 10 fixed languages (ar, de, en, es, fr, hi, it, nl, pt, ru) — confirmed by reading `LANGUAGE_OPTIONS` in `ChatPage.jsx`. Don't assume an auto-detect mode needs preserving; there isn't one.
- **Session identity is intentionally ephemeral.** The backend issues a brand-new `session_id` (`uuid4()`) on every WebSocket connect — there is no resumable session token for ordinary participants. This was a deliberate scope boundary in Priority 1 (see below) — full "survive refresh" support was explicitly deferred, not overlooked.
- **Host role is assigned by first-to-join**, with manual `PROMOTE_USER`/`TRANSFER_HOST` admin commands for reassignment. The Priority 1 host-disconnect grace period is a narrow, additive exception to this (see below), not a redesign of role assignment.
- **`room.host_permissions`** (`allow_whiteboard`, `allow_notes`, `allow_files`, `allow_share`, `allow_annotations`) is the single source of truth gating non-host participant actions; it's checked server-side per-action and broadcast to all clients on change via `permissions_update`.

---

# Completed Work

## Priority 0 — CI/CD Pipeline

**Root cause found:** `_enqueue()` in `websocket_manager.py` referenced an undefined local variable `payload_size` in a logging call (`websocket_manager.py:2370` at the time) — introduced by the "video calling stability and debugging" commit's new instrumentation. This raised `NameError` on **every** successful WebSocket message enqueue, i.e. every send in every room, breaking the connect handshake and 3 of 4 backend tests.

**Fix implemented:** Changed `payload_size=payload_size` → `payload_size=len(payload)`.

**Files modified:** `backend/app/websocket_manager.py` (1 line).

**Verification performed:** Ran the exact CI command (`python -m pytest tests`) — before: 3 failed/1 passed; after: 4/4 passed. Then verified **every** other CI job locally by reproducing it directly: frontend build, admin-frontend build, `npm audit` (both), `pip-audit --strict` (both requirement sets), `python -m compileall` (admin-backend), Docker Compose config validation, Caddy config validation, and all 4 Docker image builds (backend, admin-backend, frontend, admin-frontend) — all green. The `deploy` job (SSH to VPS) was explicitly **not** attempted, per user instruction (no deployment, no SSH).

**Remaining risks:** None identified within scope. Local Docker builds used host Buildx cache, distinct from GitHub Actions' `type=gha` cache — first real CI run after this fix will rebuild layers from scratch (expected).

---

## Priority 1 — WebRTC Stabilization

### Category A: Contained bug fixes (all implemented)

1. **`socketInstanceId` ReferenceError** — referenced in `onerror` but never declared (only `socketInstanceRef` existed, never incremented). Threw on every socket error. **Fix:** wired up the evidently-intended instance-id guard — increment `socketInstanceRef.current` per `connectSocket()` call, compare against that.
2. **Missing `onnegotiationneeded` handler** — screen-share's `addTrack` fallback path (used when starting screen share during an audio-only call, no existing video sender) never triggered renegotiation, so the remote peer never got the new track. **Fix:** added the handler, routed through the existing glare-safe `createOfferForPeer`.
3. **Screen share never set `isVideoCall`** — `VideoGrid` (which renders screen-share content) is gated behind `isVideoCall`; sharing during an audio-only call produced no visible UI. **Fix:** set `isVideoCallRef.current`/`setIsVideoCall(true)` on share start.
4. **Screen/tab audio captured but never sent** — `getDisplayMedia({audio:true})` audio track was silently discarded. **Fix:** attached via `addTrack` (now safely renegotiates thanks to fix #2), cleanly `removeTrack`'d on stop, tracked via new `screenAudioSendersRef` map (also wired into `removePeerConnection`/`cleanupCall` teardown).
5. **Backend `ping` handler called nonexistent `mark_heartbeat`** (latent crash) **+ frontend heartbeat timer declared but never started.** **Fix:** implemented `RoomConnectionManager.mark_heartbeat()`; frontend now starts a 20s heartbeat interval on socket open, clears it on close/unmount.
6. **`room_presence` never closed stale peer connections** for departed members (relied on ICE-failure timeout only). **Fix:** diff incoming member list against `peerConnectionsRef`, `removePeerConnection()` for anyone missing.
7. **Bonus/incidental:** adding `import time` (needed for the grace-period timer, below) also fixed a pre-existing latent `NameError` in the `UPDATE_FEATURE_FLAGS` admin handler (`time.time()` used with no `time` import anywhere in the file) — unrelated to WebRTC, fixed as a side effect, flagged as such.

### Category B: Host-disconnect grace period (approved design, implemented)

**Root cause:** a host's connection dropping for *any* reason (including a page refresh) immediately ended the meeting for every participant, with no resume path.

**Fix implemented:**
- New config `HOST_DISCONNECT_GRACE_SECONDS` (default 45s, `backend/app/config.py`, documented in `deploy/.env.production.example`).
- `RoomState` gained `pending_host_user_id`, `pending_host_session_id`, `host_grace_deadline`, `host_grace_task`.
- On disconnect, if the departing session is the host of an **active** meeting and is an **authenticated** user (has `user_id`), the room/meeting state is preserved instead of torn down; a background task (`_expire_host_grace`) ends the meeting only if the same `user_id` doesn't reconnect within the window.
- On reconnect, `connect()` detects a matching `pending_host_user_id`, restores the new session as host, cancels the grace task, and broadcasts a `call_started` message (carrying the new host session id) to other participants so they auto re-offer to it.
- **Necessary complementary fix:** the pre-existing `pendingCallRecoveryRef` client-side recovery logic would otherwise make a reconnecting *host* try to re-offer to their own now-dead old session id (nonsensical for the host role). Fixed by tracking `wasHost` at disconnect time and branching accordingly on reconnect.
- Explicit "end meeting" (by host or admin) now also cancels any pending grace timer, preventing a duplicate "meeting ended" notice.
- Anonymous (non-authenticated) hosts and grace-disabled configs still get the original immediate-teardown behavior — no change there.

**Deferred (explicit user decision, not an oversight):** full "survive refresh" for *ordinary* participants (persisted session identity + auto-rejoin) was **not** implemented — documented as a known limitation in `docs/WEBRTC_FLOW.md`. Would require a broader protocol change (stable per-participant identity outliving the WebSocket).

### Live browser test (real WebRTC negotiation verified, test stopped mid-way per user instruction)

Using synthetic `getUserMedia`/`getDisplayMedia` (canvas + Web Audio generated tracks) as a test-harness shim (this sandbox has no real camera/mic), verified with two real browser sessions:
- ✅ Real offer/answer/ICE negotiation succeeded — both `Connected peers: 1`, distinct local + remote video tiles rendered with correct content.
- ✅ Screen share (video) — remote peer received and displayed the presenter's screen correctly.
- 🐛 **Found and fixed a blocking bug mid-test** (see Priority 2 below, but the fix landed here first): an unhandled `participant_status_update` WS message crashed the chat feed via `avatarInitials(undefined)` — fixed by restricting the message catch-all to `type === "message"` only.
- **Not verified before test was stopped:** screen-share audio delivery, host-grace-period live reconnect behavior, general refresh/reconnect resilience.

**Files modified:** `frontend/src/pages/ChatPage.jsx`, `backend/app/websocket_manager.py`, `backend/app/config.py`, `deploy/.env.production.example`, `docs/WEBRTC_FLOW.md`.

**Remaining risks:** Not fully verified live (test stopped early). Grace period only covers authenticated hosts. If a same-user multi-tab scenario occurs (same person, two tabs, same room), the grace-period reconnect matching (keyed on `user_id`) could theoretically be triggered by the *wrong* tab reconnecting — narrow edge case, documented, not fixed (would need session-scoped correlation beyond current scope).

---

## Priority 2 — WebSocket Layer Stabilization

**Root cause found (via full inventory of backend-emitted vs. frontend-handled message types):** `RoomConnectionManager` had **6 pairs of duplicate method definitions** in the same class body (`handle_status_update`, `handle_whiteboard_update`, `handle_notes_update`, `handle_permissions_update`, `handle_recording_update`, `send_collaboration_state`) — Python silently keeps only the *second* definition; the first was 100% dead/unreachable code. This is exactly the kind of landmine that causes "I fixed it but nothing changed" confusion.

**Fixes implemented:**
1. **Participant mute-state desync (the most severe live bug found):** `MUTE_PARTICIPANT`/`UNMUTE_PARTICIPANT`/`MUTE_ALL` admin commands only notified the *target* session; the target's own client muted itself locally but never echoed a `status_update` back, so the server's `is_muted` field was never updated and no broadcast reached other participants — everyone else's UI kept showing the muted user as unmuted indefinitely. **Fix:** these commands now directly set `session.is_muted` server-side and broadcast a `room_presence` refresh.
2. **Deadlock in `PROMOTE_USER`/`TRANSFER_HOST`** (discovered while fixing #1, unrelated to it): `apply_admin_command()` held `self._lock` (a plain, non-reentrant `asyncio.Lock`) and then called `await self.broadcast_presence(room_id)`, which itself does `async with self._lock:` — guaranteed deadlock, meaning these two admin commands **hung forever** and never completed. **Empirically confirmed** with a minimal standalone repro script before touching code. **Fix:** extracted `_broadcast_presence_unlocked(room)` — the lock-free part of `broadcast_presence` — and had both commands (plus the new mute-sync code) call that instead.
3. **Dead-code removal:** deleted the 6 shadowed duplicate methods (160 lines), pure subtraction, zero behavior change (confirmed by identical test results before/after).
4. **Auth-failure reconnect loop:** WebSocket close code `1008` (auth/room-validation failure, from `routes.py`) was retried forever every 1.2s with the same now-known-bad token. **Fix:** `onclose` now special-cases `1008` — no reconnect scheduled, shows "please sign in again" instead of spinning.

**Files modified:** `backend/app/websocket_manager.py`, `frontend/src/pages/ChatPage.jsx`. New test: `backend/tests/test_admin_commands.py` (5 tests: promote/transfer-host complete within a timeout bound proving no deadlock, mute/unmute/mute-all correctly update state + broadcast).

**Verification performed:** All 5 new tests pass; full suite reached 9/9 at this point; `compileall` clean.

**Deferred (explicit user instruction, logged as technical debt):** `KICK_PARTICIPANT`/`REMOVE_USER`/`FORCE_LOGOUT`/`BAN_USER`/`SUSPEND_USER` still rely on the *target's own client* disconnecting before other participants' presence updates (works today, fragile — no direct broadcast telling everyone else independently). No ack/confirmation path exists for a host issuing any admin command.

---

## Priority 3 — Speech Translation Pipeline

**User-reported symptom:** "TTS Status: Skipped" — investigated end-to-end (mic → Whisper → language detection → translation → Piper → playback) per explicit instruction not to assume a single root cause. **Found two independent, unrelated root causes**, both real:

### Root cause 1 — "Skipped: same language" appearing incorrectly
`language_hint = stt_result.language or sender.preferred_language` (in `_process_voice_chunk`) meant Whisper's own auto-detected language was used as the primary hint, falling back to the sender's declared "Your Spoken Language" only if Whisper returned nothing — which is rare (Whisper almost always returns *some* guess, even wrong ones, especially on short utterances). When Whisper misdetected a short/ambiguous clip, the low-confidence-fallback mechanism in `detect_language_profile` re-confirmed Whisper's own (wrong) guess rather than correcting against it, sometimes producing a `source_language` that coincidentally matched a listener's target language → false "same_language" skip.

**Fix:** swapped priority — the sender's configured/enabled language is now the primary hint; Whisper's guess is used only when the configured language is missing or not currently enabled. `detect_language_profile`'s internal logic (script-based overrides for Devanagari/Japanese/mixed Hindi-English, the langdetect statistical path) was left completely untouched.

### Root cause 2 — separate, more severe hidden bug: Piper failures masked as success
When the Piper binary couldn't be found (or produced empty output, or threw any exception), the code **silently synthesized a sine-wave "chime" tone and reported it as a successful TTS synthesis** (`tts_status: "synthesized"`) — users would hear a beep, believing translation worked. Also found: `PIPER_TIMEOUT_SECONDS` was read from env but never actually enforced (no timeout wrapped the Piper subprocess call). Also found (unrelated, spotted in passing): the `/tts/synthesize` REST endpoint called `get_tts_service()`/`service.synthesize_speech()` — **neither function exists anywhere in the codebase** — so that endpoint had always been 100% broken, always falling into its own chime-fallback.

**Fix:** all three chime-masking branches in `PersistentPiperProcess.synthesize()` now raise `TTSUnavailableError` with a specific message instead; the Piper subprocess read/write is now wrapped in `asyncio.wait_for(..., timeout=PIPER_TIMEOUT_SECONDS)`; `generate_chime_wav` was removed entirely (fully unused after the above); the REST endpoint was fixed to call the real `tts_service.synthesize()` API and return a proper `HTTPException(503, ...)` on failure instead of a fake success.

**⚠️ Important discovered-but-unresolved finding:** `POST /tts/synthesize` is registered **twice** in `routes.py` (line ~134 `synthesize_tts`, and line ~704 `synthesize_speech_endpoint`). FastAPI dispatches to the **first** registered route for any duplicate path+method — meaning the *second* route (the one this fix touched) is **dead, unreachable code in production**. The fix to `tts/service.py`'s core `PersistentPiperProcess` (which both routes and the live voice pipeline share) is still fully valid and effective; the "fixed the REST endpoint" claim specifically was moot since that endpoint never receives real traffic. **Not yet cleaned up** — recommended for Priority 5.

### Instrumentation added (no timeout values changed, per explicit instruction)
Added timing/logging throughout the translation call path: `LibreTranslateProvider.translate()` logs `provider_response_ms` and `timed_out` on every call; `TranslationService.translate_text()` now distinguishes `httpx.TimeoutException` specifically as `status="timeout"` (previously lumped into generic `status="fallback_unavailable"` alongside connection errors) and logs `translation_request_ms` + the affected language pair. Verified no downstream code branches on the exact string `"fallback_unavailable"` — safe to introduce the new value.

**Files modified:** `backend/app/tts/service.py`, `backend/app/routes.py`, `backend/app/websocket_manager.py`, `backend/app/translation/service.py`. New tests: `backend/tests/test_tts_service.py` (3), `backend/tests/test_language_hint.py` (2), `backend/tests/test_translation_instrumentation.py` (2).

**Verification performed:** All new tests pass (including a genuine blocking-sleep-based timeout test, not just an immediately-thrown exception). Full suite reached 16/16. `compileall` clean.

**Remaining risks:** Language-detection behavior change should be watched for regressions in genuine cross-language code-switching without a distinctive script (the fix intentionally still lets high-confidence `langdetect` results win; only the *low-confidence* fallback path changed). No timeout value was changed — that decision awaits real production log data from the new instrumentation.

---

## Priority 4 — Collaboration Features (Whiteboard, Notes, Files, Diagnostics)

### 4A — Critical Security (fixed first, per explicit user priority)

Investigation surfaced genuine security vulnerabilities beyond the original "stabilize collaboration features" framing:

1. **No authentication on any file route** (`upload`/`list`/`download`/`delete`) — confirmed zero `Depends(get_current_user)` anywhere, unlike every other route in the file.
2. **Path traversal** — client-supplied `filename` used verbatim in `os.path.join()`, no `os.path.basename()` or sanitization; a crafted filename could write/read outside `uploads/{room_id}/`.
3. **Spoofable authorization** — the delete route derived the caller's role from a client-supplied `session_id` query parameter with zero verification it belonged to the actual caller.

**Fixes implemented:**
- Upload/list/delete now require `Depends(get_current_user)`. Download (embedded in `<a href>`/`<img src>`/`<video src>`, which cannot carry an `Authorization` header) accepts the JWT via `?token=` query param instead — reusing the *existing* precedent already established for the WebSocket route, not a new auth mechanism.
- New `_resolve_upload_path()` helper strips directory components from both `room_id` and `filename` via `os.path.basename()`, then verifies the resolved absolute path is actually inside the `uploads/` base directory before any file operation (defense in depth beyond just sanitizing the filename) — used consistently by upload/download/delete.
- Delete now derives the caller's role from *their own* connected session in that room (matched by verified `user_id` from the JWT), not a client-supplied identifier. Upload similarly derives `uploaded_by` from the authenticated user and now also checks `allow_files` permission for non-privileged uploaders.
- Frontend (`FilesPanel.jsx`) updated to match: `Authorization` headers on list/delete (upload already had one), removed the now-redundant/insecure `username` form field and `session_id` query param, download links append `?token=`.

**Files modified:** `backend/app/routes.py`, `frontend/src/components/FilesPanel.jsx`, `frontend/src/pages/ChatPage.jsx` (removed now-unused props). New test: `backend/tests/test_file_security.py` (4 tests — normal filenames, `../../../../etc/passwd`-style traversal, traversal via `room_id`, backslash-style traversal — all confirmed to stay inside `uploads/`).

**Verification performed:** All 4 new tests pass. Full suite reached 20/20. `compileall` clean, frontend build clean.

**Remaining risk (flagged, not fixed):** list/download only require *any* valid authenticated user, not verified *membership in that specific room* — a logged-in user who knows/guesses a room ID can still list/download its files. Closing this fully needs a room-membership check (live in-memory or DB-backed), a bigger design question deferred to Priority 5.

### 4B — Collaboration Stabilization (in the specified order)

1. **Whiteboard permission sync:** `handleMouseMove`/`handleMouseUp`/`handleUndo`/`handleRedo`/`handleClear` never checked `allowEditing` (only `handleMouseDown` and the network-send function did) — a mid-stroke permission revocation let a drawing/undo/redo/clear action appear to succeed locally while its broadcast was silently dropped. **Fix:** added guards to all five; Undo/Redo/Clear buttons now also visually `disabled` when editing is disallowed (matching the existing sticky-note pattern).
2. **Notes save acknowledgement + conflict handling:** `syncStatus` always claimed `"Saved"` regardless of whether the update actually sent (no `socket.readyState` check, no handling of permission-revoked-mid-edit). **Fix:** `broadcastNotes` now returns whether it actually sent; status reflects that honestly (`"Not saved"` in red, distinct from the amber "Saving..." pulse). Added a `pendingLocalEditRef` guard so an incoming remote update can't clobber an unflushed local edit still inside its 400ms debounce window. **Explicitly not a full conflict-resolution system** (no CRDT/OT) — still last-write-wins at the document level for the general case, per the "no redesign" instruction.
3. **Diagnostics panel real metrics:** "Packet Loss" was a hardcoded literal `"0.0% (No Loss)"`, always shown regardless of reality; latency tiles fell back to hardcoded numbers (420/280/340/1040ms) indistinguishable from real measurements before any transcript existed. **Fix:** added a 4-second polling loop (`ChatPage.jsx`, active only while `inCall`) calling real `RTCPeerConnection.getStats()` on each connected peer, computing real packet-loss percentage, fed through the existing `peerDiagnostics` mechanism; `DiagnosticsPanel` now shows the real aggregate or `"Not measured yet"`, and latency tiles show `"No data yet"` instead of fabricated numbers.
4. **`/healthz` expansion:** only checked MongoDB. **Fix:** now also checks LibreTranslate reachability (`GET {LIBRETRANSLATE_URL}/languages`) and Piper/TTS readiness (`tts_service.status()`), reported in a new `checks: {database, libretranslate, tts}` object with an overall `"ok"`/`"degraded"` summary. **Deliberately does not change the HTTP status code** for the latter two — confirmed via reading `backend/Dockerfile` that this exact endpoint is the container's own `HEALTHCHECK`; letting a degradable downstream dependency (translation/TTS) fail the whole container's health status would risk false "backend is down" alarms/orchestration reactions for an issue that doesn't actually break chat/auth/whiteboard/notes/files. Only a database failure still propagates as a hard failure (matches prior behavior).

**Files modified:** `frontend/src/components/WhiteboardPanel.jsx`, `NotesPanel.jsx`, `DiagnosticsPanel.jsx`, `ChatPage.jsx`; `backend/app/main.py`. New test: `backend/tests/test_healthz.py` (4 tests — all-healthy, LibreTranslate-down-doesn't-fail, TTS-not-ready, DB-failure-does-propagate).

**Verification performed:** Frontend changes verified via `npm run build` (clean each time) + code review only — no JS test framework exists in this project, and no live browser pass was done in Priority 4 (the only live browser test this session was in Priority 1, stopped mid-way). **`test_healthz.py` was written but the pytest run confirming it passes was interrupted before completing — this is the one concrete unverified item from the whole session.**

---

# Security Fixes Completed

| # | Vulnerability | Location | Fix |
|---|---|---|---|
| 1 | No authentication on file upload/list/download/delete | `backend/app/routes.py` | `Depends(get_current_user)` (upload/list/delete); `?token=` query param (download, precedent from WS route) |
| 2 | Path traversal via unsanitized filename/room_id | `backend/app/routes.py` | `_resolve_upload_path()` — `os.path.basename()` + resolved-path containment check |
| 3 | Spoofable `session_id`-based authorization on delete | `backend/app/routes.py` | Role derived from caller's own verified session (matched by JWT `user_id`) |

All three verified via `test_file_security.py` (4 tests, passing) plus manual code review of the request→auth→filesystem path.

---

# WebRTC Status

- **Working (live-verified with synthetic media in this sandbox):** offer/answer/ICE negotiation, camera+audio media flow (local + remote tiles), screen-share video delivery.
- **Fixed but not live-verified:** screen-share audio delivery, heartbeat, stale-peer cleanup on presence change, host-disconnect grace period (reconnect + expiry paths), reconnect-after-refresh for the host.
- **Deferred by design:** full session persistence / auto-rejoin for ordinary (non-host) participants after a page refresh.
- **Known topology limit (pre-existing, not a bug):** hub-and-spoke through host only — fine for 2–4 participants, would need an SFU beyond that.

---

# WebSocket Status

- Dead-code landmines (6 duplicate method definitions) removed.
- Mute-state desync fixed (server-authoritative, broadcasts correctly now).
- A real deadlock in `PROMOTE_USER`/`TRANSFER_HOST` found and fixed (these commands previously hung forever).
- Auth-failure (code 1008) infinite reconnect loop fixed.
- **Still fragile (deferred, logged as technical debt):** kick/ban/suspend/force-logout depend on the target's own client cooperating to disconnect for other participants to see updated presence; no ack path back to a host issuing any admin command.

---

# Translation Pipeline Status

- Two independent root causes behind "TTS Status: Skipped" identified and fixed: (1) language-detection hint priority inversion causing false "same_language" skips, (2) Piper failures silently masked as successful chime-tone synthesis.
- `PIPER_TIMEOUT_SECONDS` now actually enforced (previously read but unused).
- Translation timing/timeout instrumentation added (`provider_response_ms`, `translation_request_ms`, distinct `"timeout"` status) — **no timeout values changed**, per explicit instruction; real production log data needed before deciding whether `TRANSLATION_TIMEOUT_SECONDS` (currently 8.0s) should change.
- **Discovered, unresolved:** `POST /tts/synthesize` is registered twice; the second (previously "fixed") copy is dead/unreachable code shadowed by an already-correct first registration. Needs cleanup.

---

# Collaboration Features Status

- **Whiteboard:** permission-gating gaps closed (mouse-move/up, undo/redo/clear all now respect `allowEditing`).
- **Notes:** save-status now honest; narrow conflict window (in-flight local edit vs. incoming remote update) closed. Still last-write-wins at the document level overall — not redesigned.
- **Files:** now properly authenticated and authorized (see Security section) — this was the biggest gap in this whole area.
- **Diagnostics:** packet loss and latency now show real data or an honest "not yet available" state instead of fabricated numbers.

---

# CI/CD Status

Fully green as of Priority 0, verified against every job in `.github/workflows/ci-cd.yml` except the final `deploy` job (SSH to VPS — explicitly not attempted per user instruction, no deployment or SSH access used this session). No changes made since Priority 0 that would be expected to affect CI (all subsequent work verified locally via `compileall`, `pytest`, and `npm run build`).

---

# Production Readiness

**Improved this session:**
- CI/CD fully verified green.
- Multiple silent-failure/false-success bugs eliminated (WebRTC signaling, TTS, notes save status, diagnostics).
- Real security vulnerabilities in file sharing closed.
- A real deadlock bug (admin promote/transfer-host) fixed.
- `/healthz` now surfaces translation/TTS health without risking false container-unhealthy alarms.

**Not yet production-validated:**
- No live end-to-end browser test since Priority 1 (which itself was stopped before completion).
- `test_healthz.py` unverified.
- No load/stress testing performed at any point this session.
- Deploy job itself never exercised this session.

---

# Remaining Known Issues

1. `test_healthz.py` written but not yet confirmed passing — run it first in the next session.
2. File list/download require authentication only, not verified room membership.
3. Uploaded files have no persistent Docker volume — lost on container restart (confirmed via reading `deploy/docker-compose.prod.yml`, which mounts volumes for `piper_models`/`whisper_models` but not `uploads/`).
4. `POST /tts/synthesize` duplicate route — second copy is dead code, needs removal.
5. Notes conflict handling is still last-write-wins for the general (non-narrow-window) case.
6. Kick/ban/suspend/force-logout rely on target's own client to disconnect before others' presence updates; no host-facing ack for admin commands.
7. `RTCPeerConnection.getStats()`-based packet-loss aggregation not cross-browser tested.
8. Same-user multi-tab edge case in the host-grace-period reconnect matching (keyed on `user_id`, not per-tab) — narrow, documented, unfixed.
9. No live browser verification of: screen-share audio, host-grace-period reconnect, whiteboard/notes/files permission-sync fixes, new diagnostics metrics — all fixed via code review + unit/build verification only.

---

# Recommended Priority 5 Backlog

1. Run and confirm `test_healthz.py` passes (immediate, not new work).
2. Live end-to-end browser verification pass across everything fixed in Priorities 1–4 (camera/audio/screen-share, host-grace-period reconnect under real conditions, whiteboard/notes/files permission sync, new diagnostics metrics).
3. Decide on and implement room-membership verification for file list/download.
4. Add a persistent Docker volume for `uploads/`.
5. Remove the dead duplicate `/tts/synthesize` route.
6. Add direct-broadcast notifications for kick/ban/suspend (don't rely on target's client cooperating) and an ack path for admin commands.
7. Once real production log data exists from the Priority 3 instrumentation, revisit whether `TRANSLATION_TIMEOUT_SECONDS` needs adjusting.
8. Consider whether full session-persistence/auto-rejoin for ordinary participants (deferred in Priority 1) should be scheduled as its own architecture sprint.

---

# Technical Debt (explicitly deferred by user instruction during this sprint, not forgotten)

- Kick/ban/suspend/force-logout target-only notification pattern (Priority 2).
- No ack/confirmation path for admin commands issued by a host (Priority 2).
- `/tts/synthesize` duplicate dead route (Priority 3, discovered).
- Full CRDT/OT-style conflict resolution for Notes (Priority 4B — explicitly out of scope, "no redesign").
- Room-membership verification for file routes beyond basic authentication (Priority 4A).
- Persistent storage volume for uploaded files (Priority 4A, infrastructure not code).

---

# Suggested Testing Checklist Before Production

## Automated
- [ ] Run full backend suite (`cd backend && .venv/Scripts/python.exe -m pytest tests -q`) — expect 24/24 if `test_healthz.py` passes (20 previously confirmed + 4 unverified).
- [ ] `python -m compileall -q app` (backend) — should be clean.
- [ ] `npm run build` (frontend) — should be clean.
- [ ] Re-run the full local CI-equivalent sweep from Priority 0 (frontend/admin-frontend builds, `npm audit`, `pip-audit --strict`, all 4 Docker image builds, Compose config validation, Caddy config validation) to catch any drift since that verification.

## Manual / Live Browser (none of this was done for Priorities 2–4; only partially done for Priority 1)
- [ ] Two real participants: camera + audio both directions.
- [ ] Screen share: video **and audio** to the remote peer (audio delivery was fixed but never live-verified).
- [ ] Host refreshes their browser mid-call: meeting should survive for the grace period (default 45s) and the host should resume as host automatically; other participants' media should reconnect to the new host session (verify the `call_started` re-offer trigger fires correctly).
- [ ] Non-host participant refreshes: expect manual rejoin required (by design, not a bug — full auto-rejoin was deferred).
- [ ] WebSocket reconnect: kill network briefly, confirm reconnect works; expire a JWT and confirm the client shows "please sign in again" instead of looping.
- [ ] Admin panel: Promote to co-host, Transfer host, Mute participant, Mute all — confirm each completes (no hang) and all participants' UI reflects the change, not just the target.
- [ ] Whiteboard: revoke `allow_whiteboard` permission mid-draw for a participant; confirm their in-progress stroke doesn't silently "succeed" locally while failing to broadcast.
- [ ] Notes: two people typing concurrently; confirm the sync-status indicator is honest (turns red/"Not saved" on a genuine failure, not just decorative).
- [ ] Files: attempt upload/download/delete without a valid auth token (should be rejected); attempt a path-traversal filename (should be rejected/sanitized).
- [ ] Diagnostics panel: confirm packet loss shows "Not measured yet" before any peer connects, and a real percentage once connected; confirm latency tiles show "No data yet" before any speech, real numbers after.
- [ ] Hit `/healthz` directly with LibreTranslate/Piper intentionally stopped — confirm it still returns 200 with `"status": "degraded"` and per-service detail, not a hard failure.
- [ ] Speech pipeline: speak a short phrase in a non-configured-matching language, confirm it's no longer misattributed as "same language" as often (can't be 100% eliminated — statistical detection remains probabilistic).
