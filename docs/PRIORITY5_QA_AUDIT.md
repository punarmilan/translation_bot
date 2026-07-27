# Priority 5 — Production Readiness QA Audit

**Scope:** Static/code inspection + automated test execution across all 20 assigned workflows. **No code was modified during this audit.**

**Live browser validation status:** Docker Desktop is not currently running in this environment, so MongoDB, LibreTranslate, and Piper are not up — a full live end-to-end browser pass (real camera/mic, real translation round-trip) could not be performed in this pass. Findings below are based on direct code inspection of the current implementation plus the existing automated test suite. Where a live pass would materially change confidence in a verdict, that is called out explicitly. Say the word and I'll bring the stack up for a live pass.

**Automated test results:** `24 passed` (backend, full suite including all 4 `test_healthz.py` cases — previously unconfirmed, now confirmed green). Frontend `npm run build` succeeds cleanly (one pre-existing bundle-size warning, unrelated to correctness).

---

## 1. Meeting creation — **Working, with a design note**

There is no dedicated "create meeting" REST endpoint. A room code is generated client-side (`createMeetingCode()`, [JoinForm](../frontend/src/pages/ChatPage.jsx:188)) and the room itself is created lazily server-side on first WebSocket `connect()` via `room_repo.upsert()` ([websocket_manager.py:197-198](../backend/app/websocket_manager.py#L197)). The first authenticated user to join a given `room_id` is automatically assigned the `"host"` role ([websocket_manager.py:236-248](../backend/app/websocket_manager.py#L236)), regardless of their platform account role.

- **Root cause / note:** `JoinForm` only shows the "generate new room" button to users whose account role is `host`/`admin` ([ChatPage.jsx:184](../frontend/src/pages/ChatPage.jsx#L184)), but the "Room ID" text field is open to any authenticated user, and if that user is first to join a not-yet-existing room, they become its host regardless of their account role. This is existing, intentional-looking hub-and-spoke design, not a regression — but it means room access control is entirely code-knowledge-based (anyone with the room ID can join, and can become host if first).
- **Recommended fix (backlog, not urgent):** If this is not the intended access model, consider gating room creation to host-role accounts server-side, or documenting it as accepted behavior.

## 2. Join meeting — **Working**

Auth is enforced via `token` query param on the `/ws/{room_id}/{user_lang}` route ([routes.py:182-190](../backend/app/routes.py#L182)); unauthenticated sockets are closed with code 1008. Room-ID mismatch between the URL and the first `JoinMessage` payload is rejected. Returning hosts are recognized via `pending_host_user_id` and reinstated automatically. No issues found.

## 3. Camera — **Working**

`ensureLocalMedia` captures `getUserMedia({ audio: true, video })` ([ChatPage.jsx:917-947](../frontend/src/pages/ChatPage.jsx#L917)); track is added to each `RTCPeerConnection` via `addTrack` ([ChatPage.jsx:1379-1381](../frontend/src/pages/ChatPage.jsx#L1379)). No resolution/constraint tuning, but functionally correct.

## 4. Microphone — **Working**

Captured in the same `ensureLocalMedia` call; `enabled` flag driven by mute state before being added to peer connections. No issues found.

## 5. Speaker audio (remote playback) — **Working, one gap noted**

`ontrack` (ChatPage.jsx:1424-1451) attaches remote streams; a `useEffect` (2420-2436) sets `audio.srcObject`/`muted` on hidden `<audio>` elements for audio-only calls. Video calls route remote audio through the `<VideoCall>` component (not reviewed in this pass).

- **Gap:** no explicit autoplay-failure fallback (no `.play().catch()` / "click to unmute" prompt) was found in ChatPage.jsx. Modern browsers generally allow autoplay for tracks attached to an already-permitted `getUserMedia`-derived call, so this is low risk, but if a browser blocks autoplay there is no visible recovery path for the user.
- **Recommended fix:** add a play()-rejection handler that surfaces a "click to enable audio" prompt, for defense in depth. Low priority — no evidence this is currently occurring in practice.

## 6. Screen sharing — **Working, one behavioral inconsistency**

`getDisplayMedia` capture, `replaceTrack`-based swap into the existing video sender, and a dedicated `screenAudioSendersRef` for screen audio are all implemented correctly ([ChatPage.jsx:1675-1772](../frontend/src/pages/ChatPage.jsx#L1675)). The browser's native "Stop sharing" button is handled via `track.onended`.

- **Root cause of inconsistency:** `isVideoCall`/`isVideoCallRef` is set to `true` when screen share starts (line 1694-1695) but is **never reset to `false`** in `stopScreenShare` (1732-1772), even if the original call was audio-only. After ending a screen share on an audio-only call, the UI will continue to believe it's a video call.
- **Recommended fix:** track the call's original media type separately from screen-share state, or explicitly reset `isVideoCall` in `stopScreenShare` when the pre-share call type was audio-only.

## 7. WebRTC reconnect — **Working**

`onnegotiationneeded` creates a fresh offer. ICE-restart recovery (`recoverPeerConnection`, 1296-1330) is only triggered by the lower-session-id peer, and falls back to a full `recreatePeerConnection` after a 5s grace window. This was the subject of the P1 fixes (socketInstanceId, onnegotiationneeded) and looks structurally sound.

- **Minor note:** `socketInstanceId` staleness is only checked inside `socket.onerror`, not `onclose`/`onmessage`. Not currently causing a known bug, but worth remembering if stale-socket symptoms reappear.

## 8. Host reconnect grace period — **Working**

`HOST_DISCONNECT_GRACE_SECONDS`, `_expire_host_grace`, and the `pending_host_user_id`/`host_grace_deadline` state machine ([websocket_manager.py:388-538](../backend/app/websocket_manager.py#L388)) correctly preserve the room and host ownership across a disconnect, restore it on reconnect within the window, and cleanly end the meeting on timeout (DB update, webhook, `call_ended` broadcast, system message). Frontend `pendingCallRecoveryRef` recovery path (ChatPage.jsx:2106-2254) matches this contract. This matches the explicitly-scoped P1 design (no survive-refresh support, which is intentionally deferred — see Refresh Recovery below).

## 9. Translation — **Working, pending real-world timeout data**

End-to-end path (language detection → hint priority → LibreTranslate → glossary substitution → cache) is intact and instrumented per the P3 fixes. `translation.provider_response` and `translation.request`/`translation.success`/`translation.timeout` events now carry real timing data ([translation/service.py:181-422](../backend/app/translation/service.py#L181)).

- **Open item (explicitly deferred by design, not a defect):** `TRANSLATION_TIMEOUT_SECONDS` (default 8.0s) has not yet been evaluated against real production timing logs, per the explicit instruction to instrument first and only change timeouts once evidence justifies it. No data has been collected yet since these are freshly-added log lines — this remains a Priority 6 action, not a current bug.

## 10. Whisper (STT) — **Working**

`primary_language_hint` correctly prefers the speaker's configured `preferred_language` over Whisper's raw guess (the P3 fix), with hint-vs-script compatibility checks (`is_hint_compatible_with_text`) preventing an incompatible hint from overriding a clear script-based detection. `faster_whisper` is the underlying model; `WhisperModel`import is guarded with a clear error if the package isn't installed.

## 11. LibreTranslate — **Working**

`/healthz` now checks `GET {LIBRETRANSLATE_URL}/languages` and reports `"degraded"` (not a hard failure) when unreachable — correct given LibreTranslate is a degradable dependency, and confirmed by `test_healthz.py`'s now-passing test suite. No issues found.

## 12. Piper (TTS) — **Working**

All three former "silent chime fallback" branches now raise `TTSUnavailableError` instead of masking failure ([tts/service.py:179-232](../backend/app/tts/service.py#L179)); a real `asyncio.wait_for(..., timeout=PIPER_TIMEOUT_SECONDS)` enforces the configured timeout. `/healthz` correctly reports `tts: not_ready` when the provider isn't ready.

- **Confirmed still-present issue (already known, not fixed by design choice):** `backend/app/routes.py` registers `POST /tts/synthesize` **twice** — once at line 134 (`synthesize_tts`, correct, uses `tts_service.synthesize()` properly) and again at line 704 (`synthesize_speech_endpoint`). FastAPI dispatches to whichever route was registered first, so the second definition at line 704 is **dead, unreachable code**. This was flagged in Priority 3 as discovered-but-out-of-scope; it remains unresolved. Recommend deleting the dead duplicate in the next cleanup pass — it is confusing but not currently causing incorrect behavior since the live route is correct.

## 13. Chat — **Working**

Server-side: room-membership and `chat_enabled` checks gate `broadcast_chat` ([websocket_manager.py:571-635](../backend/app/websocket_manager.py#L571)). Client-side: the P1 fix restricting the WS message catch-all to `payload.type === "message"` prevents non-chat broadcasts (e.g. `participant_status_update`) from crashing the chat feed. No issues found.

## 14. Whiteboard — **Working**

Host-only edit permission is enforced both server-side (`handle_whiteboard_update` gate on `host_permissions.allow_whiteboard`) and client-side (`allowEditing` guards added in P4B on `handleMouseMove`/`handleMouseUp`/`handleUndo`/`handleRedo`/`handleClear`, plus disabled buttons). Permission changes are broadcast separately via `permissions_update`, so all clients stay in sync when the host toggles editing rights.

- **Minor, low-severity gap:** `startDragSticky`/`onDragMove` (dragging an existing sticky note) has no `allowEditing` guard on the *local* drag state — a viewer without edit rights can still visually drag a sticky note client-side. It is **not** broadcast (the `broadcastShapes` call inside `onDragEnd` is gated by `allowEditing`), so this is a local-only cosmetic inconsistency, not a sync or security issue.
- **Recommended fix:** add an `allowEditing` check to `startDragSticky`/`onDragMove` for consistency with the other tool handlers. Trivial, low priority.

## 15. Notes — **Partially working**

The P4B fix made `syncStatus` reflect whether the message was actually sent over an open socket (`"Saved"`/`"Not saved"` based on `socket.readyState`), which is a real improvement over the prior hardcoded status.

- **Root cause of remaining gap:** this is a **transport-level** ack, not an **application-level** ack. `handle_notes_update` on the server ([websocket_manager.py:936-962](../backend/app/websocket_manager.py#L936)) silently drops the update (no error sent back to sender) if `host_permissions.allow_notes` is `False` at the time — the client would still show "Saved" because the socket send succeeded, even though the server discarded the edit. There is also no version/timestamp-based conflict resolution; the last write always wins with no warning to a user whose edit got overwritten by a concurrent one.
- **Recommended fix:** have `handle_notes_update` send an explicit ack/reject message back to the sender so the frontend can distinguish "sent successfully" from "applied successfully," and consider a simple last-write-wins timestamp shown to users so silent overwrites are at least visible. Not urgent — the current behavior is only wrong in the edge case of a permission change happening concurrently with typing.

## 16. File upload/download — **Working for authentication; one authorization gap remains (already known)**

The P4A security fixes are correctly in place: all four file routes require `Depends(get_current_user)` or the `?token=` fallback for download, path traversal is prevented by `_resolve_upload_path`'s containment check, and delete-role derivation uses the caller's own server-side session rather than a client-supplied `session_id`. Confirmed by the 4 passing tests in `test_file_security.py`.

- **Confirmed still-present gap (already flagged as backlog, not new):** `list_meeting_files` and `_list_room_files` query `db["files"]` filtered only by `room_id`, with no check that the requesting (authenticated) user is actually a participant in that room. Any authenticated platform user who knows or guesses a `room_id` can list and download files from a meeting they were never part of. This is an authorization gap distinct from the authentication fix already applied.
- **Recommended fix:** add a room-membership check (e.g., verify the user has an active or historical session in that room, or is host/admin) before returning the file list or serving a download. This was already recommended in the Priority 4 handoff and remains open.

## 17. Diagnostics — **Working**

Confirmed genuinely real, non-placeholder data end-to-end: `avgPacketLoss` aggregates real `getStats()` polling results (ChatPage.jsx 4-second interval); STT/translation/TTS/total latency in `DiagnosticsPanel` are sourced from `stt_latency_ms`/`translation_latency_ms`/`tts_latency_ms`/`total_latency_ms` fields that the backend genuinely populates and sends per voice-processing event (confirmed present in `websocket_manager.py` and `schemas.py`), not hardcoded placeholders.

## 18. Admin controls — **Working**

Verified via the background research pass: no remaining unlocked call sites of `broadcast_presence()` from within a function already holding `self._lock` (the deadlock class of bug is fully closed), no remaining duplicate method definitions in the file, and every admin command branch returns a synchronous ack via `self._ack(...)` — none are fire-and-forget. `MUTE_PARTICIPANT`/`UNMUTE_PARTICIPANT`/`MUTE_ALL`/`PROMOTE_USER`/`TRANSFER_HOST` all correctly call the non-deadlocking `_broadcast_presence_unlocked`. Confirmed by all 5 tests in `test_admin_commands.py` passing.

## 19. Mobile browser — **Partially working (untested, no mobile-specific WebRTC handling)**

The app has a `viewport` meta tag and extensive Tailwind responsive classes (`sm:`/`md:`/`lg:`, 8 occurrences in `ChatPage.jsx` alone) providing responsive layout. However:

- **Gap:** no mobile-specific `getUserMedia` constraints exist anywhere in `ChatPage.jsx` (no `facingMode: "user"/"environment"` for camera selection, no touch-optimized media constraints). No `window.resize`/`matchMedia` listener beyond one narrow use for the mobile side-panel scroll behavior.
- **Not evaluated:** actual behavior on a real mobile browser (Safari iOS in particular has known WebRTC/autoplay quirks) was not live-tested in this pass — Docker/services weren't running.
- **Recommended fix:** add `facingMode` support for camera switching on mobile (front/back), and perform a live mobile-browser pass (iOS Safari + Android Chrome at minimum) before shipping, since desktop-only manual testing to date cannot rule out mobile-specific WebRTC issues.

## 20. Refresh recovery — **Broken (by design — documented, deferred limitation)**

Confirmed: no `sessionStorage`/`localStorage` persistence of room/session/participant identity, no `beforeunload` handler. On a hard refresh, `session` state resets to `null`, the WebSocket and all `RTCPeerConnection`s are torn down, and the user must resubmit the join form and fully re-negotiate media from scratch. This matches the explicit, user-approved P1 decision to defer full survive-refresh support to a future architecture sprint and is already documented in [WEBRTC_FLOW.md](../docs/WEBRTC_FLOW.md) — it is a known, intentional gap, not a regression, but it is a real production limitation: any participant who refreshes their tab currently loses their place in the meeting and must manually rejoin (the host reconnect grace period only covers the *host* disconnecting, not a participant's refresh experience, and does not persist chat/whiteboard/notes scroll position or in-progress typing).

---

## Additional issues discovered outside the 20-item scope

These surfaced during code inspection while tracing the workflows above. None have been fixed — flagging per the "list every remaining issue" instruction.

1. **`backend/app/routes.py` — missing `datetime` import causes a `NameError` at runtime in two endpoints.** `get_meeting_analytics` (line 940, 942) and `get_meeting_replay_timeline` (lines 1014, 1030, 1039) call `datetime.utcnow()` / `isinstance(x, datetime)`, but the only `from datetime import datetime` in the file is a **local** import scoped inside `public_translation_modes` (line 876) — it does not leak to other functions. Any call to `GET /api/meetings/{room_id}/analytics` (when `room.created_at` is set) or `GET /api/meetings/{room_id}/replay-timeline` (whenever any message/recording has a timestamp — i.e., almost always) will raise `NameError: name 'datetime' is not defined` and return a 500. **This looks like a pre-existing bug unrelated to this sprint's changes**, not something introduced by the P0-P4 fixes. Trivial fix: add `from datetime import datetime` at module level.

2. **`backend/app/routes.py` — several duplicate route registrations beyond the already-known `/tts/synthesize`.** FastAPI dispatches to the *first* matching registration, silently making the second a dead route:
   - `GET /stt/status` (113 vs. 735) — both behave similarly; low impact.
   - `POST /stt/warmup` (118 vs. 745) — both behave similarly; low impact.
   - `GET /api/public/branding` (612 vs. 802) — **different behavior**: the live route (612) queries `db["platform_settings"]` directly on every request; the dead route (802) reads the cached `runtime_settings.branding_settings`. Not currently harmful (the live version is always fresh), but confusing and wasteful.
   - `GET /api/public/page-builder` (633 vs. 808) — same pattern as branding.
   - **`POST /api/internal/reload-config` (658 vs. 831) — functionally significant.** The live route (658) broadcasts a config-update event to all connected sessions but does **not** call `runtime_settings.load_from_db()` — it only re-reads `branding`/`landing_sections` inline, not the full settings surface. The dead route (831) is the one that actually calls `runtime_settings.load_from_db(db)` to refresh feature flags, general settings, and enabled languages from the database, but it can never execute. **Practical effect: calling the admin panel's "reload config" action does not actually refresh `feature_flags`, `general_settings`, or `enabled_languages` from the database** — only branding and landing-section broadcasts work as intended. This is worth a fix in the next stabilization pass; recommend removing the dead duplicates and consolidating both routes into the one with correct `load_from_db()` behavior.

3. **WebSocket reconnect has no backoff or retry ceiling.** `ChatPage.jsx`'s `onclose` handler reconnects on a fixed 1200ms timer with an unbounded `reconnectAttemptsRef` counter — no exponential backoff, no max-retry cutoff. If the backend is down for an extended period, every open tab will retry every 1.2s indefinitely. Low risk under normal operation (this is what the P1 "eliminate reconnect loops" fix targeted for the *crash*-inducing case, which is fixed), but worth hardening with backoff before a wider production rollout.

---

## Summary Table

| # | Workflow | Status | Needs code change? |
|---|---|---|---|
| 1 | Meeting creation | Working (design note) | No — confirm intended access model |
| 2 | Join meeting | Working | No |
| 3 | Camera | Working | No |
| 4 | Microphone | Working | No |
| 5 | Speaker audio | Working (minor gap) | Optional |
| 6 | Screen sharing | Working (1 inconsistency) | Yes — small |
| 7 | WebRTC reconnect | Working | No |
| 8 | Host reconnect grace period | Working | No |
| 9 | Translation | Working (data pending) | No — wait for log data |
| 10 | Whisper STT | Working | No |
| 11 | LibreTranslate | Working | No |
| 12 | Piper TTS | Working (dead route remains) | Yes — cleanup |
| 13 | Chat | Working | No |
| 14 | Whiteboard | Working (trivial gap) | Optional |
| 15 | Notes | Partially working | Yes — small |
| 16 | File upload/download | Working (authz gap known) | Yes — moderate |
| 17 | Diagnostics | Working | No |
| 18 | Admin controls | Working | No |
| 19 | Mobile browser | Partially working (untested) | Yes — facingMode + live test |
| 20 | Refresh recovery | Broken (by design, deferred) | Deferred by prior decision |

**Overall:** No new blocking defects were found in the systems already stabilized in Priorities 0-4. The two most consequential *new* findings are the dead `/api/internal/reload-config` route (silently breaks admin config reload for feature flags/general settings) and the missing `datetime` import (breaks meeting analytics/replay-timeline endpoints). Everything else is either a known, previously-documented limitation (refresh recovery, file-list authorization, dead `/tts/synthesize`) or a minor/low-severity polish item.
