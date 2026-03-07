# Frontend Standalone Lists WebSocket Contract

This document defines the contract for standalone lists: lists that can exist
without being owned by a task, schedule, occurrence, or notification.

This is a separate feature contract. It is self-contained for frontend
implementation of:

- the standalone lists home surface
- standalone list editing and runtime interaction
- attaching a standalone list to a task, schedule, or occurrence

## 0) Transport, Scope, And Event Inventory

All WebSocket messages use this envelope:

```json
{
  "event": "string",
  "data": {}
}
```

Primitive aliases:

```ts
type uuid = string
type timestamp = string
type epoch_millis = number
```

Client -> server events used by standalone lists:

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
- `standalone_list_attach`

Primary server -> client events:

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
- `standalone_list_attached`
- `connection_error`

Mutation conventions:

- every mutation request includes `last_modified_at: epoch_millis`
- if `last_modified_at` is missing, zero, or negative, backend normalizes it to server time
- `list_edit` and `list_item_edit` are full-value updates, not sparse patches
- success payloads sent by the server are authoritative and should replace optimistic local state for the affected surface or object

## 1) Mental Model

Standalone lists are personal lists owned directly by the user.

They use the same two-layer model as attached lists:

- `list definition`: the editable structure
- `list run`: the live state for one execution of that structure

For standalone lists, there is exactly one active run per list.

That means:

- a standalone list can exist by itself with no related task, schedule, occurrence, or notification
- users can check items, run timers, and write notes directly on the standalone list
- the standalone list has persistent live progress
- standalone lists do not auto-complete tasks and do not participate in reminder scheduling

Examples:

- a grocery checklist
- a travel packing list
- a weekly review checklist
- a reusable routine the user wants to keep outside the scheduler

## 2) Ownership And Attachment Rules

### 2.1 Standalone ownership

A standalone list definition is owned by the user, not by another domain entity.

It is not related to:

- `task`
- `schedule`
- `occurrence`
- `notification`

### 2.2 Attachment rule

A standalone list can later be attached to:

- `task`
- `schedule`
- `occurrence`

Attachment is always a copy, never a move or reparent.

That means:

- the original standalone list remains standalone
- the attached list becomes a new independent list definition under the target
- later edits to the standalone source do not affect the attached copy
- later edits to the attached copy do not affect the standalone source
- item runtime state is not shared between the source standalone list and the attached copy

Notifications are never valid attachment targets.

### 2.3 Why attachment is copy-only

The attached-list system already assumes one owner per list definition and
per-target runtime semantics. Copying preserves that model and avoids sharing
runtime progress between:

- a user’s personal standalone list
- a task checklist
- a recurring schedule template
- an occurrence-specific checklist

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

### 4.1 Targets

Standalone lists introduce a new fetch/create surface:

```ts
type StandaloneHomeTarget = {
  kind: "standalone_home"
}

type AttachedTargetRef = {
  kind: "task" | "schedule" | "occurrence" | "notification"
  id: uuid
}

type AttachTargetRef = {
  kind: "task" | "schedule" | "occurrence"
  id: uuid
}

type ListTargetRef = StandaloneHomeTarget | AttachedTargetRef
```

### 4.2 Owner

```ts
type StandaloneListOwner = {
  kind: "standalone"
  user_id: uuid
}

type AttachedListOwner = {
  kind: "task" | "schedule" | "occurrence"
  id: uuid
}

type ListOwnerRef = StandaloneListOwner | AttachedListOwner
```

### 4.3 Definition

```ts
type ListDefinition = {
  id: uuid
  owner: ListOwnerRef
  position: number
  title: string
  kind: "checklist" | "workflow" | "routine"
  rev: number
  is_archived: boolean
  created_at: timestamp
  updated_at: timestamp
  last_modified_at: epoch_millis
}
```

Standalone definition rules:

- `owner.kind = "standalone"`
- `owner.user_id` is the current user id
- `is_archived` is always `false` in V1 standalone surfaces

### 4.4 Definition Item

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
  last_modified_at: epoch_millis
}
```

Item config rules:

```ts
type CheckboxConfig = {}
type TimerConfig = { duration_seconds: number }
type NoteConfig = { placeholder?: string }
```

### 4.5 Run

Standalone lists always have one active run.

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
  last_modified_at: epoch_millis
}
```

Standalone run rules:

- `source_schedule_id = null`
- `occurrence_id = null`
- `task_id = null`
- `status = "active"` unless the list is being deleted
- `completed_at = null`
- `locked_at = null`

### 4.6 Run Item

Runtime screens must render from run items, not directly from definition items.

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
  created_at: timestamp
  updated_at: timestamp
  last_modified_at: epoch_millis
}
```

Runtime targeting rule:

- request `item_id` always means `ListRunItem.snapshot.item_id`
- request `item_id` never means `ListRunItem.id`
- if `snapshot.item_id = null`, the runtime row is historical/read-only and cannot be mutated

### 4.7 Standalone Bundle

For standalone lists, `run` and `run_items` are always present.

```ts
type StandaloneListBundle = {
  definition: ListDefinition
  items: ListItem[]
  run: ListRun
  run_items: ListRunItem[]
}
```

### 4.8 Fetch Response

```ts
type StandaloneListsTargetPayload = {
  target: {
    kind: "standalone_home"
  }
  resolved_from: {
    schedule_id: null
    occurrence_id: null
    task_id: null
    notification_id: null
  }
  lists: StandaloneListBundle[]
}
```

### 4.9 Attach Success Payload

```ts
type StandaloneListAttachedPayload = {
  source: {
    list_id: uuid
  }
  destination: {
    target: AttachTargetRef
    list_id: uuid
  }
}
```

### 4.10 Destination Target Refresh Payload

The attach flow also emits the normal destination-target refresh payload used by
attached lists.

```ts
type AttachedListBundle = {
  definition: ListDefinition
  items: ListItem[]
  run: ListRun | null
  run_items: ListRunItem[] | null
}

type AttachedListsTargetPayload = {
  target: {
    kind: "task" | "schedule" | "occurrence"
    id: uuid
  }
  resolved_from: {
    schedule_id: uuid | null
    occurrence_id: uuid | null
    task_id: uuid | null
    notification_id: uuid | null
  }
  lists: AttachedListBundle[]
}
```

Destination payload rules:

- `target.kind = "schedule"` returns definition bundles with `run = null` and `run_items = null`
- `target.kind = "task"` or `target.kind = "occurrence"` returns runtime bundles with both fields populated

## 5) Lifecycle Rules

### 5.1 Create

Creating a standalone list does all of this immediately:

- creates the standalone list definition
- creates one active run
- snapshots all current definition items into run items

An empty standalone list is valid. It starts with:

- `items = []`
- `run.required_total = 0`
- `run.required_completed = 0`

### 5.2 Edit

Editing a standalone list header:

- updates the definition
- increments `rev`
- does not recreate the run

Editing standalone list items:

- updates the definition item
- updates the active run item snapshot
- increments `rev`

Runtime reset behavior:

- changing item type resets runtime state for that item
- changing a timer’s `config.duration_seconds` resets runtime state for that item
- simple text/position/required/description updates do not recreate the run

### 5.3 Add Or Delete Items

Creating a standalone list item:

- adds the definition item
- adds a corresponding unchecked/inactive run item to the active run
- increments `rev`

Deleting a standalone list item:

- deletes the definition item
- deletes the corresponding run item
- if the deleted item is a parent, all descendants are deleted too
- increments `rev`

### 5.4 Reorder

Reordering:

- updates the definition position
- updates the active run item snapshot position
- increments `rev`

### 5.5 Delete

Standalone list deletion is a hard delete in V1.

Deleting a standalone list removes:

- the list definition
- its items
- its single active run
- its run items

There is no archive/restore flow for standalone lists in V1.

### 5.6 Completion Semantics

Standalone lists never auto-complete a task because no task is linked.

That means:

- required items are still tracked in `required_total` and `required_completed`
- runtime progress still updates exactly like attached lists
- no `related_task_deleted` event is emitted from standalone runtime changes

### 5.7 Frozen State

Standalone lists are not frozen by task completion or occurrence cancelation
because they are not owned by tasks or occurrences.

In normal standalone usage:

- definition mutations remain allowed until the list is deleted
- runtime mutations remain allowed while the standalone list exists
- `list_run_locked` is not expected in normal standalone flows

## 6) Fetch Flow

The frontend must explicitly fetch standalone lists.

`connected` does not include standalone lists.

### Request

```json
{
  "event": "lists_fetch",
  "data": {
    "target": {
      "kind": "standalone_home"
    }
  }
}
```

### Success

```json
{
  "event": "lists_target",
  "data": {
    "target": {
      "kind": "standalone_home"
    },
    "resolved_from": {
      "schedule_id": null,
      "occurrence_id": null,
      "task_id": null,
      "notification_id": null
    },
    "lists": []
  }
}
```

Fetch behavior:

- returns every standalone list for the current user
- every returned bundle includes `run`
- every returned bundle includes `run_items`
- list order is `position ASC`, then creation time

Delivery behavior:

- `lists_fetch(target=standalone_home)` replies only to the requesting session as `lists_target`
- standalone list success broadcasts are sent to all sessions for the same user, including the issuing session

Reconnect rule:

- after a reconnect, the frontend must re-issue `lists_fetch(target=standalone_home)` if the standalone lists surface is visible

## 7) Mutation Events

Standalone lists reuse the existing list mutation events with the new
`target.kind = "standalone_home"` surface.

All template mutations return full `StandaloneListsTargetPayload` on success.

### 7.1 `list_create`

```json
{
  "event": "list_create",
  "data": {
    "target": { "kind": "standalone_home" },
    "position": 0,
    "title": "Packing list",
    "kind": "checklist",
    "last_modified_at": 1700000000000
  }
}
```

Fields:

- `target`: required — must be `{ "kind": "standalone_home" }`
- `position`: required — int32
- `title`: required — non-empty string after trimming
- `kind`: optional — `"checklist"` | `"workflow"` | `"routine"` (defaults to `"checklist"`)
- `last_modified_at`: required — epoch_millis

`list_create` does not accept an `items` array. To populate a new list, send
`list_item_create` events after the list is created.

Success broadcast: `list_created`

### 7.2 `list_edit`

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

Fields:

- `id`: required — uuid of the list to edit
- `title`: required — non-empty string after trimming
- `kind`: optional — `"checklist"` | `"workflow"` | `"routine"` (keeps existing if omitted)
- `last_modified_at`: required — epoch_millis

This is a full-value update, not a sparse patch.

Success broadcast: `list_updated`

### 7.3 `list_delete`

```json
{
  "event": "list_delete",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000002
  }
}
```

Fields:

- `id`: required — uuid of the list to delete
- `last_modified_at`: required — epoch_millis

Success broadcast: `list_deleted`

### 7.4 `list_reorder`

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

Fields:

- `id`: required — uuid of the list to reorder
- `position`: required — int32 new position
- `last_modified_at`: required — epoch_millis

Success broadcast: `lists_reordered`

### 7.5 `list_item_create`

```json
{
  "event": "list_item_create",
  "data": {
    "list_id": "uuid",
    "parent_item_id": null,
    "position": 0,
    "item_type": "timer",
    "title": "Warm up",
    "description": null,
    "required": true,
    "config": { "duration_seconds": 300 },
    "last_modified_at": 1700000000004
  }
}
```

Fields:

- `list_id`: required — uuid of the parent list
- `parent_item_id`: optional — uuid of parent item for nesting (one level only), or `null`
- `position`: required — int32
- `item_type`: required — `"checkbox"` | `"timer"` | `"note"`
- `title`: required — non-empty string after trimming
- `description`: optional — string or `null`
- `required`: required — boolean (`note` items must be `false`)
- `config`: required — JSON object matching the item type (see §3)
- `last_modified_at`: required — epoch_millis

Success broadcast: `list_item_created`

### 7.6 `list_item_edit`

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

Fields:

- `id`: required — uuid of the item to edit
- `list_id`: required — uuid of the parent list
- `parent_item_id`: optional — uuid or `null`
- `position`: required — int32
- `item_type`: required — `"checkbox"` | `"timer"` | `"note"`
- `title`: required — non-empty string after trimming
- `description`: optional — string or `null`
- `required`: required — boolean
- `config`: required — JSON object matching the item type
- `last_modified_at`: required — epoch_millis

This is a full-value update. The `position` field sets the item's position as
part of the edit. To reorder without changing other fields, use
`list_item_reorder` instead.

Runtime reset behavior: editing an item also updates the corresponding run item
snapshot. If the item type or timer `config.duration_seconds` changes, the
runtime state for that item resets to defaults (timer resets to idle with zero
elapsed, note resets to empty text). Simple text, position, required, or
description changes do not reset runtime state.

Success broadcast: `list_item_updated`

### 7.7 `list_item_delete`

```json
{
  "event": "list_item_delete",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000006
  }
}
```

Fields:

- `id`: required — uuid of the item to delete
- `last_modified_at`: required — epoch_millis

`list_id` is not required — backend resolves the parent list from the item id.
Deleting an item also deletes its entire subtree (all children) and the
corresponding run items.

Success broadcast: `list_item_deleted`

### 7.8 `list_item_reorder`

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

Fields:

- `id`: required — uuid of the item to reorder
- `list_id`: required — uuid of the parent list
- `position`: required — int32 new position
- `last_modified_at`: required — epoch_millis

Success broadcast: `list_items_reordered`

## 8) Runtime Mutation Events

For every runtime event below:

- `item_id` must be the definition item id from `ListRunItem.snapshot.item_id`
- do not send `ListRunItem.id`
- if `snapshot.item_id` is `null`, the row is historical/read-only and cannot be mutated

### 8.1 `list_run_item_toggle`

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

Fields:

- `run_id`: required — uuid of the list run
- `item_id`: required — uuid (definition item id, not run item id)
- `last_modified_at`: required — epoch_millis

Success broadcasts:

- `list_run_item_updated`: `ListRunItem`
- `list_run_updated`: `ListRun`

### 8.2 `list_run_item_note_set`

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

Fields:

- `run_id`: required — uuid of the list run
- `item_id`: required — uuid (definition item id, not run item id)
- `text`: required — string
- `last_modified_at`: required — epoch_millis

Success broadcast:

- `list_run_item_updated`: `ListRunItem`

Note: `list_run_item_note_set` does not emit `list_run_updated` because notes
do not affect run progress.

### 8.3 `list_run_item_timer_start`

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

Fields:

- `run_id`: required — uuid of the list run
- `item_id`: required — uuid (definition item id, not run item id)
- `last_modified_at`: required — epoch_millis

Success broadcast:

- `list_run_item_updated`: `ListRunItem`

### 8.4 `list_run_item_timer_pause`

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

Fields:

- `run_id`: required — uuid of the list run
- `item_id`: required — uuid (definition item id, not run item id)
- `last_modified_at`: required — epoch_millis

Success broadcast:

- `list_run_item_updated`: `ListRunItem`

### 8.5 `list_run_item_timer_complete`

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

Fields:

- `run_id`: required — uuid of the list run
- `item_id`: required — uuid (definition item id, not run item id)
- `last_modified_at`: required — epoch_millis

Success broadcasts:

- `list_run_item_updated`: `ListRunItem`
- `list_run_updated`: `ListRun`

### 8.6 Standalone runtime differences

- standalone runtime events never emit `related_task_deleted`
- standalone runtime events never change task, schedule, or occurrence state
- standalone runtime events never trigger task auto-completion

## 9) Attach Flow

Attaching a standalone list creates an independent attached copy.

### Request

```json
{
  "event": "standalone_list_attach",
  "data": {
    "list_id": "uuid",
    "target": {
      "kind": "task",
      "id": "uuid"
    },
    "position": 0,
    "last_modified_at": 1700000000100
  }
}
```

Request rules:

- `list_id` must reference a standalone list owned by the current user
- `target.kind` must be `task`, `schedule`, or `occurrence`
- `target.kind = "notification"` is invalid
- completed task targets are invalid
- canceled or deleted occurrence targets are invalid
- the source standalone list remains unchanged after attach

### Backend attach behavior

When attaching to a `task`:

- create a new task-owned list definition by copying the standalone title, kind, and items
- create one active run immediately for the new task-owned copy

When attaching to an `occurrence`:

- create a new occurrence-owned list definition by copying the standalone title, kind, and items
- create one active run immediately for the new occurrence-owned copy

When attaching to a `schedule`:

- create a new schedule-owned list definition by copying the standalone title, kind, and items
- do not create a direct run at attach time
- future planned occurrences get their own runs according to the attached-list scheduler rules

### Success broadcasts

The backend emits both:

- `standalone_list_attached`
- `list_created`

Payloads:

- `standalone_list_attached`: `StandaloneListAttachedPayload`
- `list_created`: `AttachedListsTargetPayload`

Source-surface behavior:

- the standalone home surface does not need to refetch after attach because the source list remains unchanged

### Example success

```json
{
  "event": "standalone_list_attached",
  "data": {
    "source": {
      "list_id": "standalone-list-1"
    },
    "destination": {
      "target": {
        "kind": "task",
        "id": "task-1"
      },
      "list_id": "task-list-55"
    }
  }
}
```

## 10) Error Contract

All errors use the standard envelope:

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

Generic error types that may be emitted:

- `invalid_data`
- `not_found`
- `unauthorized`
- `database_error`

List-specific error types reused by standalone lists:

- `invalid_list_target`
- `invalid_list_item_type`
- `list_run_locked`
- `list_owner_locked`

Attach-specific validation behavior:

- invalid attach target kind -> `invalid_list_target` with `400`
- source list not found -> `not_found` with `404`
- source list belongs to another user -> `unauthorized` with `403`
- completed task target or non-actionable occurrence target -> `list_owner_locked` with `409`
- malformed payload or invalid item shape -> `invalid_data` with `400`

Frontend recovery rule:

- treat `database_error` as no local state change being confirmed by the server
- if local optimistic state was applied, revert it and refetch the relevant surface

## 11) Delivery Semantics

### 11.1 Fetch replies

- `lists_fetch(target=standalone_home)` replies only to the requesting session as `lists_target`

### 11.2 Template mutation broadcasts

All template mutation success events (`list_created`, `list_updated`,
`list_deleted`, `lists_reordered`, `list_item_created`, `list_item_updated`,
`list_item_deleted`, `list_items_reordered`) are broadcast to all sessions for
the same user, including the issuing session.

### 11.3 Runtime mutation broadcasts

All runtime mutation success events (`list_run_item_updated`,
`list_run_updated`) are broadcast to all sessions for the same user, including
the issuing session.

### 11.4 Attach broadcasts

Both `standalone_list_attached` and the destination `list_created` are broadcast
to all sessions for the same user.

## 12) Position Semantics

- `position` values are zero-indexed int32 integers
- positions may be sparse (not necessarily contiguous)
- when reordering, the backend sets the target item's position to the requested value; sibling positions are not normalized
- the frontend should sort by `position ASC` and use `created_at` as tiebreaker
- `list_reorder` and `list_item_reorder` move a single item to a new position; they do not accept an ordered array

## 13) Timer Tick Behavior

The server does not push periodic timer updates. Timer elapsed time is
client-computed between user actions.

When a timer is running (`timer_state.status = "running"`):

- `timer_state.last_started_at` is set to the server timestamp when the timer was started
- `timer_state.elapsed_seconds` reflects accumulated time from previous start/pause cycles only
- the frontend must compute current elapsed locally: `elapsed_seconds + (now - last_started_at)`
- the server only updates `elapsed_seconds` when the user pauses or completes

When a timer is paused or idle:

- `last_started_at` is `null`
- `elapsed_seconds` reflects total accumulated time so far

When a timer is completed:

- `elapsed_seconds` is set to at least `duration_seconds`
- the item is marked as completed

## 14) Conflict Resolution

The backend uses last-write-wins semantics.

- `last_modified_at` is stored as provided by the client
- the backend does not validate `last_modified_at` against the current database value
- the backend does not reject stale timestamps
- if the client sends `last_modified_at <= 0`, the backend normalizes it to server time
- there is no optimistic locking or version-based conflict rejection

For multi-session scenarios:

- if two sessions edit the same list concurrently, both succeed
- the later write overwrites the earlier one
- both sessions receive the broadcast with the final state

## 15) Reset And Clear-Progress

V1 does not include an explicit reset-all-progress endpoint for standalone lists.

Runtime state resets occur only as side effects of definition edits:

- changing an item's `item_type` resets its runtime state (timer back to idle, note back to empty)
- changing a timer's `config.duration_seconds` resets its timer state
- checkbox completion state is not reset by definition edits

To manually clear all progress on a standalone list, the user must individually
toggle checked items or delete and recreate the list.

## 16) Frontend State Rules

- fetch standalone lists on demand when the standalone home surface is shown
- render standalone list editing and runtime from the same bundle:
  - definition editor uses `items`
  - checklist runtime uses `run_items`
- do not expect standalone lists in `connected`
- treat standalone list success payloads as full-surface replacement data for `standalone_home`
- runtime mutation payloads (`list_run_item_updated`, `list_run_updated`) are single-object updates, not full-surface replacements — merge them into local state by id
- use `run.required_total` and `run.required_completed` for progress badges
- use `position ASC`, then `created_at` as tiebreaker for stable rendering
- if attach succeeds, update the destination surface from the emitted `list_created` payload

Optimistic updates:

- the frontend may apply optimistic local state for any mutation
- on success, replace optimistic state with the authoritative server payload
- template mutation success payloads are full `StandaloneListsTargetPayload` — replace entire standalone surface state
- runtime mutation success payloads are individual objects — merge by id
- on `connection_error`, revert optimistic state and refetch via `lists_fetch(target=standalone_home)`
- `database_error` (500) means the server confirmed no state change — revert and refetch

Recommended client store indexes:

```ts
type StandaloneListsStore = {
  standaloneListIDs: uuid[]
  definitionsById: Record<uuid, ListDefinition>
  itemsById: Record<uuid, ListItem>
  runsById: Record<uuid, ListRun>
  runItemsByKey: Record<`${uuid}:${uuid}`, ListRunItem>
}
```

## 17) Example Flows

### Packing list

1. user opens standalone lists home
2. frontend sends `lists_fetch(target=standalone_home)`
3. user creates `Packing list`
4. backend emits `list_created` with full standalone home payload
5. user checks items directly in the standalone run

### Reusable checklist copied into a task

1. user has a standalone list called `Release checklist`
2. user creates or opens a task
3. user sends `standalone_list_attach` with that task target
4. backend creates a new task-owned attached copy
5. backend emits:
   - `standalone_list_attached`
   - `list_created` for the task target
6. later changes to the standalone source do not affect the task copy

### Reusable routine copied into a schedule

1. user has a standalone list called `Morning routine`
2. user attaches it to a recurring reminder schedule
3. backend creates a new schedule-owned attached copy
4. no direct run is created for the schedule itself
5. future occurrences get their own runs from that new schedule-owned copy
