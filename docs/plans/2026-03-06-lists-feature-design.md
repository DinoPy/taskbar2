# Lists Feature Design

## Overview

Add checklist/workflow/routine lists to the Electron app following the WebSocket contract in `docs/frontend_lists_ws_contract.md`. Lists attach to tasks, schedules, occurrences, and notifications with real-time sync.

## Approach: Hybrid (Inline Summary + Dedicated Window)

Existing windows (edit, notifications, calendar, reminder) show compact progress summaries. A dedicated List Window handles full CRUD and runtime interaction.

## Main Process: ListsController

New `src/main/controllers/listsController.js` — centralized state management.

### State

```js
{
  surfaces: Map<string, {           // keyed by "kind:id"
    target: { kind, id },
    resolved_from: { schedule_id, occurrence_id, task_id, notification_id },
    lists: ResolvedListBundle[]     // definitions + items + runs + run_items
  }>,
  subscribers: Map<string, Set<windowId>>,  // surface key -> windows watching
  runIndex: Map<run_id, surfaceKey>         // fast lookup for runtime events
}
```

### Behaviors

- Fetch on demand when a window subscribes
- On WebSocket reconnect, re-fetch all surfaces with active subscribers
- Template mutation responses (full ListsTargetPayload) replace entire surface
- Runtime mutation responses (individual objects) patch in-place
- Push updates to all subscriber windows after any state change
- Clean up surface state when last subscriber leaves
- No optimistic updates in v1

### Methods

- `fetchForTarget(target, windowId)` — subscribe + send WS lists_fetch
- `unsubscribe(windowId)` — remove from subscribers, cleanup if last
- `sendMutation(event, data)` — forward to WebSocket with last_modified_at
- `handleServerEvent(event, data)` — update state, notify subscribers

## Socket Handlers

Additions to `src/main/socket/handlers.js`:

| Server Event | Action |
|---|---|
| `lists_target` | Store payload, push to subscribers |
| `list_created/updated/deleted`, `lists_reordered` | Full replace from ListsTargetPayload |
| `list_item_created/updated/deleted`, `list_items_reordered` | Full replace from ListsTargetPayload |
| `list_run_item_updated` | Patch run item in-place, push to subscribers |
| `list_run_updated` | Patch run in-place, push to subscribers |
| `connection_error` (list types) | Forward to subscriber windows |

## IPC Handlers

Additions to `src/main/ipc/registerHandlers.js`:

| Direction | Event | Payload |
|---|---|---|
| Renderer -> Main | `lists-fetch` | `{ target, windowId }` |
| Renderer -> Main | `lists-unsubscribe` | `windowId` |
| Renderer -> Main | `lists-mutation` | `{ event, data }` |
| Main -> Renderer | `lists-data` | Full surface state |
| Main -> Renderer | `lists-error` | `{ type, message, code }` |

## List Window (New)

### Files

- `src/main/windows/listWindow.js` — BrowserWindow factory
- `src/html/list.html` — HTML template
- `src/js/listWindow.js` — UI logic
- `src/styles/list.css` — Styles

### Layout

Two-panel design:
- Left panel: list definitions (select, reorder, add/delete)
- Right panel top: template items (create/edit/delete/reorder)
- Right panel bottom: run progress (checkbox toggle, timer controls, note editing)
- Footer: owner info, revision, run status

### Registration

WindowManager tracks list windows per target (multiple can be open for different targets, one per target). Keyed by target string "kind:id".

### Behaviors

- Receives `{ target, context }` on open
- Sends `lists-fetch` on load
- Schedule targets: template-only (no run section)
- Completed/canceled runs: read-only runtime section
- Frozen owners: read-only template section
- Item reorder via up/down buttons (no drag library in v1)

## Inline Summaries

Shared module `src/js/listSummary.js` with `renderListSummary({ lists, target })`.

### Edit Window

- Shows aggregated progress: "Lists ####___ 4/7 [Open]"
- Fetches on window open, unsubscribes on close
- "No lists - Add" when empty, opens List Window

### Notification Window

- Shows when payload has `open_required_list_count > 0` or `list_run_ids`
- Per-notification inline: "2 lists ###__ 3/5 [View]"

### Calendar Detail Overlay

- Shows in existing detail panel
- "1 list ##### 5/6 [Open]"

### Reminder Window

- Template count only (no runs for schedules)
- "2 list templates [Manage]"

All summaries subscribe via same IPC channel and auto-refresh on server broadcasts.

## Error Handling

| Error | Code | UI Response |
|---|---|---|
| `task_blocked_by_list` | 409 | Toast in edit window |
| `list_run_locked` | 409 | Refetch, UI already read-only |
| `list_owner_locked` | 409 | Refetch, disable template controls |
| `invalid_list_item_type` | 400 | Log error (bug in our code) |
| `not_found` | 404 | Refetch, removes stale item |
| `database_error` | 500 | Refetch, brief error indicator |

## Sync Guarantees

- ListsController is single source of truth
- Windows never cache independently
- Server payloads are authoritative (no optimistic updates v1)
- Reconnect triggers re-fetch for all active surfaces
- Runtime events patched via runIndex for O(1) lookup
- Auto-completion chain: list_run_item_updated -> list_run_updated -> related_task_deleted

## Not in V1

- Drag-to-reorder (use up/down buttons)
- Inline item editing in summaries
- Undo/redo
- Offline support

## Deliverables

| File | Type |
|---|---|
| `src/main/controllers/listsController.js` | New |
| `src/main/socket/handlers.js` | Modified |
| `src/main/ipc/registerHandlers.js` | Modified |
| `src/main/windows/listWindow.js` | New |
| `src/main/controllers/windowManager.js` | Modified |
| `src/js/listWindow.js` | New |
| `src/html/list.html` | New |
| `src/styles/list.css` | New |
| `src/js/listSummary.js` | New |
| `src/js/childrenIndex.js` | Modified |
| `src/html/child.html` | Modified |
| `src/js/notificationsWindow.js` | Modified |
| `src/js/calendarWindow.js` | Modified |
| `src/js/reminderWindow.js` | Modified |
| `main.js` | Modified |
