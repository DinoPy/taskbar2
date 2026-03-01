# Frontend User Settings WS Contract

## 1) Scope

This document defines the WebSocket contract for persisted user calendar visibility filters.

These filters are user preferences, not schedule/occurrence data, and are stored server-side in `user_settings.calendar_filters`.

## 2) Data Shape

### 2.1 `calendar_filters`

```ts
type CalendarFilters = {
  hidden_kinds: string[]            // allowed: "task" | "reminder"
  hidden_states: string[]           // allowed: "planned" | "canceled" | "deleted" | "completed" | "skipped"
  hidden_schedule_ids: string[]     // UUID strings
}
```

### 2.2 `user_settings` payload

```ts
type UserSettingsPayload = {
  calendar_filters: CalendarFilters
  updated_at: string // RFC3339
}
```

## 3) Connected Payload Change

`connected` now includes:

```ts
{
  user_settings: UserSettingsPayload
}
```

Notes:
- Occurrences are still fetched only via `occurrences_fetch`.
- If settings do not exist yet, backend auto-creates defaults.

## 4) Client -> Server Events

### 4.1 `user_settings_get`

Request:

```json
{
  "event": "user_settings_get",
  "data": {}
}
```

Response (`requesting socket only`):

```json
{
  "event": "user_settings",
  "data": {
    "calendar_filters": {
      "hidden_kinds": [],
      "hidden_states": [],
      "hidden_schedule_ids": []
    },
    "updated_at": "2026-02-24T10:40:00Z"
  }
}
```

### 4.2 `user_settings_update`

Request supports partial patch for filter keys:

```json
{
  "event": "user_settings_update",
  "data": {
    "calendar_filters": {
      "hidden_kinds": ["task"],
      "hidden_states": ["canceled"],
      "hidden_schedule_ids": ["11111111-1111-1111-1111-111111111111"]
    }
  }
}
```

Rules:
- `data.calendar_filters` is required.
- Each key inside `calendar_filters` is optional (patch semantics).
- Omitted keys are preserved.
- Provided arrays fully replace the corresponding stored array.

## 5) Server Push Events

### 5.1 `user_settings_updated`

Broadcast to all sessions of same user (including issuer):

```json
{
  "event": "user_settings_updated",
  "data": {
    "calendar_filters": {
      "hidden_kinds": ["task"],
      "hidden_states": [],
      "hidden_schedule_ids": []
    },
    "updated_at": "2026-02-24T10:45:00Z"
  }
}
```

### 5.2 `user_settings`

Sent only as direct response to `user_settings_get`.

## 6) Validation and Normalization

Backend behavior on accepted updates:
- Trims whitespace from all entries.
- Lowercases enum entries.
- Deduplicates values.
- Sorts arrays lexicographically for stable output.
- Validates UUID format for `hidden_schedule_ids`.

Invalid data returns `connection_error`:
- `type: "invalid_data"`
- `code: 400`
- descriptive `message`.

## 7) Defaults

Default filter object:

```json
{
  "hidden_kinds": [],
  "hidden_states": [],
  "hidden_schedule_ids": []
}
```

## 8) Frontend Behavior Recommendations

1. Use `connected.user_settings` for initial local state.
2. Apply filters client-side when rendering schedules/occurrences/tasks.
3. On settings UI save, send `user_settings_update`.
4. On `user_settings_updated`, replace local settings with event payload.
5. Keep optimistic UI optional; server emits canonical normalized values.

## 9) Current Backend Filtering Scope

These settings are persistence + sync primitives.

Backend does not currently apply `calendar_filters` to `occurrences_fetch` or `schedule_list`; filtering is expected in frontend rendering.
