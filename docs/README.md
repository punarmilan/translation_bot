# Translation Bot: Self-Hosted Intelligent Meeting Platform

Translation Bot is a 100% self-hosted, offline-compliant multilingual video and audio collaboration platform designed to run on local infrastructures without relying on cloud APIs.

## Key Capabilities (Sprint 5)

1. **Meeting Intelligence Engine**: Extractive heuristics for automated notes, action items, decisions, and timelines running fully locally.
2. **Speaker Attribution & Filtering**: Attribution indices tag transcripts with speaker roles, source/target languages, and voice VAD confidence thresholds. Filter recent captions dynamically per speaker.
3. **Search Engine Abstraction**: Swappable index interface supporting keyword, transcript, room, and summary querying over MongoDB collections.
4. **Enforced Translation Glossaries**: Multi-tenant terminology glossary definitions strictly replaced on translation pipeline output streams.
5. **Customizable Live Captions**: Per-user preferences (size, positioning, delay buffer, style themes, opacity) rendered floating above stage viewports.
6. **Advanced Voice Profiles**: Deep speech model, pitch, speed, volume, and gender voice settings saved dynamically inside profiles.
7. **Secure Webhooks**: HMACS-SHA256 signed POST events triggered on room creation and closure.
8. **Observability Isolation**: Strict boundaries keeping engineering metrics exclusively inside the Admin Dashboard.
9. **Export & Replay Tools**: Chronological timeline replayer and Markdown, JSON, HTML, PDF reports generators.
