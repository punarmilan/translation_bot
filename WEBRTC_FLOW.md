# VOXO WebRTC & Media Signaling Architecture

This document describes the peer-to-peer WebRTC audio/video signaling, ICE candidate handling, and media track management in VOXO.

```
Participant A                                 WebSocket Gateway                              Participant B
     │                                               │                                             │
     │─────────────── peer_offer ───────────────────>│─────────────── peer_offer ─────────────────>│
     │                                               │                                             │
     │<────────────── peer_answer ───────────────────│<────────────── peer_answer ─────────────────│
     │                                               │                                             │
     │<───────────── ice_candidate ──────────────────│<───────────── ice_candidate ────────────────│
     │                                               │                                             │
     └=================== Direct P2P Media Audio/Video Stream =====================================┘
```

## Key Mechanisms

1. **Targeted Signaling**: Offers, answers, and ICE candidates carry `target_session_id` so messages route directly to the intended peer over WebSockets.
2. **Track Recovery & Mute State**: Audio and Video tracks register `onmute`, `onunmute`, and `onended` listeners to track hardware state without tearing down signaling.
3. **STUN Configuration**: Reuses configured STUN/TURN servers defined in runtime settings to handle NAT traversal.
