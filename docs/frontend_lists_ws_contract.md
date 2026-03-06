# Frontend Lists WebSocket Contract

This document is the implementation contract for the lists system added on top
of tasks, schedules, occurrences, and notifications.

This document is the authoritative frontend contract for the lists feature.
Frontend implementation and sync for lists should rely on this file alone,
including list behavior that intersects with schedules, occurrences, tasks, and
notifications.

## 0) Transport, Scope, And Event Inventory

All WebSocket messages use this envelope:

```json
{
  "event": "string",
  "data": {}
}
```

Primitive aliases used below:

```ts
type uuid = string
type timestamp = string
type epoch_millis = number
```

Client -> server list events:

- `lists_fetch`
- `list_create`
- `list_edit`
- `list_delete`
- `list_reorder`
- `list_item_create`
- `list_item_edit`
- `list_item_delete`
- `list_item_reorder`
- `list_run_item_toggle`
- `list_run_item_note_set`
- `list_run_item_timer_start`
- `list_run_item_timer_pause`
- `list_run_item_timer_complete`

Primary server -> client list events:

- `lists_target`
- `list_created`
- `list_updated`
- `list_deleted`
- `lists_reordered`
- `list_item_created`
- `list_item_updated`
- `list_item_deleted`
- `list_items_reordered`
- `list_run_item_updated`
- `list_run_updated`

Related server -> client events that lists can trigger:

- `related_task_deleted`
- `connection_error`

Mutation conventions used throughout this contract:

- every mutation request includes `last_modified_at: epoch_millis`
- frontend should send its client-side mutation timestamp; if the value is missing, zero, or negative, backend normalizes it to server time
- `list_edit` and `list_item_edit` are full-value updates, not sparse patches
- success payloads sent by the server are authoritative and should replace optimistic local state for the affected surface or object

## 1) Mental Model

The backend separates lists into two layers:

- `list definition`: the editable template structure
- `list run`: the live state for one concrete execution of that list

That distinction is the key behavior rule:

- schedule-owned lists are reusable templates
- occurrence/task-linked list runs hold progress
- notifications never own progress; they only point to existing runs

Examples:

- A direct task checklist:
  - the task owns the list definition
  - the task also gets one run immediately
- A recurring reminder checklist:
  - the schedule owns the list definition
  - each planned occurrence gets its own run
- A schedule with `kind="task"`:
  - the occurrence gets the run first
  - when the task is materialized, that same run gains `task_id`

## 2) Ownership Rules

A list definition can belong to exactly one owner:

- `task`
- `schedule`
- `occurrence`

Fetch targets can be:

- `task`
- `schedule`
- `occurrence`
- `notification`

Notification behavior:

- a notification never creates or owns a list
- it resolves list runs through `notification_list_links`
- if links are missing, backend falls back to `payload.list_run_ids`
- if that is also missing, backend falls back to `payload.occurrence_id` and `payload.task_id`
- a notification may resolve to multiple runs across different list definitions
- the `lists_target` response will contain one `ResolvedListBundle` per list definition, each with its own run and run items
- runs are deduplicated and sorted by creation time

## 3) Supported Item Types

V1 supports:

- `checkbox`
- `timer`
- `note`

Constraints:

- nesting is one level only via `parent_item_id`
- `note` items cannot be `required`
- required actionable items are only `checkbox` and `timer`
- a `timer` item must include `config.duration_seconds > 0`

## 4) Core Payload Shapes

### 4.1 Target

```ts
type ListTargetKind = "task" | "schedule" | "occurrence" | "notification"

type ListTargetRef = {
  kind: ListTargetKind
  id: uuid
}
```

### 4.2 Definition

```ts
type ListDefinition = {
  id: uuid
  owner: {
    kind: "task" | "schedule" | "occurrence"
    id: uuid
  }
  position: number
  title: string
  kind: "checklist" | "workflow" | "routine"
  rev: number
  is_archived: boolean
  created_at: timestamp
  updated_at: timestamp
  last_modified_at: number
}
```

### 4.3 Definition Item

```ts
type ListItem = {
  id: uuid
  list_id: uuid
  parent_item_id: uuid | null
  position: number
  type: "checkbox" | "timer" | "note"
  title: string
  description: string | null
  required: boolean
  config: Record<string, unknown>
  created_at: timestamp
  updated_at: timestamp
  last_modified_at: number
}
```

Item config rules:

```ts
type CheckboxConfig = {}
type TimerConfig = { duration_seconds: number }
type NoteConfig = { placeholder?: string }
```

### 4.4 Run

```ts
type ListRun = {
  id: uuid
  list_id: uuid
  source_list_rev: number
  source_schedule_id: uuid | null
  occurrence_id: uuid | null
  task_id: uuid | null
  status: "active" | "completed" | "canceled" | "archived"
  required_total: number
  required_completed: number
  created_at: timestamp
  updated_at: timestamp
  completed_at: timestamp | null
  locked_at: timestamp | null
  last_modified_at: number
}
```

### 4.5 Run Item

Run items are runtime snapshots. The frontend must render progress screens from
these objects, not from the current definition items.

```ts
type ListRunItem = {
  id: uuid
  run_id: uuid
  snapshot: {
    item_id: uuid | null
    parent_item_id: uuid | null
    position: number
    type: "checkbox" | "timer" | "note"
    title: string
    description: string | null
    required: boolean
    config: Record<string, unknown>
  }
  is_completed: boolean
  completed_at: timestamp | null
  timer_state: {
    status: "idle" | "running" | "paused" | "completed"
    duration_seconds: number
    elapsed_seconds: number
    last_started_at: timestamp | null
  } | {}
  note_state: {
    text: string
  } | {}

  // timer_state is the full object for timer items, literal empty JSON object {} otherwise
  // note_state is the full object for note items, literal empty JSON object {} otherwise
  // these fields are never null or omitted — always present as either the typed object or {}
  created_at: timestamp
  updated_at: timestamp
  last_modified_at: number
}
```

Runtime mutation targeting rule:

- request `item_id` means `ListRunItem.snapshot.item_id`
- request `item_id` does not mean `ListRunItem.id`
- if `snapshot.item_id` is `null`, that runtime row is historical/read-only and cannot be mutated

### 4.6 List Kind

The `kind` field on `ListDefinition` accepts `"checklist"`, `"workflow"`, or `"routine"`.

These values are **cosmetic labels only**. They do not affect completion logic, run
creation, item constraints, or any backend behavior. The frontend may use them for
display purposes (icons, section headers, etc.) but should not condition any
functional logic on them.

### 4.7 Broadcast Envelopes

Runtime mutation events use flat envelopes — the payload is the object directly,
not wrapped in a sub-key.

`list_run_item_updated`:

```json
{
  "event": "list_run_item_updated",
  "data": { /* ListRunItem */ }
}
```

`list_run_updated`:

```json
{
  "event": "list_run_updated",
  "data": { /* ListRun */ }
}
```

`related_task_deleted`:

```json
{
  "event": "related_task_deleted",
  "data": {
    "id": "uuid"
  }
}
```

### 4.8 Fetch Response

```ts
type ResolvedListBundle = {
  definition: ListDefinition
  items: ListItem[]
  run: ListRun | null
  run_items: ListRunItem[] | null
}
```

```ts
type ListsTargetPayload = {
  target: ListTargetRef
  resolved_from: {
    schedule_id: uuid | null
    occurrence_id: uuid | null
    task_id: uuid | null
    notification_id: uuid | null
  }
  lists: ResolvedListBundle[]
}
```

## 5) Lifecycle Rules

### 5.1 Task-owned lists

- creating a list on a task creates the definition immediately
- the backend also creates one active run immediately
- editing list items on a direct task list updates the active run snapshot in all active runs
- creating or deleting list items on a direct task list also adds or removes the corresponding run items in all active runs
- the `ListsTargetPayload` returned by template mutations always includes the updated `run` and `run_items`, so the frontend does not need a separate refetch
- completing the task completes and locks all linked runs

### 5.2 Occurrence-owned lists

- used for one-off occurrence-specific lists
- creation also creates one active run immediately
- editing list items on a direct occurrence list updates the active run snapshot while the occurrence stays actionable
- canceling or deleting the occurrence cancels the run
- restoring the occurrence via single edit restores eligible canceled runs to `active`

### 5.3 Schedule-owned lists

- the schedule stores the reusable template
- every planned occurrence gets a fresh run
- existing runs are snapshots and are not mutated by later template edits
- only occurrences created after the edit see the new template state
- already-created occurrences keep their old runs exactly as they were
- deleting a schedule-owned list archives the template and cancels future active runs that already exist for that list
- archived schedule-owned lists are read-only and reject later template mutations
- restoring an occurrence does not reactivate runs whose list definition is archived
- restoring an occurrence via single edit reactivates its canceled runs only when the underlying list definition is still active

### 5.4 `schedule(kind="task")`

The backend keeps one run per occurrence and later attaches it to the task:

1. planner creates or refreshes the occurrence
2. schedule-owned lists create occurrence runs
3. task materialization creates or updates the task row
4. those same runs keep `occurrence_id` and gain `task_id`

This is not a handoff. The run stays linked to the occurrence and also becomes
linked to the task.

### 5.5 Notifications

Notifications do not hold checklist state. They only point at already-existing
runs.

Reminder notification payloads now include:

```ts
type NotificationPayloadExtra = {
  list_run_ids?: uuid[]
  open_required_list_count?: number
}
```

`open_required_list_count` means the number of active list runs that still have at
least one incomplete required actionable item.

The same enrichment is applied to due-task notifications.

### 5.6 Frozen Owners

Closed owners are frozen.

- completed task owners are read-only
- canceled occurrence owners are read-only
- deleted occurrence owners are read-only

That means these template mutation events must be rejected for frozen owners:

- `list_create`
- `list_edit`
- `list_delete`
- `list_reorder`
- `list_item_create`
- `list_item_edit`
- `list_item_delete`
- `list_item_reorder`

Revision rule:

- every successful template mutation increments `ListDefinition.rev`
- this includes list header changes and item create/edit/delete/reorder
- new runs snapshot the current `rev` into `source_list_rev`

## 6) Completion Rules

A task cannot be completed if any required actionable item remains incomplete in
an active linked run.

Blocking item types:

- `checkbox`
- `timer`

Non-blocking item types:

- `note`

If a user sends `task_completed` while blockers exist:

- backend rejects the request
- websocket emits `connection_error`
- error type is `task_blocked_by_list`
- HTTP-like code is `409`

When all required actionable items across active runs are complete:

- runtime item mutations may auto-complete the task
- backend emits `list_run_updated` for every run linked to the task (all runs move to `status: "completed"`)
- backend then emits `related_task_deleted`

Event sequence for auto-completion (exact order):

1. `list_run_item_updated` — the item that just changed
2. `list_run_updated` — the run whose progress was recomputed
3. if auto-completion triggers:
   a. `list_run_updated` — for each run linked to the task (status becomes `"completed"`)
   b. `related_task_deleted` — signals the task was completed

`related_task_deleted` naming note:

Despite the name, this event means the task was **completed** and should be removed
from the active/incomplete task list. The task is not deleted from the database. The
frontend should treat this identically to receiving a task completion event — remove
the task from any active task views.

## 7) Fetch Flow

The frontend must explicitly fetch lists for the current surface.

`connected` does not include lists.

### Request

```json
{
  "event": "lists_fetch",
  "data": {
    "target": {
      "kind": "task",
      "id": "uuid"
    }
  }
}
```

### Success

```json
{
  "event": "lists_target",
  "data": {
    "target": { "kind": "task", "id": "uuid" },
    "resolved_from": {
      "schedule_id": null,
      "occurrence_id": null,
      "task_id": "uuid",
      "notification_id": null
    },
    "lists": []
  }
}
```

Schedule fetch behavior:

- `lists_fetch(target=schedule)` returns non-archived schedule-owned definitions only
- each bundle has `run = null`
- each bundle has `run_items = null`

Runtime fetch behavior:

- `lists_fetch(target=task|occurrence|notification)` returns resolved runs
- each bundle includes `run`
- each bundle includes `run_items`
- runtime bundles may still include `definition.is_archived = true` for historical runs that outlived a later schedule template archive

Delivery behavior:

- `lists_fetch` reply is sent only to the requesting session as `lists_target`
- all other success broadcasts (template mutations, runtime mutations) are sent to all sessions for the same user, including the issuing session
- `related_task_deleted` emitted from list-driven task auto-completion is also broadcast to all sessions for the same user, including the issuing session

Reconnection behavior:

- the `connected` event does not include any list state
- after a WebSocket reconnect, the frontend must re-issue `lists_fetch` for every currently visible surface (task, schedule, occurrence, or notification) to restore list state

## 8) Template Mutation Events

All template mutations use the common websocket envelope:

```json
{
  "event": "event_name",
  "data": {}
}
```

### 8.1 `list_create`

```json
{
  "event": "list_create",
  "data": {
    "target": { "kind": "task", "id": "uuid" },
    "position": 0,
    "title": "Ship feature",
    "kind": "workflow",
    "last_modified_at": 1700000000000
  }
}
```

Success broadcast: `list_created`

Payload: full `ListsTargetPayload` for the owner target.

### 8.2 `list_edit`

```json
{
  "event": "list_edit",
  "data": {
    "id": "uuid",
    "title": "Updated title",
    "kind": "workflow",
    "last_modified_at": 1700000000001
  }
}
```

Success broadcast: `list_updated`

Payload: full `ListsTargetPayload` for the owner target.

### 8.3 `list_delete`

```json
{
  "event": "list_delete",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000002
  }
}
```

Success broadcast: `list_deleted`

Payload: full `ListsTargetPayload` for the owner target.

Behavior:

- direct task and direct occurrence lists are deleted
- schedule-owned lists are archived so history stays valid

### 8.4 `list_reorder`

```json
{
  "event": "list_reorder",
  "data": {
    "id": "uuid",
    "position": 1,
    "last_modified_at": 1700000000003
  }
}
```

Success broadcast: `lists_reordered`

Payload: full `ListsTargetPayload` for the owner target.

### 8.5 `list_item_create`

```json
{
  "event": "list_item_create",
  "data": {
    "list_id": "uuid",
    "parent_item_id": null,
    "position": 0,
    "item_type": "timer",
    "title": "QA pass",
    "description": null,
    "required": true,
    "config": { "duration_seconds": 900 },
    "last_modified_at": 1700000000004
  }
}
```

Success broadcast: `list_item_created`

Payload: full `ListsTargetPayload` for the owner target.

### 8.6 `list_item_edit`

```json
{
  "event": "list_item_edit",
  "data": {
    "id": "uuid",
    "list_id": "uuid",
    "parent_item_id": null,
    "position": 0,
    "item_type": "checkbox",
    "title": "Updated step",
    "description": null,
    "required": true,
    "config": {},
    "last_modified_at": 1700000000005
  }
}
```

Success broadcast: `list_item_updated`

Payload: full `ListsTargetPayload` for the owner target.

`list_item_edit` is a full-value update. The `position` field sets the item's
position as part of the edit. To reorder without changing other fields, use
`list_item_reorder` instead.

Direct-owner sync: for task-owned and occurrence-owned lists, editing an item also
updates the corresponding snapshot in all active run items. If the item type or
timer config changes, the runtime state for that item resets to defaults.

### 8.7 `list_item_delete`

```json
{
  "event": "list_item_delete",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000006
  }
}
```

`list_id` is not required — backend resolves the parent list from the item id.

Deleting an item also deletes its entire subtree (all children).

For task-owned and occurrence-owned lists, the corresponding run items are also
removed from all active runs.

Success broadcast: `list_item_deleted`

Payload: full `ListsTargetPayload` for the owner target.

### 8.8 `list_item_reorder`

```json
{
  "event": "list_item_reorder",
  "data": {
    "id": "uuid",
    "list_id": "uuid",
    "position": 2,
    "last_modified_at": 1700000000007
  }
}
```

Success broadcast: `list_items_reordered`

Payload: full `ListsTargetPayload` for the owner target.

## 9) Runtime Mutation Events

For every runtime event below:

- `item_id` must be the definition item id from `ListRunItem.snapshot.item_id`
- do not send `ListRunItem.id`

### 9.1 `list_run_item_toggle`

Only valid for `checkbox` items.

```json
{
  "event": "list_run_item_toggle",
  "data": {
    "run_id": "uuid",
    "item_id": "uuid",
    "last_modified_at": 1700000000010
  }
}
```

Success broadcasts:

- `list_run_item_updated`
- `list_run_updated`

Payloads:

- `list_run_item_updated`: `ListRunItem`
- `list_run_updated`: `ListRun`

If this finishes the last required blocker for the linked task, backend may also
broadcast:

- `related_task_deleted`

Payload:

```ts
type RelatedTaskDeletedPayload = {
  id: uuid
}
```

### 9.2 `list_run_item_note_set`

Only valid for `note` items.

```json
{
  "event": "list_run_item_note_set",
  "data": {
    "run_id": "uuid",
    "item_id": "uuid",
    "text": "Pack charger too",
    "last_modified_at": 1700000000011
  }
}
```

Success broadcast:

- `list_run_item_updated`

Payload:

- `list_run_item_updated`: `ListRunItem`

### 9.3 `list_run_item_timer_start`

Only valid for `timer` items.

```json
{
  "event": "list_run_item_timer_start",
  "data": {
    "run_id": "uuid",
    "item_id": "uuid",
    "last_modified_at": 1700000000012
  }
}
```

Success broadcast:

- `list_run_item_updated`

Payload:

- `list_run_item_updated`: `ListRunItem`

### 9.4 `list_run_item_timer_pause`

Only valid for `timer` items.

```json
{
  "event": "list_run_item_timer_pause",
  "data": {
    "run_id": "uuid",
    "item_id": "uuid",
    "last_modified_at": 1700000000013
  }
}
```

Success broadcast:

- `list_run_item_updated`

Payload:

- `list_run_item_updated`: `ListRunItem`

### 9.5 `list_run_item_timer_complete`

Only valid for `timer` items.

```json
{
  "event": "list_run_item_timer_complete",
  "data": {
    "run_id": "uuid",
    "item_id": "uuid",
    "last_modified_at": 1700000000014
  }
}
```

Success broadcasts:

- `list_run_item_updated`
- `list_run_updated`

Payloads:

- `list_run_item_updated`: `ListRunItem`
- `list_run_updated`: `ListRun`

If this finishes the last required blocker for the linked task, backend may also
broadcast:

- `related_task_deleted`

Payload:

```ts
type RelatedTaskDeletedPayload = {
  id: uuid
}
```

## 10) Error Contract

All list failures use the standard error envelope:

```json
{
  "event": "connection_error",
  "data": {
    "type": "string",
    "message": "string",
    "code": 400
  }
}
```

Generic error types that list handlers may emit:

- `invalid_data`
- `not_found`
- `unauthorized`
- `database_error`

List-specific error types:

- `invalid_list_target`
- `invalid_list_item_type`
- `list_run_locked`
- `list_owner_locked`
- `task_blocked_by_list`

Common cases:

- `task_blocked_by_list` with `409`:
  - task completion attempted while required list items remain incomplete
- `list_run_locked` with `409`:
  - runtime mutation attempted on `completed` or `canceled` run
- `invalid_list_item_type` with `400`:
  - event does not match item type
- `invalid_list_target` with `400`:
  - unsupported target kind or invalid resolution
- `list_owner_locked` with `409`:
  - template mutation attempted against completed task, non-planned occurrence, or archived list
- `invalid_data` with `400`:
  - malformed request payload, missing required fields, invalid nesting, or invalid type-specific config
- `not_found` with `404`:
  - target, list, run item, or list item/list pairing no longer exists for the requested mutation
- `unauthorized` with `403`:
  - the target list/run belongs to another user
- `database_error` with `500`:
  - unexpected server-side failure after validation

Frontend recovery rule:

- treat `database_error` as no local state change being confirmed by the server
- if local optimistic state was applied, revert it and refetch the current `lists_fetch(target=...)` surface

## 11) Frontend State Rules

- fetch lists on demand per visible task, schedule, occurrence, or notification
- schedule management screens should render from `items`
- task/occurrence/notification runtime screens should render from `run_items`
- treat `completed` and `canceled` runs as read-only
- if a task is completed, disable list mutations immediately in the UI
- notifications may resolve to multiple list runs
- list order is `position ASC`, then creation time

Position semantics:

- `position` values are zero-indexed integers
- positions may be sparse (not necessarily contiguous)
- when reordering, the backend sets the target item's position to the requested value; sibling positions are not normalized
- the frontend should sort by `position ASC` and use `created_at` as tiebreaker

`last_modified_at` in responses:

- `last_modified_at` values in server responses reflect the client-provided value (or server time if the client sent zero/negative)
- the frontend should store and re-send the latest `last_modified_at` it has for each surface when issuing mutations

Optimistic updates:

- the frontend may apply optimistic local state for any mutation
- on success, replace optimistic state with the authoritative server payload
- on `connection_error`, revert optimistic state and refetch via `lists_fetch` for the affected surface
- `database_error` (500) means the server confirmed no state change — revert and refetch

## 12) Example User Flows

### Task with multiple steps

- create task
- create one or more task-owned lists
- each list gets one active run immediately
- as user checks required items, run progress updates
- once all required blockers are done, task can complete

### Recurring reminder checklist

- create a schedule-owned list on the reminder schedule
- planner creates future occurrences
- each occurrence gets a fresh run
- notification payload contains the run ids for that occurrence
- opening the notification should fetch `lists_fetch(target=notification)`

### Recurring task schedule

- attach list to `schedule(kind="task")`
- planner creates occurrence
- occurrence gets run
- task materialization links the same run to `task_id`
- frontend can reach the same checklist from task, occurrence, or notification
