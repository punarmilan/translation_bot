# VOXO Multi-Modal Translation Pipeline

This document details the multi-modal speech, text, caption, and voice translation pipeline powering VOXO.

```
       ┌─────────────────────────────────────────────────────────┐
       │                   AUDIO / SPEECH INPUT                  │
       └────────────────────────────┬────────────────────────────┘
                                    │ WebSockets Audio Chunking
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               WHISPER SPEECH-TO-TEXT (STT)              │
       │   Local Faster-Whisper model detects language & text    │
       └────────────────────────────┬────────────────────────────┘
                                    │ Text & Language Hint
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                TRANSLATION ENGINE (TRANSLATE)            │
       │   Normalizes language code & fetches cached result      │
       └──────────────┬───────────────────────────┬──────────────┘
                      │                           │
        Captions & Chat Text           Synthesized Voice Clip
                      │                           │
                      ▼                           ▼
       ┌──────────────────────────┐ ┌─────────────────────────────┐
       │  CAPTION & CHAT BROADCAST│ │     PIPER TTS VOICE SYNTH   │
       │ Sent per recipient lang  │ │ Generates target audio stream│
       └──────────────────────────┘ └─────────────────────────────┘
```

## Pipeline Stages & Latency Targets

| Stage | Technology | Target Latency | Optimization |
| :--- | :--- | :--- | :--- |
| **Speech-to-Text** | Faster-Whisper (Local) | ~350ms | Segment silence VAD chunking |
| **Language Detection** | `langdetect` + Hint Fallback | ~15ms | Devanagari/Script regex & hint fallback |
| **Text Translation** | LibreTranslate / Engine Cache | ~120ms | In-memory LRU translation memory |
| **Speech Synthesis** | Piper TTS (Local ONNX) | ~280ms | Direct WAV streaming |
| **End-to-End Delivery** | WebSocket Relay | < 850ms | Asynchronous pipeline queue |
