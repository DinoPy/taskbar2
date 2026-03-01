# Frontend Scheduler WebSocket Contract (V2)

This document is the implementation contract for schedule and occurrence behavior after the latest Google-like scheduler updates.

---

## 0) Latest Backend Updates (2026-02-23)

1. `schedule_delete` now supports explicit delete modes:
   - `schedule_only` (default)
   - `schedule_and_future_occurrences`
   - `schedule_and_future_occurrences_after_date` (requires `future_from`)
2. `occurrences_fetch` now guarantees `occurrence.payload` is a JSON object on the wire (not base64-encoded bytes).
3. `connected` no longer includes occurrences; frontend must call `occurrences_fetch` for calendar windows.
4. `connected` includes `user_settings.calendar_filters` and backend supports `user_settings_get` / `user_settings_update`.

---

## 1) Transport Envelope

All WebSocket messages use this envelope:

```json
{
  "event": "string",
  "data": {}
}
```

---

## 2) Primitive Types

| Name | Type | Format |
|---|---|---|
| `uuid` | string | RFC4122 UUID |
| `timestamp` | string | RFC3339 timestamp |
| `int` | number | JSON integer |
| `bool` | boolean | `true` or `false` |
| `json` | object | Arbitrary JSON object |

---

## 3) Nullable SQL Wrapper Types (Important)

Server responses use Go `sql.Null*` JSON shapes for nullable DB fields:

| Wrapper | JSON shape |
|---|---|
| `NullString` | `{ "String": "text", "Valid": true }` |
| `NullInt32` | `{ "Int32": 10, "Valid": true }` |
| `NullBool` | `{ "Bool": true, "Valid": true }` |
| `NullTime` | `{ "Time": "2026-02-22T17:00:00Z", "Valid": true }` |

When `Valid` is `false`, the value field still exists but must be ignored.

---

## 4) Core Data Objects

### 4.1 `Schedule`

```ts
type Schedule = {
  id: uuid
  user_id: uuid
  series_uuid: uuid
  kind: "task" | "reminder"
  title: string
  tz: string
  start_local: timestamp
  rrule: NullString
  until_local: NullTime
  show_before_minutes: NullInt32
  notify_offsets_min: int[]
  muted_offsets_min: int[]
  active: bool
  rev: int                       // incremented on every template mutation
  last_materialized_until: NullTime
  deleted_at: NullTime
  created_at: timestamp
  updated_at: timestamp
  category: NullString
  common_language: NullString
  urgency: string
  is_all_day: bool
  all_day_span_days: int
  duration_minutes: int
}
```

**`rev`** is the schedule's revision counter. It is incremented on template mutations (`schedule_edit`, `following`/`all` occurrence edits, and scoped cancel/delete operations that truncate/deactivate/soft-delete schedules). Use it for optimistic locking (see `expected_source_rev` in `occurrence_edit`).

### 4.2 `OccurrenceRow` (from `occurrences_list`)

```ts
type OccurrenceRow = {
  id: uuid
  schedule_id: uuid
  user_id: uuid
  series_uuid: uuid
  instance_key: string
  occurs_at: timestamp
  rev: int
  source_rev: int                // mirrors schedule.rev at the time this occurrence was planned
  snapshot: json
  overrides: json
  customized_fields: string[]
  state: "planned" | "canceled" | "skipped" | "completed" | "deleted"
  mutated_at: timestamp
  canceled_at: NullTime
  custom_reason: NullString
  task_activate_at: NullTime
  notification_activate_at: NullTime
  task_materialized_at: NullTime
  notification_materialized_at: NullTime
  is_all_day: bool
  all_day_span_days: int
  kind: "task" | "reminder"
  title: string
  common_language: NullString
  payload: json
}
```

**`source_rev`** mirrors `schedule.rev` at the time the occurrence was planned. Pass this value as `expected_source_rev` in `following`/`all` edits to enable optimistic locking.
**`payload`** is always emitted as a JSON object by backend responses (`occurrences_fetch`). Frontend should treat any non-object payload as invalid data.

### 4.3 `OccurrenceUpdatedPayload` (from `occurrence_updated`)

```ts
type OccurrenceUpdatedPayload = {
  occurrence_id: uuid
  schedule_id: uuid
  series_uuid: uuid
  instance_key: string
  state: string
  occurs_at: timestamp
  snapshot: json
  overrides: json
  customized_fields: string[]
  payload: json
  mutated_at: timestamp
}
```

---

## 5) Client -> Server Events

## 5.1 `schedule_create`

### Request

```json
{
  "event": "schedule_create",
  "data": {
    "kind": "task",
    "title": "Workout",
    "tz": "Europe/Bucharest",
    "start_local": "2026-02-23T09:00:00+02:00",
    "rrule": "FREQ=DAILY;INTERVAL=1",
    "until_local": "2026-06-01T09:00:00+03:00",
    "show_before_minutes": 30,
    "notify_offsets_min": [60, 10],
    "muted_offsets_min": [],
    "category": "Health",
    "common_language": "every morning",
    "urgency": "normal",
    "is_all_day": false,
    "all_day_span_days": 1,
    "duration_minutes": 45
  }
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | string | yes | `task` or `reminder` |
| `title` | string | yes | non-empty |
| `tz` | string | yes | IANA timezone |
| `start_local` | timestamp | yes | RFC3339 |
| `rrule` | string or null | no | omit/null/empty means one-off |
| `until_local` | timestamp or null | no | recurrence end |
| `show_before_minutes` | int | no | defaults to `0` |
| `notify_offsets_min` | int[] | no | defaults to `[]` |
| `muted_offsets_min` | int[] | no | defaults to `[]` |
| `category` | string or null | no | defaults to `"Life"` |
| `common_language` | string or null | no | free text |
| `urgency` | string or null | no | defaults to `"normal"` |
| `is_all_day` | bool | no | defaults to `false` |
| `all_day_span_days` | int | no | min `1`, defaults `1` |
| `duration_minutes` | int | no | min `0`, defaults `0` |

### Server Success Event

- `schedule_created` with `data: Schedule`.

---

## 5.2 `schedule_edit`

Template-level update for a specific schedule ID.

### Request

```json
{
  "event": "schedule_edit",
  "data": {
    "id": "uuid",
    "title": "Workout",
    "tz": "Europe/Bucharest",
    "start_local": "2026-02-23T09:00:00+02:00",
    "rrule": "FREQ=DAILY;INTERVAL=1",
    "until_local": null,
    "show_before_minutes": 30,
    "notify_offsets_min": [60, 10],
    "muted_offsets_min": [],
    "category": "Health",
    "common_language": "every morning",
    "urgency": "normal",
    "is_all_day": false,
    "all_day_span_days": 1,
    "duration_minutes": 45
  }
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | schedule id |
| `title` | string | effectively yes | send full value |
| `tz` | string | effectively yes | send full value |
| `start_local` | timestamp | effectively yes | send full value |
| `rrule` | string or null | no | |
| `until_local` | timestamp or null | no | |
| `show_before_minutes` | int | no | |
| `notify_offsets_min` | int[] | effectively yes | send full array |
| `muted_offsets_min` | int[] | effectively yes | send full array |
| `category` | string or null | no | |
| `common_language` | string or null | no | |
| `urgency` | string or null | no | |
| `is_all_day` | bool | no | |
| `all_day_span_days` | int | no | min `1` |
| `duration_minutes` | int | no | min `0` |

`schedule_edit` should be treated as a full template update from frontend perspective:
- send complete schedule template values (not sparse patch),
- omitted nullable/template fields may be interpreted as unset/default in backend update flow.

### Behavior

- Updates schedule template and increments `schedule.rev`.
- Prunes only **future planned occurrences that are not materialized** (`task_materialized_at` and `notification_materialized_at` both null).
- Keeps materialized occurrences detached from template rewrite.
- Resets planner cursor and triggers a targeted planner refresh for this schedule only.

### Server Success Event

- `schedule_updated` with `data: Schedule`.

---

## 5.3 `schedule_delete`

### Request

```json
{
  "event": "schedule_delete",
  "data": {
    "id": "uuid",
    "delete_mode": "schedule_only",
    "future_from": "2026-06-01T00:00:00Z"
  }
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | schedule id |
| `delete_mode` | string | no | default `schedule_only`; one of `schedule_only`, `schedule_and_future_occurrences`, `schedule_and_future_occurrences_after_date` |
| `future_from` | timestamp | conditional | required when `delete_mode=schedule_and_future_occurrences_after_date`; RFC3339 |

### Behavior

- `schedule_only` (default): soft-deletes the schedule; does not delete occurrences.
- `schedule_and_future_occurrences`: soft-deletes schedule and deletes occurrences where `occurs_at > now`.
- `schedule_and_future_occurrences_after_date`: soft-deletes schedule and deletes occurrences where `occurs_at >= future_from`.
- In all modes, future notification jobs for the schedule are canceled before delete is persisted.
- After soft delete, `occurrences_fetch` still returns this schedule's past/current occurrences (`occurs_at <= server_now`) if they are inside the requested window; future occurrences are excluded.

### Server Success Event

- `schedule_deleted` with:

```ts
{
  id: uuid
}
```

---

## 5.4 `schedule_list`

### Request

```json
{
  "event": "schedule_list",
  "data": {}
}
```

### Server Success Event

- `schedules_list` with:

```ts
{
  schedules: Schedule[]
}
```

---

## 5.5 `occurrences_fetch`

### Request

```json
{
  "event": "occurrences_fetch",
  "data": {
    "start": "2026-02-22T00:00:00Z",
    "end": "2026-05-22T00:00:00Z"
  }
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `start` | timestamp | yes | RFC3339 UTC recommended |
| `end` | timestamp | yes | must be >= start |

### Server Success Event

- `occurrences_list` with:

```ts
{
  start: timestamp
  end: timestamp
  occurrences: OccurrenceRow[]
}
```

### Fetch Filter Rules

- Returns occurrences with `state IN ("planned", "canceled")`.
- Excludes `state = "deleted"` occurrences.
- Requested window is authoritative: past occurrences are returned if they are within `[start, end]`.
- For soft-deleted schedules, only occurrences with `occurs_at <= server_now` are returned.
- `occurrence.payload` is always a JSON object (merged `snapshot + overrides`), never base64 text.

---

## 5.6 `occurrence_edit`

### Request

```json
{
  "event": "occurrence_edit",
  "data": {
    "schedule_id": "uuid",
    "anchor_occurs_at": "2026-03-10T14:00:00Z",
    "changes": {
      "title": "Updated title",
      "occurs_at": "2026-02-23T12:00:00Z",
      "duration_minutes": 60
    },
    "apply_scope": "following",
    "include_customized": false,
    "expected_source_rev": 4
  }
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `occurrence_id` | uuid | conditionally | preferred direct target when already materialized |
| `schedule_id` | uuid | conditionally | required with `anchor_occurs_at` when `occurrence_id` is omitted |
| `anchor_occurs_at` | timestamp | conditionally | required with `schedule_id` when `occurrence_id` is omitted |
| `changes` | json object | yes | patch payload |
| `apply_scope` | string | no | `single`, `following`, `all`; defaults to `single` |
| `apply_mode` | string | no | deprecated alias for `apply_scope` |
| `include_customized` | bool | no | default `false`; see behavior below |
| `expected_source_rev` | int | no | optimistic lock for `following`/`all` only; omit to skip the check |

### Resolution Precedence

1. If `occurrence_id` is present, server targets that occurrence directly.
2. Otherwise server requires `schedule_id + anchor_occurs_at`: materializes occurrences up to `anchor_occurs_at`, resolves by `series_uuid + instance_key`, then applies scope.

If neither is provided → `400 invalid_data`.

### `changes` Keys (for `following`/`all` scope)

`title`, `tz`, `occurs_at`, `rrule`, `until_local`, `show_before_minutes`, `notify_offsets_min`, `muted_offsets_min`, `category`, `common_language`, `urgency`, `is_all_day`, `all_day_span_days`, `duration_minutes`.

### Scope Behavior

| Scope | Behavior |
|---|---|
| `single` | Edits only one occurrence (overwrites overrides/customized fields). If the target is `canceled`, single edit restores it to `planned`. If target is beyond horizon and resolved via anchor, server materializes on demand first. |
| `following` | Splits the series at the target occurrence. Old schedule is ended at `min(anchor_occurrence, first_new_occurrence) - 1s`. New schedule is created with the same `series_uuid` and the edited template values. **All customized occurrences at or after the split point are migrated to the new `schedule_id`** — see ownership note below. |
| `all` | Applies schedule-level mutation across all active schedules in the series. Each schedule's template is updated and non-customized planned rows are regenerated. |

### `include_customized` Behavior

**For `following` scope:**

| `include_customized` | Non-customized rows ≥ split point | Customized rows ≥ split point |
|---|---|---|
| `false` | Deleted from old schedule; regenerated under new schedule by planner | Migrated to new `schedule_id` without selective merge. Existing payload values are preserved as-is. |
| `true` | Deleted from old schedule; regenerated under new schedule by planner | Same migration as `false`, **plus** fields not listed in `customized_fields` are updated to the new template values. |

> **Important:** In both cases, customized occurrences always move to the new schedule. `include_customized=false` means no template merge on migrated customized rows; `include_customized=true` applies selective merge for non-customized keys. After a `following` edit, any occurrence that belonged to the old schedule and had `occurs_at >= splitFromUTC` will now have `schedule_id = new_schedule_id`. The frontend must reassign these in its local store based on the `occurrence_series_updated` event (see sync guidance).

**For `all` scope:**

| `include_customized` | Non-customized rows | Customized rows |
|---|---|---|
| `false` | All planned rows deleted and regenerated | Preserved on their existing schedule; `snapshot` is **not** updated |
| `true` | All planned rows deleted and regenerated | Snapshot refreshed; fields not in `customized_fields` inherit new template values |

### Optimistic Locking (`expected_source_rev`) — `following` and `all` only

Each occurrence carries `source_rev` which mirrors `schedule.rev` at planning time. For `following` and `all` edits, the server can enforce that no concurrent mutation has occurred since the occurrence was fetched.

To use:
1. Read `source_rev` from the occurrence you are editing.
2. Send it as `expected_source_rev` in the request.
3. Server compares it against the live `schedule.rev` inside a transaction.
4. If they differ → `409 conflict` (see error table below).
5. If `expected_source_rev` is omitted → check is skipped.

This field has no effect on `single` scope edits (those use `mutated_at` instead).

### Server Success Events

For `single`:
- `occurrence_updated` with `OccurrenceUpdatedPayload`.

For `following`:
- `schedule_updated` with the updated old source schedule (`until_local` truncated to before the split point).
- `schedule_created` with the new split schedule.
- `occurrence_series_updated` with:

```ts
{
  series_uuid: uuid
  apply_scope: "following"
  include_customized: bool
  target_occurrence_id: uuid
  old_schedule_id: uuid
  new_schedule_id: uuid
}
```

For `all`:
- `occurrence_series_updated` with:

```ts
{
  series_uuid: uuid
  apply_scope: "all"
  include_customized: bool
  target_occurrence_id: uuid
}
```

### Error Responses

| Code | `type` | Condition |
|---|---|---|
| `400` | `invalid_data` | `changes` missing or empty |
| `400` | `invalid_data` | Neither `occurrence_id` nor `schedule_id + anchor_occurs_at` provided |
| `400` | `invalid_data` | `apply_scope` not one of `single`, `following`, `all` |
| `403` | `unauthorized` | Schedule or occurrence does not belong to the connected user |
| `404` | `not_found` | Anchor does not correspond to a planned occurrence in this schedule |
| `404` | `not_found` | Anchor occurrence belongs to a different segment of this series; use the occurrence's own `schedule_id` |
| `404` | `not_found` | `single` edit target is deleted (`"Deleted occurrence cannot be edited"`) |
| `404` | `not_found` | `following`/`all` target is not planned (`"Only planned occurrences can be edited with this scope"`) |
| `409` | `conflict` | `single` — occurrence was concurrently modified (`mutated_at` mismatch) |
| `409` | `conflict` | `following`/`all` — schedule was modified by another client (`schedule.rev` mismatch); re-fetch and retry |
| `500` | `database_error` | Internal server error |

**409 response shape:**

```json
{
  "event": "connection_error",
  "data": {
    "type": "conflict",
    "message": "Schedule was modified by another client; re-fetch and retry",
    "code": 409
  }
}
```

> The two 404 cases have distinct messages. The second one means the occurrence's `schedule_id` on the server differs from the one you sent — the series has been split and the occurrence has moved to a different segment. Re-fetch the occurrence list to get the current `schedule_id`, then retry.

---

## 5.7 `occurrence_cancel`

Request:

```json
{
  "event": "occurrence_cancel",
  "data": {
    "occurrence_id": "uuid",
    "apply_scope": "single",
    "include_customized": false,
    "reason": "optional reason"
  }
}
```

Fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `occurrence_id` | uuid | conditionally | preferred direct target |
| `schedule_id` | uuid | conditionally | required with `anchor_occurs_at` if `occurrence_id` omitted |
| `anchor_occurs_at` | timestamp | conditionally | required with `schedule_id` if `occurrence_id` omitted |
| `apply_scope` | string | no | `single`, `following`, `all` |
| `apply_mode` | string | no | deprecated alias |
| `include_customized` | bool | no | relevant for `following`/`all` |
| `reason` | string | no | stored in `custom_reason` |

Resolution precedence:

1. `occurrence_id` when present.
2. otherwise `schedule_id + anchor_occurs_at` with repeated-batch materialization toward the anchor (500 occurrences per batch).

State behavior:

- `single`: target transitions to `state="canceled"` (if already canceled, operation is idempotent).
- `following` / `all`: scoped planned rows transition to canceled according to scope and customization rules.
- `all`: in addition to occurrence state changes, backend deactivates schedules in the series (`active=false`).

Error responses:

| Code | `type` | Condition |
|---|---|---|
| `400` | `invalid_data` | Missing target (`occurrence_id` or `schedule_id + anchor_occurs_at`) |
| `400` | `invalid_data` | Invalid `apply_scope` |
| `403` | `unauthorized` | Ownership mismatch |
| `404` | `not_found` | Anchor not planned in this schedule / split-segment mismatch |
| `404` | `not_found` | Deleted target cannot be canceled |
| `404` | `not_found` | `following`/`all` target is not planned |
| `500` | `database_error` | Internal server error |

Success events:

- `single`: `occurrence_canceled`.
- `following|all`: `occurrence_series_updated` with `action: "cancel"`.

## 5.8 `occurrence_delete`

`occurrence_delete` is permanent hide/tombstone semantics (`state="deleted"`), not cancel.

Request shape mirrors `occurrence_cancel`:

```json
{
  "event": "occurrence_delete",
  "data": {
    "occurrence_id": "uuid",
    "apply_scope": "single",
    "include_customized": false,
    "reason": "optional reason"
  }
}
```

Targeting precedence:

1. `occurrence_id` if present.
2. otherwise `schedule_id + anchor_occurs_at` with repeated-batch materialization toward the anchor (500 occurrences per batch).

State behavior:

- `single`: transitions planned/canceled/deleted to `deleted` (idempotent for already deleted).
- `following` / `all`: requires a planned anchor; scoped rows become deleted.
- `all`: in addition to occurrence tombstones, backend soft-deletes schedules in the series (`deleted_at` set, `active=false`).

Error responses:

| Code | `type` | Condition |
|---|---|---|
| `400` | `invalid_data` | Missing target (`occurrence_id` or `schedule_id + anchor_occurs_at`) |
| `400` | `invalid_data` | Invalid `apply_scope` |
| `403` | `unauthorized` | Ownership mismatch |
| `404` | `not_found` | Anchor not planned in this schedule / split-segment mismatch |
| `404` | `not_found` | `following`/`all` target is not planned |
| `500` | `database_error` | Internal server error |

Success events:

- `single`: `occurrence_deleted`.
- `following|all`: `occurrence_series_updated` with `action: "delete"`.

---

## 5.9 `reminder_submit` (scheduler-related helper flow)

### Request highlights

`data.duration_minutes` is optional and supported.

### Server Success Event

- `reminder_submit_response`:

```ts
{
  success: true
  schedule: Schedule
}
```

---

## 5.10 `user_settings_get` / `user_settings_update` (calendar filters)

### `user_settings_get` request

```json
{
  "event": "user_settings_get",
  "data": {}
}
```

### `user_settings_get` response

```ts
{
  calendar_filters: {
    hidden_kinds: string[]
    hidden_states: string[]
    hidden_schedule_ids: string[]
  }
  updated_at: timestamp
}
```

### `user_settings_update` request

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
- `calendar_filters` is required.
- Patch semantics per key: omitted keys are preserved.
- Provided arrays replace the stored array for that key.
- Backend normalizes values (trim/lowercase/deduplicate/sort) and validates UUIDs in `hidden_schedule_ids`.

---

## 6) Server Push Events You Must Handle

| Event | Data type | Trigger | Delivery |
|---|---|---|---|
| `schedule_created` | `Schedule` | `schedule_create`, split-series `occurrence_edit(following)` | same-user broadcast |
| `schedule_updated` | `Schedule` | `schedule_edit`, split-series `occurrence_edit(following)` | same-user broadcast |
| `schedule_deleted` | `{ id: uuid }` | `schedule_delete` | same-user broadcast |
| `schedules_list` | `{ schedules: Schedule[] }` | `schedule_list` | requesting socket only |
| `occurrences_list` | `{ start, end, occurrences[] }` | `occurrences_fetch` | requesting socket only |
| `occurrence_updated` | `OccurrenceUpdatedPayload` | `occurrence_edit(single)` | same-user broadcast |
| `occurrence_canceled` | object | `occurrence_cancel(single)` | same-user broadcast |
| `occurrence_deleted` | object | `occurrence_delete(single)` | same-user broadcast |
| `occurrence_series_updated` | object | `occurrence_edit/cancel/delete` with `following` or `all` | same-user broadcast |
| `new_task_created` | `Task` object | lazy task materialization became due | same-user broadcast |
| `notification_created` | `Notification` object | notification dispatcher sent notification | same-user broadcast |
| `user_settings` | `{ calendar_filters, updated_at }` | `user_settings_get` | requesting socket only |
| `user_settings_updated` | `{ calendar_filters, updated_at }` | `user_settings_update` | same-user broadcast |
| `connection_error` | error payload | validation/auth/db/conflict failures | requesting socket only |

---

## 7) Connected Bootstrap Payload

`connect` flow returns `connected` event containing these scheduler-relevant fields:

```ts
{
  schedules: Schedule[]
  user_settings: {
    calendar_filters: {
      hidden_kinds: string[]
      hidden_states: string[]
      hidden_schedule_ids: string[]
    }
    updated_at: timestamp
  }
  // plus non-scheduler fields (tasks, tags, notifications, profile...)
}
```

Occurrence rows are not included in `connected`. The client must call `occurrences_fetch` for the visible window after connect.

---

## 8) Planning Horizon and Materialization Rules

### 8.1 Occurrence planning horizon

- Minutely recurrence: up to 48 hours ahead.
- Hourly recurrence: up to 7 days ahead.
- Daily/weekly/monthly/other recurrence: up to 90 days ahead.

### 8.2 Materialization model

- Occurrences are planned eagerly within horizon.
- Tasks and notification jobs are materialized lazily near activation times.
- `task_activate_at` and `notification_activate_at` govern when materialization begins.

---

## 9) Frontend Sync Guidance

### 9.0 Virtual Calendar Population (Required)

Frontend should populate calendar by combining:
1. `occurrences_fetch` rows (authoritative for materialized/planned overrides, canceled states, and detached edits).
2. Virtual schedule expansion from `schedules` for instances not present yet in `occurrences`.

Recommended rendering algorithm:
1. Fetch schedules (`connected` + `schedule_list`) and current visible occurrence window (`occurrences_fetch`).
2. Expand active schedules client-side in the visible window:
   - use `schedule.tz`, `start_local`, `rrule`, `until_local`, `is_all_day`, `all_day_span_days`, `duration_minutes`.
   - skip schedules where `active=false` or `deleted_at.Valid=true`.
3. Build virtual instance identity using backend-compatible keys:
   - `series_uuid = schedule.series_uuid`
   - `instance_key = YYYYMMDD` for all-day, or `YYYYMMDDTHHMMSS` for timed instances in schedule timezone.
4. If an `occurrences_fetch` row exists for the same `series_uuid + instance_key`, prefer that occurrence row and suppress the virtual copy.
5. Use virtual instances mainly to fill future gaps beyond current materialization horizon.

Important:
- Virtual instances are display-only until materialized; they do not have stable `occurrence_id`.
- For beyond-horizon edits/cancel/delete, use `schedule_id + anchor_occurs_at` (not `occurrence_id`).

### 9.1 After series edits

1. After receiving `occurrence_series_updated`, call `schedule_list` and `occurrences_fetch` for the visible range to get the latest state.
2. Merge `schedule_updated` and `schedule_created` events into your local store immediately upon receipt — do not wait for a full refetch.
3. Treat `duration_minutes` as optional in all create/edit flows, defaulting to `0` when absent.

### 9.2 Handling `following` splits — occurrence ownership

After `occurrence_edit` with `apply_scope="following"` succeeds, the server emits `occurrence_series_updated` containing `old_schedule_id` and `new_schedule_id`. Any occurrence that:
- belongs to `old_schedule_id`, **and**
- has `occurs_at >= splitFromUTC` (inferred as the target occurrence's `occurs_at`, or earlier if the edit moved `occurs_at` backward)

…has been reassigned to `new_schedule_id` on the server. **Do not rely on the old `schedule_id` for these occurrences.** The safest approach is to invalidate all occurrences in your cache for the affected `series_uuid` and refetch via `occurrences_fetch`.

This applies regardless of whether `include_customized` was `true` or `false`. Customized occurrences are always migrated to the new segment; the flag only controls whether their non-customized fields are updated to the new template.

### 9.3 Optimistic locking for `following`/`all` edits

To prevent silent data loss from concurrent edits:

1. When the user selects an occurrence to edit with `following` or `all` scope, read `occurrence.source_rev`.
2. Include it as `expected_source_rev` in the request.
3. If the server returns `409 conflict`, the schedule was mutated after the occurrence was fetched. Refetch schedules and occurrences, show the user the latest state, and ask them to retry.

If you do not send `expected_source_rev`, the check is skipped (last-writer-wins).

### 9.4 Handling 409 conflicts

```json
{
  "event": "connection_error",
  "data": {
    "type": "conflict",
    "message": "...",
    "code": 409
  }
}
```

Two distinct 409 scenarios:
- **`single` scope:** `mutated_at` mismatch — occurrence was edited in another session. Message: `"Occurrence changed in another session; refresh and retry"`.
- **`following`/`all` scope:** `schedule.rev` mismatch — schedule template changed since the occurrence was planned. Message: `"Schedule was modified by another client; re-fetch and retry"`.

In both cases: refetch the relevant data, present the current state to the user, and let them reapply their changes.

### 9.5 Handling 404 anchor errors

Two distinct 404 messages are possible from `occurrence_edit`, `occurrence_cancel`, and `occurrence_delete` when resolving by anchor:

| Message | Meaning | Action |
|---|---|---|
| `"Anchor does not correspond to a planned occurrence in this schedule"` | The given `schedule_id + anchor_occurs_at` did not resolve to any planned occurrence. | Verify the occurrence exists in the fetched list. The occurrence may have been canceled or is outside the planning horizon. |
| `"Anchor occurrence belongs to a different segment of this series; use the occurrence's own schedule_id"` | The occurrence was found by `series_uuid + instance_key` but its `schedule_id` no longer matches the one sent. The series was split and this occurrence moved to a new segment. | Refetch the occurrence list — the occurrence now has a different `schedule_id`. Use that value in your retry. |

### 9.6 Beyond-horizon scoped mutations

Occurrences beyond the planning horizon are not yet in the database. Use `schedule_id + anchor_occurs_at` with `occurrence_edit`, `occurrence_cancel`, or `occurrence_delete` instead of `occurrence_id`; the server materializes toward the anchor in repeated batches (500 occurrences per batch) until resolved or recurrence bounds are reached.

This works for all three scopes (`single`, `following`, `all`).
