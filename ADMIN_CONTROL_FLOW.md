# VOXO Real-Time Admin Control Plane Flow

This document outlines how administrative actions, configuration settings, and feature flag changes propagate in real-time across the VOXO platform.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN CONSOLE (Port 5176)                       │
│   Administrator updates Feature Flags, Settings, Roles, or Content     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP PATCH / POST
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN BACKEND (Port 8010)                       │
│   1. Persists changes to MongoDB (translation_bot_db)                 │
│   2. Records entry in Audit Logs repository (`audit_logs`)             │
│   3. Triggers HTTP POST http://127.0.0.1:8000/api/internal/reload-config│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Internal Reload Event
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN BACKEND (Port 8000)                        │
│   1. Reloads in-memory `runtime_settings` from MongoDB                 │
│   2. Broadcasts `system_config_updated` WebSocket event to all rooms   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ WebSocket Broadcast
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    CONNECTED WORKSPACE CLIENTS                         │
│   Client UI updates Feature Flags, restrictions, and banners instantly  │
└────────────────────────────────────────────────────────────────────────┘
```

## Admin Features & Capabilities

1. **Audit Logs**: Every administrative mutation (creating users, toggling feature flags, changing roles, updating content) records an audit entry containing `admin_id`, `action`, `target`, `timestamp`, and `details`.
2. **Dynamic Feature Flags**: Toggling features like `voice_translation`, `video_calling`, `recording`, or `screen_sharing` updates connected meeting rooms dynamically without page reloads.
3. **Role Enforcement**: Host, co-host, participant, and admin permissions are enforced server-side on room actions and file management.
