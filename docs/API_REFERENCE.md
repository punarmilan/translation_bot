# API Reference Manual

This manual lists REST endpoints and WebSockets communications models.

## Public Meeting API

### GET `/api/meetings/{room_id}/summary`
Retrieves generated intelligence summary.
- **Response**:
  ```json
  {
    "summary": {
      "summary_text": "This meeting covered...",
      "action_items": [{"task": "Review", "assignee": "Host", "deadline": "Friday"}],
      "decisions": [],
      "deadlines": [],
      "open_questions": [],
      "topics": [],
      "follow_up_notes": "...",
      "timeline": []
    }
  }
  ```

### GET `/api/meetings/{room_id}/analytics`
Retrieves aggregates duration, speak duration shares, and translation loads.
- **Permissions**: Meeting Host / Admins only.

### GET `/api/meetings/{room_id}/export/{format}`
Downloads reports in PDF, Markdown, HTML, or JSON.

### GET `/api/meetings/{room_id}/replay-timeline`
Compiles chat, recordings, whiteboard updates sorted chronologically.

### GET `/api/search`
Queries text/regex matches over rooms, messages, or summaries.
- **Parameters**: `q` (query term), `type` (keyword|meeting|transcript|summary).

## Enterprise Administrative API

### GET `/api/admin/enterprise/organizations`
Returns a list of organizations.

### POST `/api/admin/enterprise/organizations`
Registers a new multi-tenant organization.

### POST `/api/admin/platform/glossary`
Inserts or edits terminology mappings applied to output streams.
- **Request Body**:
  ```json
  {
    "source_term": "GiftMe",
    "target_term": "GiftMe Watch",
    "language": "es",
    "industry": "Business",
    "priority": 1,
    "case_sensitive": false,
    "notes": "Branding Term",
    "enabled": true
  }
  ```
