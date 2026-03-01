# HANDOFF.md

Last updated: 2026-02-27

## Current Snapshot

- Branch: `main`
- HEAD: `0d2c25a` (`added window to edit due date and show before quickly using the natural language parser`)
- Workspace state: dirty (active in-progress changes already exist; do not revert unless explicitly asked).

## Current Worktree Changes

Modified:
- `src/common-language-parser/src/parser-browser.js`
- `src/common-language-parser/src/parser.js`
- `src/html/calendar.html`
- `src/html/reminder.html`
- `src/js/calendarWindow.js`
- `src/js/confirmDialog.js`
- `src/js/newIndex.js`
- `src/js/notificationsWindow.js`
- `src/js/reminderWindow.js`
- `src/main/controllers/calendarController.js`
- `src/main/controllers/notificationsController.js`
- `src/main/controllers/schedulesController.js`
- `src/main/ipc/registerHandlers.js`
- `src/main/socket/handlers.js`
- `src/main/windows/completionConfirmWindow.js`
- `src/main/windows/deleteConfirmWindow.js`
- `src/main/windows/reminderWindow.js`
- `src/styles/calendar.css`
- `src/styles/notifications.css`
- `src/styles/reminder.css`
- `todo.md`
- `todo_copy.md`

Untracked:
- `frontend_scheduler_ws_contract_v2.md`
- `frontend_user_settings_ws_contract.md`
- `parser-new.js`
- `parser-new2.js`

## What This Usually Means

- Calendar, notifications, reminder flow, scheduler IPC/socket mapping, and parser logic are active integration areas.
- Treat scheduler contracts as evolving and verify event payload shapes against:
  - `frontend_scheduler_ws_contract_v2.md`
  - `frontend_user_settings_ws_contract.md`
  - `docs/websocket_events.md`

## Active Priorities (From `todo.md`)

Most relevant current priorities:

- Fix calendar visibility for schedules/occurrences and avoid duplicates.
- Confirm occurrence handling logic keyed by `occurrence_id` + `occurs_at`.
- Continue tightening schedule edit/delete behavior and related UI actions.
- Improve notification list behavior (load/ordering/history/snoozed/archive reliability).
- Keep due-date/task visibility behavior coherent with backend scheduler events.

## Known Risk Areas

- Calendar pipeline crosses many layers:
  - renderer (`src/js/calendarWindow.js`)
  - IPC (`src/main/ipc/registerHandlers.js`)
  - controller normalization (`src/main/controllers/calendarController.js`)
  - socket mapping (`src/main/socket/handlers.js`)
- Nullable wrapper normalization is easy to regress if bypassed.
- Occurrence and schedule mutations now support scope-based behavior; payload validation matters.
- Notification tabs depend on consistent unseen/history/snoozed/archived state transitions.

## Recommended Start For Any New Task

1. Read `AGENTS.md` and `docs/PROJECT_CONTEXT.md`.
2. Re-check `docs/HANDOFF.md` (this file) for drift.
3. If touching calendar/schedules/occurrences:
   - inspect `frontend_scheduler_ws_contract_v2.md`
   - inspect `frontend_user_settings_ws_contract.md`
4. Keep backward-compatible IPC aliases when adding/changing events.
5. Run a focused manual smoke check for the modified flow.

## Quick Manual Smoke Checks

- Launch app: `npm start`
- Verify:
  - app opens taskbar window
  - socket connects after auth
  - task create/toggle/edit/complete still round-trip
  - notifications badge and window tabs still behave
  - calendar loads week data and responds to filter updates
  - schedule create/edit/delete still produce expected calendar updates

