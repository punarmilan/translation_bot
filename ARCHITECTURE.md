# VOXO Platform Architecture

VOXO is a privacy-first, self-hosted, real-time multilingual meeting platform.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              VOXO CLIENT                                │
│   React 18 • Vite • Tailwind CSS • Lucide Icons • Web Audio API         │
└──────────────────┬──────────────────────────────────────┬───────────────┘
                   │ HTTP / REST                          │ WebSockets / WebRTC
                   ▼                                      ▼
┌──────────────────────────────────────┐ ┌────────────────────────────────┐
│            FASTAPI BACKEND           │ │       WEBSOCKET MANAGER        │
│   Auth • Routes • Runtime Settings   │ │   Presence • Broadcast • Sync  │
└──────────────────┬───────────────────┘ └────────────────┬───────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       LOCAL AI INFRASTRUCTURE                           │
│  Whisper STT • LibreTranslate Engine • Piper Voice TTS • MongoDB Engine │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Architectural Principles

1. **Self-Hosted Privacy First**: Zero external API dependencies (no OpenAI, Gemini, Claude, ElevenLabs, or cloud inference). All speech recognition, translation, and speech synthesis models run locally.
2. **Decoupled Session Persistence**: WebSocket connection state, WebRTC media streams, and meeting room presence exist at the top-level application stage. UI tab switches (`Chat`, `Notes`, `Whiteboard`, `Files`, `Diagnostics`) render sub-components without unmounting or tearing down room sockets.
3. **Real-Time Control Plane**: Administrative configuration updates in `admin-backend` trigger instant MongoDB sync and in-memory runtime updates in `backend`, broadcasting real-time WebSocket events to connected room clients.
