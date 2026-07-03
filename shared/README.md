# Shared Contracts

This directory documents contracts shared across independently deployed applications.

- Public backend issues JWTs containing `sub`, `username`, `role`, and `exp`.
- Admin backend validates the same JWT with the same `JWT_SECRET`.
- Both APIs use the same MongoDB database.
- Admin frontend stores its token under `admin_access_token`, separate from the participant application.

No live meeting state is shared between processes yet. Admin meeting commands are persisted in `admin_commands`; a future Redis-backed control plane should deliver them to the websocket service.
