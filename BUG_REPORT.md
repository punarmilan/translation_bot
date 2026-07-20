# VOXO Root-Cause Bug Report

This document details the critical software defects identified, investigated, and permanently fixed in the VOXO codebase.

---

## 1. Instant Disconnect Badge Bug

- **Symptoms**: The moment a second user joined a room, their status badge immediately displayed `Disconnected` red indicator despite their WebSocket room connection being active and healthy.
- **Root Cause Analysis**: `MemberCard` in `ChatPage.jsx` derived `connected` state from `connectedPeerIds.includes(member.session_id)`. `connectedPeerIds` tracks participants with active WebRTC peer audio/video call tracks. When a participant joined the WebSocket room before a WebRTC call was started, `connected` evaluated to `false`, causing `!connected && !isSelf` to evaluate to `true`.
- **Permanent Solution**: Updated `MemberCard` to evaluate room presence (`member.connected !== false`) independently of WebRTC call media streams. Disconnected state now triggers only when room presence drops or connectionState is explicitly `"disconnected"`. Added green `In Room` and `Audio Connected` badges.

---

## 2. Tab-Switching Call & Socket Teardown Bug

- **Symptoms**: Clicking any side-panel tab (`Chat`, `Notes`, `Whiteboard`, `Files`, `Diagnostics`, `Translation`) disconnected the WebSocket connection and dropped active calls.
- **Root Cause Analysis**: Line 2092 of `ChatPage.jsx` included `meetingPanel` and `rightPanelCollapsed` in the dependency array of the main WebSocket `useEffect` hook. Changing tabs triggered effect unmounting, calling `cleanupCall(true)` (destroying WebRTC peer connections and local media streams) and executing `socketRef.current.close(1000, "chat_unmounted")`.
- **Permanent Solution**: Stored `meetingPanel` and `rightPanelCollapsed` in React refs (`meetingPanelRef`, `rightPanelCollapsedRef`) for internal handlers and removed them from the `useEffect` dependency array. The WebSocket connection effect now depends strictly on `[session]`, keeping room connections and media calls 100% active across all UI tab switches.

---

## 3. Short-Text Language Detection Fallback Failure

- **Symptoms**: Short chat messages (e.g. "hi", "yes", "okay") stayed untranslated for recipients.
- **Root Cause Analysis**: `detect_language_profile` in `translation/service.py` invoked `langdetect`, which occasionally returned unsupported language codes (e.g. `af`, `cy`, `so`) with high confidence scores. Because the code was unsupported, subsequent `translate_text` calls failed or returned skipped results.
- **Permanent Solution**: Updated `detect_language_profile` to enforce a `supported_langs` check. If the detected language code is not in `supported_langs`, it falls back safely to the sender's preferred language hint (`normalized_hint`) or `"en"`.
