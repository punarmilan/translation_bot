# Administrative Operations Manual

This guide describes features available in the Admin Dashboard at `admin.giftme.watch`.

## 1. Governance & Hierarchy
Organizations act as multi-tenant boundaries. User records are associated with an `org_id` and assigned roles determining API authorizations:
- **Admin**: Complete control of settings, glossaries, system health, and integrations.
- **Host**: Allowed to launch rooms, run meeting exports, and review analytics logs.
- **Participant**: Base meeting access.

## 2. Managing Terminology Glossaries
Glossary replacements prevent machine translation services from translating corporate trademarks or specialized vocabulary:
1. Log in to the Admin Dashboard.
2. Select **Platform Settings** $\rightarrow$ **Translation Glossary**.
3. Create a rule (e.g. matching source term "GiftMe" and replacing with "GiftMe Watch").
4. Priority decides replacements sequence (higher runs first). Case sensitivity is configurable.

## 3. Operations & Observability
System metrics are isolated to prevent normal meeting attendees from viewing engineering specifics. Go to **System Health** to review:
- CPU and Memory loads.
- WebSocket Queue Depths.
- Cache Hit Ratios.
- STT, Translation, and TTS failures counts.
- WebRTC Packet Loss and Reconnect counters.
