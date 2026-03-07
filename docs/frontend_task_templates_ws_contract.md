# Frontend Task Templates WebSocket Contract

This document is the authoritative frontend contract for task templates and all
template-related backend behavior currently implemented in the Go server.

It covers:

- the `task_template` data model
- template search and CRUD
- manual task creation from a template
- attaching a template to `schedule_create`, `schedule_edit`, and `reminder_submit`
- the `task_template` list owner/target
- rendering, validation, revision, and copy semantics

Unchanged base task/schedule/list shapes are still defined in:

- [`docs/websocket_events.md`](./websocket_events.md)
- [`docs/frontend_scheduler_ws_contract_v2.md`](./frontend_scheduler_ws_contract_v2.md)
- [`docs/frontend_lists_ws_contract.md`](./frontend_lists_ws_contract.md)

## 0) Transport And Realtime Model

All WebSocket messages use the standard envelope:

```json
{
  "event": "string",
  "data": {}
}
```

Template-related client -> server events:

- `template_create`
- `template_edit`
- `template_delete`
- `template_list`
- `template_search`
- `task_create_from_template`
- `schedule_create` with optional `template_use`
- `schedule_edit` with optional `template_use`
- `reminder_submit` with optional `template_use`
- `lists_fetch` with `target.kind = "task_template"`
- `list_create`
- `list_edit`
- `list_delete`
- `list_reorder`
- `list_item_create`
- `list_item_edit`
- `list_item_delete`
- `list_item_reorder`
- `standalone_list_attach`

Template-related server -> client events:

- `template_created`
- `template_updated`
- `template_deleted`
- `template_list`
- `template_search`
- `new_task_created`
- `schedule_created`
- `schedule_updated`
- `reminder_submit_response`
- `lists_target`
- `list_created`
- `list_updated`
- `list_deleted`
- `lists_reordered`
- `list_item_created`
- `list_item_updated`
- `list_item_deleted`
- `list_items_reordered`
- `standalone_list_attached`
- `connection_error`

Delivery semantics:

- `template_created`, `template_updated`, `template_deleted`, `new_task_created`,
  `schedule_created`, `schedule_updated`, `list_*`, `lists_reordered`, and
  `standalone_list_attached` are broadcast to all sessions of the same user.
- `template_list`, `template_search`, `lists_target`, and
  `reminder_submit_response` are sent only to the requesting session.
- `task_create_from_template` has no dedicated success event. Success is the
  same-user broadcast `new_task_created`.

Initial load rule:

- `connected` does not include templates
- templates are not part of the initial connection payload
- the frontend must fetch templates on demand via `template_list` or
  `template_search` when the user navigates to a template surface

Event name reuse note:

- `template_list` is used as both the client request event and the server
  response event
- `template_search` is used as both the client request event and the server
  response event
- the frontend should distinguish request from response by direction (sent vs
  received)

Common mutation timestamp rule:

- when a request includes `last_modified_at`, the frontend should send its
  client timestamp in epoch milliseconds
- if the value is absent, zero, or negative, backend normalizes it to server
  time

## 1) Data Structures

### 1.1 Nullable wrappers used here

```ts
type NullInt32 = { Int32: number; Valid: boolean }
type NullTime = { Time: string; Valid: boolean }   // RFC3339 timestamp
```

These are Go `sql.NullInt32` and `sql.NullTime` structs serialized with default
JSON encoding. The frontend must handle both states:

- present value: `{ "Int32": 2, "Valid": true }` or `{ "Time": "2026-03-07T...", "Valid": true }`
- absent value: `{ "Int32": 0, "Valid": false }` or `{ "Time": "0001-01-01T00:00:00Z", "Valid": false }`

When `Valid` is `false`, ignore the sibling field entirely — treat it as `null`.

`source_template_id` in `Schedule` payloads is the exception: it is serialized
as `uuid | null` (not the wrapper format) because it uses `uuid.NullUUID`.

### 1.2 Template variable definition

```ts
type TaskTemplateVariable = {
  key: string
  label?: string
  description?: string
  required: boolean
}
```

Rules:

- `key` is required
- `key` must match `^[A-Za-z][A-Za-z0-9_]*$`
- duplicate keys are rejected
- backend trims `key`, `label`, and `description`

### 1.3 Template use payload

```ts
type TemplateUse = {
  template_id: string
  template_rev: number
  variables: Record<string, string>
}
```

Rules:

- `template_id` is required
- `template_rev` must equal the current `task_templates.rev`
- variables with `required = true` must be provided and non-blank
- variables with `required = false` may be omitted or blank
- omitted/blank optional variables render as empty strings
- unknown variable keys are rejected

### 1.4 TaskTemplate

```ts
type TaskTemplate = {
  id: string
  user_id: string
  title: string
  description: string
  category: string
  tags: string[]
  priority: NullInt32
  show_before_due_time: number
  due_offset_minutes: NullInt32
  variables: TaskTemplateVariable[]
  rev: number
  created_at: string
  updated_at: string
  last_modified_at: number
  last_used_at: NullTime
}
```

Implementation details:

- `category` defaults to `"Life"` if omitted or blank in create/edit payloads
- `show_before_due_time` defaults to `0`
- `variables` is always stored as a JSON array; omitted/null/blank payloads
  normalize to `[]`
- `rev` starts at `1`
- successful `template_edit` increments `rev`
- successful template-owned list mutations also increment `rev`
- successful template use updates `last_used_at`

### 1.5 Schedule fields added by template support

These fields now exist on `Schedule` and are included in:

- `connected.schedules[]`
- `schedule_created`
- `schedule_updated`
- `schedules_list`
- `reminder_submit_response.data.schedule`

```ts
type ScheduleTemplateFields = {
  description: string
  tags: string[]
  priority: NullInt32
  due_offset_minutes: NullInt32
  source_template_id: string | null
  source_template_rev: NullInt32
  source_template_variables: Record<string, string>
}
```

Rules:

- `source_template_variables` is a JSON object, not an array
- for schedules created without a template, `source_template_variables` is `{}`
- if a template is deleted later, `source_template_id` becomes `null` because of
  the DB foreign key, but copied schedule fields remain unchanged
- `source_template_rev` and `source_template_variables` are not auto-cleared on
  template deletion

### 1.6 Occurrence snapshot fields added by template support

Task schedule occurrences carry the copied template snapshot in their JSON
payload/snapshot:

```ts
type OccurrenceTemplateSnapshotFields = {
  description: string
  tags: string[]
  priority: number | null
  due_offset_minutes: number | null
  source_template_id: string | null
  source_template_rev: number | null
  source_template_variables: Record<string, string>
}
```

These fields are derived from the schedule snapshot, not loaded live from the
template at occurrence time.

### 1.7 Lists target shape for task templates

Task templates are now a valid list owner and fetch target.

```ts
type TemplateListTarget = {
  kind: "task_template"
  id: string
}
```

`lists_fetch(target=task_template)` returns the normal `ListsTargetPayload`
shape, with the template-specific values:

```ts
type TemplateListsTargetPayload = {
  target: {
    kind: "task_template"
    id: string
  }
  resolved_from: {
    template_id: string
    schedule_id: null
    occurrence_id: null
    task_id: null
    notification_id: null
  }
  lists: Array<{
    definition: {
      owner: {
        kind: "task_template"
        id: string
      }
      // remaining definition fields are unchanged
    }
    items: ListItem[]
    run: null
    run_items: null
  }>
}
```

Template-owned lists never have runs while editing the template.

## 2) Rendering And Validation Rules

### 2.1 Placeholder syntax

Supported placeholder syntax:

```text
{{name}}
{{ name }}
{{name_2}}
```

Key syntax is the same as variable keys:

- first character must be a letter
- later characters may be letters, digits, or `_`

### 2.2 Fields where placeholders are rendered

Placeholders are rendered only in:

- template `title`
- template `description`
- template `category`
- template `tags[]`
- template-owned list `title`
- template-owned list item `title`
- template-owned list item `description`

Placeholders are not rendered in:

- item `config`
- numeric fields
- list `kind`
- priority or due offset fields

### 2.3 Save-time validation

When creating or editing a template, backend validates:

- `title` must be non-empty after trim
- variables must be a JSON array
- every placeholder used in template text or template-owned lists must be
  declared in `variables`
- every declared variable must be used somewhere in template text or
  template-owned lists

Important implementation detail:

- template-owned list creation/editing can fail if the list/item introduces a
  placeholder not declared on the template
- template variable edits can fail if existing template-owned lists still depend
  on removed variables

### 2.4 Use-time validation

When manually using a template or attaching it to a schedule/reminder, backend
validates:

- template ownership: template must belong to the connected user
- `template_rev` must match the current template revision
- variables marked `required = true` must be present
- required variables must be non-blank after trim
- optional variables may be omitted or blank and render as `""`
- no unknown variable keys are allowed

## 3) WebSocket Events

### 3.1 `template_create`

Request:

```json
{
  "event": "template_create",
  "data": {
    "title": "Call {{name}}",
    "description": "Follow up with {{name}} tomorrow",
    "category": "Work",
    "tags": ["{{name}}", "followup"],
    "priority": 2,
    "show_before_due_time": 45,
    "due_offset_minutes": 90,
    "variables": [
      { "key": "name", "label": "Contact name", "required": true }
    ],
    "last_modified_at": 1700000000000
  }
}
```

Success:

- same-user broadcast `template_created` with full `TaskTemplate`

Notes:

- blank or missing `category` becomes `"Life"`
- missing `show_before_due_time` becomes `0`
- missing/null `variables` becomes `[]`

### 3.2 `template_edit`

Request:

```json
{
  "event": "template_edit",
  "data": {
    "id": "uuid",
    "title": "Call {{name}}",
    "description": "Follow up with {{name}} tomorrow",
    "category": "Work",
    "tags": ["{{name}}", "followup"],
    "priority": 2,
    "show_before_due_time": 45,
    "due_offset_minutes": 90,
    "variables": [
      { "key": "name", "label": "Contact name", "required": true }
    ],
    "last_modified_at": 1700000000000
  }
}
```

Success:

- same-user broadcast `template_updated` with full `TaskTemplate`

Behavior:

- `id` is required
- edit is a full template update for the listed fields
- omitted `show_before_due_time` resets to `0`
- successful edit increments `rev`

### 3.3 `template_delete`

Request:

```json
{
  "event": "template_delete",
  "data": {
    "id": "uuid"
  }
}
```

Success:

```json
{
  "event": "template_deleted",
  "data": {
    "id": "uuid"
  }
}
```

Behavior:

- template must belong to the current user
- template-owned lists are deleted with the template
- copied tasks are unaffected
- copied schedules remain usable because they already store copied task fields
  and copied schedule-owned lists
- after deletion, schedule `source_template_id` may become `null` on later
  fetches

### 3.4 `template_list`

Request:

```json
{
  "event": "template_list",
  "data": {}
}
```

Success:

```json
{
  "event": "template_list",
  "data": [<TaskTemplate>, ...]
}
```

Behavior:

- response goes only to the requesting session
- results are ordered by `updated_at DESC`, then `created_at DESC`

### 3.5 `template_search`

Request:

```json
{
  "event": "template_search",
  "data": {
    "search_query": "alpha",
    "limit": 20,
    "offset": 0
  }
}
```

Success:

```json
{
  "event": "template_search",
  "data": [<TaskTemplate>, ...]
}
```

Behavior:

- search is title-only, case-insensitive, using `ILIKE`
- a blank/whitespace `search_query` returns all templates
- prefix matches sort ahead of non-prefix matches
- within the same rank, results sort by `last_used_at DESC NULLS LAST`,
  `updated_at DESC`, then `created_at DESC`
- default `limit` is `20`
- default `offset` is `0`
- response returns full `TaskTemplate` objects, not lightweight cards

### 3.6 `task_create_from_template`

Request:

```json
{
  "event": "task_create_from_template",
  "data": {
    "template_use": {
      "template_id": "uuid",
      "template_rev": 3,
      "variables": {
        "name": "Alex"
      }
    },
    "last_modified_at": 1700000000000
  }
}
```

Success:

- same-user broadcast `new_task_created` with a normal `Task`

Behavior:

- the created task is a normal task, not a live template link
- copied task fields come from the rendered template:
  - `title`
  - `description`
  - `category`
  - `tags`
  - `priority`
  - `show_before_due_time`
- if template `due_offset_minutes` is valid, task `due_at` is
  `server_now + due_offset_minutes`
- if template `due_offset_minutes` is null, manual creation leaves `task.due_at`
  unset
- template-owned lists are copied into new task-owned lists
- each copied task list gets a fresh active run
- `last_used_at` is updated on success

### 3.7 `schedule_create` with `template_use`

Only the template-related delta is documented here. Base schedule fields stay as
defined in [`docs/frontend_scheduler_ws_contract_v2.md`](./frontend_scheduler_ws_contract_v2.md).

Request delta:

```json
{
  "event": "schedule_create",
  "data": {
    "kind": "task",
    "title": "",
    "template_use": {
      "template_id": "uuid",
      "template_rev": 3,
      "variables": {
        "topic": "Budget"
      }
    }
  }
}
```

Success:

- same-user broadcast `schedule_created` with full `Schedule`

Behavior:

- `template_use` is allowed only when `kind = "task"`
- `title` is required only when `template_use` is absent
- if both `title` and `template_use` are sent, rendered template title wins
- rendered template fields overwrite request values for:
  - `title`
  - `description`
  - `category`
  - `tags`
  - `priority`
  - `show_before_minutes` (from template `show_before_due_time`)
  - `due_offset_minutes`
  - `source_template_id`
  - `source_template_rev`
  - `source_template_variables`
- schedule-specific fields still come from the request:
  - `tz`
  - `start_local`
  - `rrule`
  - `until_local`
  - `notify_offsets_min`
  - `muted_offsets_min`
  - `common_language`
  - `urgency`
  - all-day and duration fields
- template-owned lists are copied into schedule-owned lists at attach time
- schedule-owned lists created from the template are independent copies
- `last_used_at` is updated on success

### 3.8 `schedule_edit` with `template_use`

Request delta:

```json
{
  "event": "schedule_edit",
  "data": {
    "id": "uuid",
    "title": "",
    "template_use": {
      "template_id": "uuid",
      "template_rev": 4,
      "variables": {
        "topic": "Budget"
      }
    }
  }
}
```

Success:

- same-user broadcast `schedule_updated` with full `Schedule`

Behavior:

- `template_use` is allowed only for existing schedules whose `kind` is `task`
- `title` is required only when `template_use` is absent
- if both `title` and `template_use` are sent, rendered template title wins
- if `template_use` is present:
  - future unmaterialized occurrences are pruned before rewriting the schedule
  - existing materialized tasks/occurrences remain detached
  - current active schedule-owned lists are archived
  - rendered template lists are copied into new schedule-owned lists
  - rendered template fields overwrite the schedule snapshot fields listed in
    `schedule_create`
  - `last_used_at` is updated on success
- if `template_use` is absent:
  - existing copied template fields on the schedule are preserved
  - current API does not support detaching a template or clearing
    `source_template_*` through `schedule_edit`
  - current API also does not expose direct editing of copied
    `description`, `tags`, `priority`, or `due_offset_minutes`

### 3.9 `reminder_submit` with `template_use`

Only the template-related delta is documented here.

Request delta:

```json
{
  "event": "reminder_submit",
  "data": {
    "kind": "task",
    "title": "",
    "timezone": "Europe/Bucharest",
    "schedule": {
      "instant": {
        "label": "today",
        "iso": "2026-03-07T12:00:00+02:00"
      }
    },
    "show_before_minutes": 0,
    "template_use": {
      "template_id": "uuid",
      "template_rev": 3,
      "variables": {
        "name": "Alex"
      }
    }
  }
}
```

Success:

```json
{
  "event": "reminder_submit_response",
  "data": {
    "success": true,
    "schedule": <Schedule>
  }
}
```

Behavior:

- `template_use` is allowed only when `kind = "task"`
- `title` is required only when `template_use` is absent
- the created schedule gets the same copied template snapshot fields and copied
  schedule-owned lists as `schedule_create`
- there is no separate `schedule_created` broadcast from `reminder_submit`;
  `reminder_submit_response` is the only delivery for the schedule
- frontend must merge `data.schedule` from `reminder_submit_response` into its
  local schedule store
- for instant reminders due within about 2 minutes of server time, backend may
  also create the first occurrence and materialize the task immediately during
  the same flow
- when immediate task materialization happens, the event order is:
  `reminder_submit_response` first, then `new_task_created`
- if the dispatcher later emits `notification_created` for that immediate task,
  the notification title is the actual task title (for example `"Call Alex"`)
  rather than the generic `"Reminder"`
- task-kind at-time notifications use a due-now description:
  `Your task '<title>' is due now.`

Important implementation detail:

- unlike the dedicated template handlers, current `reminder_submit`
  validation/errors are returned from the handler instead of being normalized
  into a structured template-specific `connection_error`

## 4) Template-Owned Lists

All generic list definition/item payloads are unchanged. Only the new template
target/owner behavior is documented here.

Reusable target:

```json
{
  "target": {
    "kind": "task_template",
    "id": "uuid"
  }
}
```

Supported events for `target.kind = "task_template"`:

- `lists_fetch`
- `list_create`
- `list_edit`
- `list_delete`
- `list_reorder`
- `list_item_create`
- `list_item_edit`
- `list_item_delete`
- `list_item_reorder`
- `standalone_list_attach`

Success events are the same as the generic list system:

- `lists_target`
- `list_created`
- `list_updated`
- `list_deleted`
- `lists_reordered`
- `list_item_created`
- `list_item_updated`
- `list_item_deleted`
- `list_items_reordered`
- `standalone_list_attached`

Template-specific behavior:

- template-owned lists are editable definitions only
- template-owned lists never create runs
- `run` and `run_items` are always `null` for `task_template` fetches
- successful mutations validate the whole template placeholder graph and then
  increment `TaskTemplate.rev`
- the rev bump does not emit a `template_updated` broadcast; the frontend
  must track staleness locally (see §6.2)
- after any successful template list mutation, previously cached
  `template_rev` values should be treated as stale for future `template_use`

### 4.1 `lists_fetch(target=task_template)`

Request:

```json
{
  "event": "lists_fetch",
  "data": {
    "target": {
      "kind": "task_template",
      "id": "uuid"
    }
  }
}
```

Success:

```json
{
  "event": "lists_target",
  "data": {
    "target": {
      "kind": "task_template",
      "id": "uuid"
    },
    "resolved_from": {
      "template_id": "uuid",
      "schedule_id": null,
      "occurrence_id": null,
      "task_id": null,
      "notification_id": null
    },
    "lists": []
  }
}
```

### 4.2 `standalone_list_attach` to a template

Request:

```json
{
  "event": "standalone_list_attach",
  "data": {
    "list_id": "uuid",
    "target": {
      "kind": "task_template",
      "id": "uuid"
    },
    "position": 0,
    "last_modified_at": 1700000000000
  }
}
```

Success emits two same-user broadcasts:

1. `standalone_list_attached`

```json
{
  "event": "standalone_list_attached",
  "data": {
    "source": {
      "list_id": "uuid"
    },
    "destination": {
      "target": {
        "kind": "task_template",
        "id": "uuid"
      },
      "list_id": "uuid"
    }
  }
}
```

2. `list_created` with the full updated `ListsTargetPayload` for the template

Behavior:

- the standalone list definition and items are copied
- no runs are created
- template validation runs after the copy; if it fails, the attach is rolled
  back

## 5) Copy Semantics And Frontend Rules

- Manual use and schedule attachment are snapshot-based, not live-linked.
- Manual `task_create_from_template` creates a task immediately from the current
  rendered template.
- Schedule attachment copies the rendered template into schedule fields plus
  schedule-owned list definitions.
- Later template edits do not mutate existing copied schedules, copied tasks, or
  already materialized occurrences/tasks.
- Future schedule materialization uses the copied schedule snapshot, not the
  template itself.
- Scheduled tasks use `due_offset_minutes` relative to occurrence time.
- If a schedule-derived task has no `due_offset_minutes`, normal scheduler
  fallback still applies: non-high-frequency schedules default `due_at` to the
  occurrence time, while high-frequency schedules leave `due_at` unset.
- Manual `task_create_from_template` uses `due_offset_minutes` relative to task
  creation time.
- Template variable prompting happens exactly once per manual use or schedule
  attachment. There is no per-occurrence variable prompting.
- Search returns full template rows, so frontend can reuse search results as the
  canonical template store.
- Current implementation does not support manual override fields during
  `task_create_from_template`.
- Current implementation does not support placeholder rendering inside JSON item
  config.
- Current implementation does not support explicit template detachment from a
  schedule once attached.

### 5.1 List copy details

When template-owned lists are copied during `task_create_from_template`,
`schedule_create`, `schedule_edit`, or `standalone_list_attach`:

Copied exactly:

- list `title` (with placeholder rendering applied)
- list `kind`
- list `position`
- item `title` (with placeholder rendering applied)
- item `description` (with placeholder rendering applied)
- item `type`
- item `position`
- item `required`
- item `config` (copied as-is, no placeholder rendering)
- item `parent_item_id` relationships (parent-child nesting preserved)

Not copied:

- runtime state (runs, run items, timer state, note state, completion state)
- `rev` (new copy starts at rev 1)
- `id` values (new UUIDs are generated for the copy)

Run creation on copy:

- task target: one active run created immediately
- occurrence target: one active run created immediately
- schedule target: no run created; future occurrences get their own runs

### 5.2 Schedule edit list replacement

When `schedule_edit` includes `template_use`:

- all existing active schedule-owned lists are **archived** (not deleted)
- archived lists set `is_archived = true` and become read-only
- new template lists are copied as fresh schedule-owned lists
- already-created occurrence runs from the old lists remain untouched
- future occurrences use the new schedule-owned lists

## 6) Frontend State Rules

### 6.1 Fetch and reconnect

- templates are not included in `connected`
- on first navigation to a template surface, fetch via `template_list` or
  `template_search`
- after a WebSocket reconnect, re-issue `template_list` if a template surface
  is visible, and re-issue `lists_fetch(target=task_template)` for any open
  template editor
- `template_list` and `template_search` responses are unicast (requesting
  session only)
- all mutation broadcasts (`template_created`, `template_updated`,
  `template_deleted`) go to all sessions of the same user

### 6.2 Keeping template rev in sync

After any successful template-owned list mutation, the backend increments
`TaskTemplate.rev`. However, the list mutation success broadcast (`list_created`,
`list_item_updated`, etc.) does **not** include a separate `template_updated`
event — the rev bump is silent.

The frontend must track template rev staleness by:

- noting that any successful list mutation against a `task_template` target
  means the cached `rev` is now stale
- refetching the template via `template_list` or `template_search` before
  the next `template_use`, or
- incrementing the local `rev` optimistically by 1 after each successful
  template-owned list mutation

A `template_updated` broadcast is only emitted from `template_edit` (header
changes). It is not emitted from template-owned list mutations.

The frontend should:

- use the latest known `rev` value when constructing `template_use` payloads
- if a `conflict` (409) error occurs during template use, refetch the template
  and its lists before retrying

### 6.3 Optimistic updates

- the frontend may apply optimistic state for template mutations
- on success, replace optimistic state with the authoritative broadcast payload
- on `connection_error`, revert optimistic state
- on `database_error` (500), revert and refetch

### 6.4 Template deletion cleanup

After receiving `template_deleted`:

- remove the template from local store
- close any open template editor targeting that id
- close any open `lists_fetch(target=task_template)` surface for that id
- schedules that referenced the template continue to work; their
  `source_template_id` may become `null` on the next fetch but all copied
  fields remain intact

## 7) Error Contract

Template handlers use the normal `connection_error` envelope:

```json
{
  "event": "connection_error",
  "data": {
    "type": "invalid_data",
    "message": "reason",
    "code": 400
  }
}
```

Template-related error types:

- `invalid_data` / `400`
  - invalid JSON payload
  - missing `title`
  - invalid `variables` array
  - duplicate or invalid variable keys
  - undeclared placeholders
  - unused declared variables
  - missing required / blank required / unknown `template_use.variables`
  - `template_use` used for non-task schedules
  - invalid template list mutation for placeholder validation
- `not_found` / `404`
  - template id does not exist
- `unauthorized` / `403`
  - template belongs to another user
- `conflict` / `409`
  - stale `template_rev` during template use
- `database_error` / `500`
  - unexpected persistence or transaction failure

Frontend expectations:

- on `conflict` during template use, refetch the template and its template-owned
  lists before asking the user to retry
- after any template-owned list mutation success, treat cached `rev` as stale
  (see §6.2); increment locally or refetch via `template_list` before the
  next `template_use`
- after `template_deleted`, close any UI surface that still targets
  `task_template:<id>`
