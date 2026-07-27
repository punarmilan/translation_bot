# Priority 6B — Live Production Validation Report

**Environment:** Docker stack brought up (MongoDB, Redis, LibreTranslate — all already running from a prior session, health-checked fresh for this pass). Backend started locally with `PIPER_EXECUTABLE` pointed at `backend/piper/piper/piper.exe`; confirmed via `/healthz` → `{"status":"ok","checks":{"database":"ok","libretranslate":"ok","tts":"ok"}}`. Frontend dev server started via Vite. Two real browser sessions (host + participant) driven through the actual UI, with synthetic camera/mic/screen-share media (canvas + Web Audio oscillator) standing in for real hardware, which this sandbox doesn't have. No code was modified during this pass except where noted as already-completed Priority 6A fixes being re-verified live.

**Test accounts:** `qahost@example.com` / `qaguest@example.com`, two live browser tabs, real JWT auth, real MongoDB-backed rooms.

---

## Results

| Workflow | Result | Blocks production? |
|---|---|---|
| Camera | PASS | No |
| Microphone | PASS | No |
| Speaker audio | PASS | No |
| Screen sharing | PASS | No |
| Translation | PASS | No |
| Whisper | PASS (service verified; full transcription not exercised — see notes) | No |
| LibreTranslate | PASS | No |
| Piper | PASS | No |
| Chat | PASS | No |
| Whiteboard | PASS | No |
| Notes | PASS | No |
| File upload/download | PASS | No |
| Diagnostics | PASS | No |
| **Admin controls** | **FAIL** | **Yes — release blocker** |
| Mobile browser | INCONCLUSIVE (see notes) | Needs a real-device pass before ship |
| Host reconnect | PASS | No |
| Participant reconnect | PASS | No |

---

### Camera — PASS
Local capture renders correctly (`ensureLocalMedia`); confirmed cross-peer delivery in both directions (host↔guest) once both tabs were actively rendering. One test-methodology note: when a tab is backgrounded in this browser-automation environment, `canvas.captureStream()` throttles via `requestAnimationFrame`, so the *other* side's remote tile can appear to freeze — this is a background-tab rendering artifact of the test harness, not a WebRTC defect (confirmed by fronting the tab and seeing both videos render live simultaneously).

### Microphone — PASS
Audio tracks captured and added to peer connections alongside video; confirmed `live`, `enabled: true` on both local and remote tracks throughout.

### Speaker audio — PASS
Remote audio tracks attach and play; `ontrack`/`remote_track_unmuted` fired correctly on both ends.

### Screen sharing — PASS
Verified both the general start/stop flow (with annotation toolbar — Laser/Draw/Highlight/Cursor/Clear — appearing correctly) and, specifically, the Priority 6A `isVideoCall` fix: started an **audio-only** call, screen-shared, stopped sharing, and confirmed the stage correctly reverted to "Audio live" rather than incorrectly staying on "Video live." This is a genuine live confirmation the fix works, not just a build-passes claim.

### Translation — PASS
Sent an English chat message from the host; the Hindi-speaking guest received it with a "🌐 Translated" badge and an accurate Hindi translation ("गुड मॉर्निंग हर कोई, बैठक में आपका स्वागत है"), with an "ORIGINAL" toggle showing the source text.

### Whisper — PASS (with a caveat)
`GET /stt/status` confirms the service is healthy and loaded: `{"provider":"faster_whisper","model":"base","device":"cpu","ready":true,"load_latency_ms":3961}`. Full live transcription of spoken content could not be exercised end-to-end in this pass: the sandbox has no real microphone, and the synthetic audio (a continuous sine-wave oscillator) never triggers the app's VAD-based silence segmentation that gates when a `voice_chunk` is actually sent for transcription — there's no natural pause for it to detect. This is a limitation of the test input, not evidence of a defect; the service itself is confirmed ready and was already exercised indirectly (STT status/warmup endpoints all returned 200 throughout the session).

### LibreTranslate — PASS
Confirmed via the same chat-translation test above — real translation quality, not a stub/echo. `/languages` responds correctly from the container.

### Piper — PASS
Used the dedicated `/voice-test` page to generate real audio: selected voice `auto`, language `en`, profile `natural` → "Matched", actual model resolved to `backend\models\piper\en_US-amy-medium.onnx`, latency 6046ms (expected cold-start cost of spinning up the persistent Piper process for that model; subsequent calls reuse the warm process).

### Chat — PASS
Bidirectional messages delivered and displayed correctly with proper sender/recipient targeting.

### Whiteboard — PASS
Drawing and real-time sync confirmed bidirectionally via direct canvas pixel inspection (mid-stroke preview renders, final shape persists, and syncs to the other participant). Note: the Browser pane's `left_click_drag` action doesn't generate enough intermediate `mousemove` events for this canvas's point-accumulation drawing logic, so manual click-drag alone won't visibly draw — dispatching a proper mousedown→multiple mousemoves→mouseup sequence works correctly. This is a test-tool limitation, not an app defect.

### Notes — PASS
Verified bidirectional real-time sync: host's note content appeared instantly on the guest's panel, and the guest's addition appended and appeared back on the host's panel.

### File upload/download — PASS
Upload → list → download → delete all verified working end-to-end with real HTTP calls (200 OK throughout), including the Priority 6A room-membership authorization check (confirmed separately via unit test in 6A; here confirmed the live authenticated round-trip works for actual room participants). One operational note: JWT access tokens expire after 60 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES=60`) and there is **no automatic token-refresh interceptor** in the frontend (`services/api.js` has a request interceptor but no 401-triggered refresh), even though a `/auth/refresh` endpoint exists server-side. During this long test session, expired tokens caused silent 401s on file operations with no user-facing prompt to re-authenticate. This is a real, separate finding — see "Additional issues" below.

### Diagnostics — PASS
Confirmed real, non-fabricated data: packet loss showed 0.0% (genuine `getStats()` result, not a hardcoded placeholder), hardware checks correctly reflected live mic/camera state, and translation-latency tiles correctly showed "No data yet" (accurate, since no voice pipeline activity had occurred) rather than fake numbers.

### Admin controls — **FAIL (release-blocking)**
**This is the most significant finding of this validation pass.** Clicking Mute, Unmute, Promote, Transfer Host, or Kick on a specific participant is **completely non-functional** through the real UI, and fails silently (the host sees no error and believes the action succeeded).

**Root cause:** a data-contract mismatch between two independently-correct pieces of code that were never round-trip-tested together:
- The `RoomMember` schema (`websocket_manager.py:_room_members_unlocked`) — the object shape broadcast to clients for the participants list — includes `session_id`, `username`, `role`, `is_muted`, etc., but **never includes `user_id`**.
- The frontend's `handleRoomControl` (`ChatPage.jsx:2596`) builds the outgoing command as `{ ..., target_user_id: targetMember.user_id, ... }` — but since `targetMember` (an entry from that same members list) has no `user_id` field, this is always `undefined`, and `JSON.stringify` silently omits the key entirely from the sent payload.
- Verified live by patching `WebSocket.prototype.send`: the actual bytes sent for a Mute click were `{"type":"room_control","room_id":"qatestroom01","command_type":"MUTE_PARTICIPANT","payload":{}}` — no `target_user_id`, no `target_session_id` anywhere.
- On the backend, `apply_admin_command` (`websocket_manager.py:2078`) resolves `target = self.sessions.get(target_session_id)` then falls back to matching `target_user_id` — both are `None`/missing, so `target` stays `None`, and the command returns `_ack(command, "NOT_CONNECTED", "Target participant is not connected to this room.")` for every single per-participant admin action.
- The frontend has **no handler at all** for any command-acknowledgment message (confirmed: zero matches for `command_ack`/`admin_ack` in `ChatPage.jsx`), so this failure is never surfaced to the host — the button just does nothing, with no error toast, no visual feedback.

**Why the existing unit tests (`test_admin_commands.py`) didn't catch this:** those tests call `manager.apply_admin_command()` directly with a hand-constructed command dict that correctly includes `target_session_id` — they never exercise the real frontend → WebSocket → backend serialization path, so the missing-`user_id` contract mismatch was invisible to them. This is a textbook case of a bug that only live end-to-end testing (not unit tests, not code review) can catch, because the defect lives in the seam *between* two files that are each internally correct.

**Recommended fix (not implemented — flagging per report-only scope):** either add `user_id` to the `RoomMember` schema/broadcast (simplest, smallest surface area) or change the frontend to send `target_session_id: targetMember.session_id` instead (which the member object *does* have) and have `handle_room_control` in `routes.py` forward `target_session_id` from `raw_payload` (currently it only forwards `target_user_id`). Either fix, plus adding basic ack-handling so future silent failures surface to the host, would resolve this.

### Mobile browser — INCONCLUSIVE
The join/landing pages render correctly at a 375px mobile viewport with no horizontal overflow. However, I was unable to get a stable, forced-narrow viewport for the **in-meeting** `ChatPage` view in this specific browser-automation environment — `window.innerWidth` kept reporting back at ~781px once inside an active room/WebSocket session even after re-issuing the resize command, for reasons not fully diagnosed in the time available (possibly related to how this test harness's device-emulation interacts with the page's WebRTC/media session; it worked fine on the simpler landing/join pages). Combined with the Priority 5 static-review finding (no `facingMode` camera-switching support, minimal touch-specific handling beyond generic touch-event pass-through), **a real mobile device or Chrome DevTools device-emulation pass is recommended before shipping** — this workflow was not conclusively verified either way in this session.

### Host reconnect — PASS
Disconnected the host (navigated away, unmounting `ChatPage` and closing the socket) and reconnected within 8 seconds (well under the 45-second `HOST_DISCONNECT_GRACE_SECONDS` window). Confirmed: role correctly restored to `HOST` (not demoted), and "Room call is active" was preserved rather than the meeting ending. Separately and incidentally, also observed the grace period correctly **expiring** and ending the meeting after the window lapsed during an earlier, longer gap — both the preservation and expiry paths were exercised live.

### Participant reconnect — PASS
Disconnected the guest and reconnected within the same short window: role correctly stayed `Participant` (did not incorrectly acquire host), the ongoing call remained intact for the host's side, and the participant list correctly showed both members with no ghost/duplicate entries.

---

## Additional issue discovered during this pass (not in the original 17-item scope)

**No automatic token refresh on the frontend, despite a working `/auth/refresh` endpoint.** `services/api.js` has an Axios request interceptor that attaches the bearer token, but no response interceptor to catch a `401` and silently refresh via `/auth/refresh` before retrying. Given the 60-minute access-token lifetime, any sufficiently long meeting will start seeing silent `401`s on REST-based features (file upload/list/download; likely also affects any other REST call made mid-meeting) with no user-facing indication — the user would need to notice something isn't working and manually sign out/in. WebSocket-based features (chat, whiteboard, notes, admin commands) are unaffected since the socket connection, once established, doesn't re-validate the token per-message. Worth a follow-up fix: a response interceptor that attempts `/auth/refresh` on 401 and retries once before giving up.

---

## Summary

Of the 17 assigned workflows: **15 PASS**, **1 FAIL (Admin controls — release blocker)**, **1 inconclusive (Mobile browser — needs a real-device pass)**. The systems stabilized in Priorities 0–5 and the four targeted fixes from Priority 6A all held up under live, real-service, two-participant testing. The Admin Controls failure is a genuine, previously-undetected, production-blocking defect — every per-participant moderation action (mute, unmute, promote, transfer host, kick) silently fails through the real UI. This should be the top priority for the next fix pass.
