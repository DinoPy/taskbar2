# Standalone Lists Design

## Overview

Extend the existing attached lists system with standalone lists: personal lists
that exist without being owned by a task, schedule, or occurrence. Users can
create, edit, and interact with standalone lists directly, and optionally attach
(copy) them to tasks, schedules, or occurrences.

Contract: `docs/frontend_standalone_lists_ws_contract.md`

## Approach

Reuse the existing `listWindow.js` with an `isStandalone` mode flag. No new
window files. The standalone surface uses `{ kind: "standalone_home" }` as its
target (no `id` field).

## Opening

- `lists` command in task switch input (same pattern as `llc`, `ll<n>`)
- IPC: `open-list-window` with `{ target: { kind: "standalone_home" } }`
- Main process creates or reuses the list window in standalone mode

## surfaceKey Fix

`surfaceKey()` in `listsController.js` currently requires `target.id`, which is
undefined for `standalone_home`. Fix: return `"standalone_home"` when
`target.kind === "standalone_home"`.

## Window Behavior (Standalone Mode)

- Header: "Standalone Lists" title, no target subtitle
- Sidebar: all standalone lists from `standalone_home` surface
- Main panel: same template editor + run progress as attached lists
- Footer: list count instead of owner info
- Context menu on sidebar items: "Attach to..." and "Delete"
- No frozen-owner logic, no auto-completion concerns

## Attach Flow

Direction: from standalone list only (contract supports this direction).

1. User right-clicks or uses action on a standalone list sidebar item
2. Selects "Attach to..."
3. Command-style picker overlay appears inside list window:
   - Text input for filtering
   - Filtered list of valid targets (tasks, schedules, occurrences)
   - Arrow keys to navigate, Enter to confirm, Escape to cancel
4. Main process provides targets via IPC (`get-attach-targets`)
5. Frontend sends `standalone_list_attach` with `list_id`, `target`, `position`
6. Server broadcasts `standalone_list_attached` + `list_created` for destination
7. Source list remains unchanged; destination surface updated if subscribed

## Delete Flow

1. User selects "Delete" from context menu or keyboard shortcut
2. Confirmation dialog shown (hard delete, irreversible)
3. On confirm: send `list_delete` event
4. Server broadcasts `list_deleted`; surface updated

## listsController Changes

- `surfaceKey()`: handle `standalone_home` (no `id`)
- Template mutation broadcasts route to standalone surface when
  `owner.kind === "standalone"`
- `standalone_list_attached` handler: update destination surface if subscribed
- No `onTaskListStatus` for standalone lists (no task owner)

## Socket Handler Changes

- Register `standalone_list_attached` broadcast handler
- Route through listsController

## listWindow.js Changes

- Accept `isStandalone` flag from window params
- Standalone mode: fetch `standalone_home` target on load
- Standalone mode: re-fetch on reconnect if visible
- Add context menu with "Attach to..." and "Delete" for sidebar items
- Add attach picker overlay (command-style input + filtered list)
- Add delete confirmation dialog
- Keyboard shortcut for delete (with confirmation)

## State Management

Follow contract recommendation (section 16):
- Template mutation payloads are full surface replacements
- Runtime mutation payloads are single-object merges by id
- On error: revert optimistic state, refetch `standalone_home`

## Files Modified

- `src/main/controllers/listsController.js` — surfaceKey fix, standalone routing
- `src/main/socket/handlers.js` — standalone_list_attached handler
- `src/js/listWindow.js` — standalone mode, attach picker, delete confirm
- `src/js/newIndex.js` — `lists` command in task switch
- `src/html/list.html` — attach picker overlay, delete confirm dialog markup
- `src/styles/list.css` — attach picker and delete confirm styles
- `src/main/ipc/registerHandlers.js` — get-attach-targets handler
