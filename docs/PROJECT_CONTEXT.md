# PROJECT_CONTEXT.md

## Project Identity

- Name: `taskbar2`
- Type: Electron desktop app (macOS-focused) for task management, reminders, schedules, and notifications.
- Backend integration: real-time WebSocket protocol with a Go backend.
- Auth: Google OAuth.
- Data model style: backend-first state; client keeps in-memory state and syncs via socket events.

## Tech Stack

- Runtime: Electron `39.2.6`
- Language: JavaScript ESM (`"type": "module"` in `package.json`)
- Frontend style: vanilla JS + DOM manipulation (no React/Vue framework)
- Key libraries:
  - `ws` (WebSocket client transport)
  - `googleapis` / `google-auth-library` (OAuth and profile fetch)
  - `chrono-node` + local parser modules (natural language schedule parsing)
  - `rrule` (recurrence support in calendar renderer)
  - `electron-localshortcut`

## How To Run

- Install deps: `npm install` (already present in this workspace)
- Dev run:
  - `npm start`
  - `npm run dev` (adds `--trace-warnings`)
- Build:
  - Production: `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ./build.sh`
  - Dev build: `./build-dev.sh`

Notes:
- Build scripts generate `src/main/build-env.js` temporarily from env vars, then remove it.
- Build output goes to `dist/` (`.app`, `.dmg`, `.zip`).

## Environment And Runtime Config

- Required env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Optional:
  - `APP_STAGE` (`development` default)
- WebSocket endpoints (from `src/main/config.js`):
  - Development: `ws://localhost:8080/ws/taskbar`
  - Production: `wss://pythonws.dinodev.dev/ws/taskbar`
- Local runtime files:
  - app log: `<electron userData>/app.log`
  - OAuth tokens: `<electron userData>/tokens.json`

## Architecture Overview

### Main Process

Entry point: `main.js`

Responsibilities:
- App lifecycle
- Google auth bootstrap and login flow
- WebSocket client lifecycle + reconnect
- Window creation/coordination
- IPC registration and forwarding
- Global shortcut registration

Primary modules:
- `src/main/controllers/windowManager.js`
- `src/main/controllers/tasksController.js`
- `src/main/controllers/schedulesController.js`
- `src/main/controllers/notificationsController.js`
- `src/main/controllers/calendarController.js`
- `src/main/ipc/registerHandlers.js`
- `src/main/socket/handlers.js`
- `src/main/windows/*.js`

### Renderer Process

Responsibilities:
- UI rendering and interaction
- Local state shaping for tasks/calendar/notifications
- Sending IPC commands to main

Key files:
- Main taskbar UI: `src/js/newIndex.js`
- Calendar UI: `src/js/calendarWindow.js`
- Notifications UI: `src/js/notificationsWindow.js`
- Reminder wizard UI: `src/js/reminderWindow.js`
- Shared task helpers: `src/js/utility.js`
- HTML templates: `src/index.html`, `src/html/*.html`

## Window Model

Managed from `windowManager`:

- Taskbar
- Edit task
- Completed tasks
- Help
- Custom commands
- Task split
- Kenban
- Key window
- Notifications
- Reminder
- Delete confirmation
- Completion confirmation
- Calendar
- Add due

Pattern:
- one-instance-per-window-type by default
- open/focus/reuse behavior centralized in `windowManager`
- window-specific BrowserWindow options in `src/main/windows/*`

## Interaction Flows

### 1) Login + Connect

1. App starts and creates taskbar window.
2. Attempts token-based login (`googleapis.js`).
3. If unavailable/invalid, opens auth browser window and exchanges code.
4. On authenticated user, main connects socket and sends `connect`.
5. `connected` payload hydrates tasks, notifications, schedules, user settings.

### 2) Task Mutation

- Renderer sends IPC like `task_create`, `task_toggle`, `task_edit`, `task_complete`, `task_delete`.
- Main IPC handlers validate/normalize then send socket events.
- Socket push events (`new_task_created`, `related_task_*`) update renderers.

### 3) Scheduler/Calendar

- Renderer asks for schedules and occurrences through IPC (`schedule_*`, `calendar-fetch-occurrences`).
- Main forwards to socket events (`schedule_*`, `occurrences_fetch`).
- Responses (`schedule_created/updated/deleted`, `occurrences_list`, occurrence mutation events) are normalized and forwarded to calendar renderer.

### 4) Notifications

- Notification events hydrate unseen/history/snoozed/archived views.
- Unseen badge state is broadcast to taskbar renderer.
- Snooze/ack/archive actions send socket mutations.

## Protocol Contracts And Docs

Use these together:

- Full protocol reference: `docs/websocket_events.md`
- Scheduler contract v2 (latest frontend-facing details): `frontend_scheduler_ws_contract_v2.md`
- User settings contract: `frontend_user_settings_ws_contract.md`
- Scheduler data overview: `docs/scheduler_data_events.md`

Important recent contract points (v2 doc):
- `connected` no longer carries occurrences; fetch via `occurrences_fetch`.
- `schedule_delete` supports explicit delete modes.
- `user_settings` and `user_settings_update/get` drive persistent calendar filters.
- Occurrence payload is expected as JSON object (not encoded bytes).

## IPC Conventions

`src/main/ipc/registerHandlers.js` intentionally supports both aliases:

- Kebab-case: `schedule-create`, `schedule-edit`, `schedule-delete`, etc.
- Underscore: `schedule_create`, `schedule_edit`, `schedule_delete`, etc.

This is for backwards compatibility across renderers and should be preserved when adding new events.

## Global Shortcuts (Main Defaults)

From `main.js`:

- `Cmd/Ctrl+Shift+Space`: show taskbar + add task
- `Cmd/Ctrl+Shift+n`: add emergency task
- `Cmd/Ctrl+Shift+j`: open DevTools on active windows
- `Cmd/Ctrl+Shift+e`: edit current task
- `Cmd/Ctrl+Shift+k`: open kenban
- `Cmd/Ctrl+Shift+c`: open completed tasks
- `Cmd/Ctrl+Shift+s`: task switch
- `Cmd/Ctrl+Shift+y`: complete current task
- `Cmd/Ctrl+Shift+z`: open custom commands
- `Cmd/Ctrl+Shift+f`: open fuzzy finder

Reserved custom command keys include:
`Space`, `n`, `j`, `e`, `k`, `c`, `s`, `y`, `z`, `f`.

## Data Shaping Gotchas

- Backend often uses nullable wrappers (`{ Int32, Valid }`, `{ Time, Valid }`, etc.).
- Normalization logic is spread through controllers and renderers.
- Calendar and notification code already has robust normalizers; reuse them instead of adding ad hoc parsing.
- Timestamp expectations vary:
  - RFC3339 strings for schedule/occurrence boundaries.
  - Epoch ms appears in some task/notification mutation payloads.

## Current Reliability Risks To Keep In Mind

- Calendar/occurrence consistency has been an active development area.
- Notification tab pagination/scrolling behavior has ongoing refinements.
- Existing TODO list tracks a historical listener leak warning around window shortcut listeners.

## Where To Change What

- Socket event mapping or new server event behavior:
  - `src/main/socket/handlers.js`
  - relevant controller in `src/main/controllers/*`
- IPC shape/validation changes:
  - `src/main/ipc/registerHandlers.js`
- Calendar rendering, filters, event cards, details modal:
  - `src/js/calendarWindow.js`
  - `src/html/calendar.html`
  - `src/styles/calendar.css`
- Reminder flow parsing and submission:
  - `src/js/reminderWindow.js`
  - `src/common-language-parser/src/*`
- Notifications UI and actions:
  - `src/js/notificationsWindow.js`
  - `src/main/controllers/notificationsController.js`

## Fresh-Session Checklist

1. Read `AGENTS.md`.
2. Read this file.
3. Read `docs/HANDOFF.md` for current branch/worktree/task focus.
4. If changing scheduler/calendar behavior, also read:
   - `frontend_scheduler_ws_contract_v2.md`
   - `frontend_user_settings_ws_contract.md`
5. Verify whether your task is main-process, renderer, or protocol-contract level before editing.

