# VOXO Known Limitations & Platform Guidance

This document highlights current boundaries, hardware recommendations, and browser compatibility notes for VOXO deployments.

---

## 1. Hardware & System Requirements
- **Local AI Engine**: Running Whisper STT and Piper TTS locally requires at least 4 CPU cores and 8GB RAM (16GB RAM recommended for large multi-person calls).
- **GPU Acceleration**: If a CUDA GPU is available, Faster-Whisper automatically leverages FP16 compute for sub-200ms transcription latency.

## 2. Browser Compatibility & Media Permissions
- **HTTPS Required**: Browsers require secure contexts (`https://` or `http://localhost`) to grant microphone and camera access.
- **Audio Autoplay**: Modern browsers block unprompted audio autoplay. Users should click once inside the room UI to grant speech synthesis audio permissions.

## 3. Network Considerations
- **Firewall & UDP Ports**: WebRTC peer-to-peer audio requires UDP ports for direct media streams. On restrictive networks, deploy a local TURN server.
