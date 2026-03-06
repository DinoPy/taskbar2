# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Taskbar2 is an Electron desktop task management application for macOS with real-time WebSocket synchronization to a Go backend server. It features Google OAuth authentication, a multi-window system, and keyboard-driven workflows.

## Build & Run Commands

```bash
# Development
npm start          # Run the app
npm run dev        # Run with --trace-warnings for debugging

# Production build (requires Google OAuth credentials)
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy ./build.sh

# Development build (uses .env file)
./build-dev.sh
```

Build outputs to `dist/` (DMG, ZIP, and .app bundle for macOS arm64).

## Architecture

### Process Model
- **Main Process** (`main.js` + `src/main/`): Electron lifecycle, window management, IPC coordination, WebSocket client
- **Renderer Process** (`src/js/`): UI logic with direct DOM manipulation (no framework)

### Key Directories
```
main.js                    # Entry point - initializes app, global shortcuts, socket
ws.js                      # WebSocket client with reconnection logic
googleapis.js              # Google OAuth setup

src/main/
  controllers/             # Business logic (tasks, notifications, schedules, calendar)
  windows/                 # BrowserWindow factory functions (13+ window types)
  ipc/registerHandlers.js  # IPC event listeners from renderer
  socket/handlers.js       # WebSocket event handlers
  menus/                   # Context menu creation

src/js/
  newIndex.js              # Main taskbar UI (42KB) - task rendering, timer, filtering
  utility.js               # Task class, formatting, urgency calculation
  calendarWindow.js        # Calendar grid rendering
  [window]Window.js        # UI logic for each window type

src/html/                  # Window HTML templates
src/styles/                # CSS (variables.css has design tokens)
src/common-language-parser/ # NLP for task descriptions
```

### IPC Communication Pattern
```javascript
// Renderer → Main
ipc.send("task_complete", taskData);
ipc.send("show-task-context-menu", taskData);

// Main → Renderer
taskbarWindow.webContents.send("refresh_tasks", taskArray);
taskbarWindow.webContents.send("socket-connected");
```

### WebSocket Events (Client ↔ Server)
Core task events: `task_create`, `task_toggle`, `task_edit`, `task_completed`, `task_delete`, `task_duplicate`, `task_split`

Server broadcasts: `new_task_created`, `related_task_edited`, `related_task_toggled`, `related_task_deleted`

See `docs/websocket_events.md` for the complete protocol reference.

### State Management
- **Main process**: `appState` object holds UI state, settings, pending operations
- **Controllers**: Encapsulated state (WindowManager tracks windows, NotificationsController tracks queue)
- **Renderer**: Direct variable state (`tasks` object keyed by ID, `completedTasks` array)
- **No local database**: All data syncs via WebSocket; tokens stored in `~/.taskbar/tokens.json`

## Global Keyboard Shortcuts
These are reserved and registered in `main.js`:
- `Cmd+Shift+Space` - Show taskbar, add task
- `Cmd+Shift+n` - Add emergency task
- `Cmd+Shift+j` - Open DevTools (all windows)
- `Cmd+Shift+e` - Edit current task
- `Cmd+Shift+k` - Kanban window
- `Cmd+Shift+c` - Completed tasks
- `Cmd+Shift+s` - Task switch
- `Cmd+Shift+y` - Complete current task
- `Cmd+Shift+z` - Custom commands window

## Environment Variables
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Required for OAuth
- `APP_STAGE` - "development" uses `ws://localhost:8080`, "production" uses `wss://pythonws.dinodev.dev`

## Worktree Cleanliness

The agent is responsible for keeping the git worktree clean. Before finishing any task:
- Do not leave untracked files that aren't necessary for the project
- Do not leave uncommitted changes from work that is complete
- Clean up any temporary or generated files created during development
- If work is in progress and cannot be committed, communicate this clearly to the user

## Window System
13+ window types managed by `WindowManager` singleton. Each window has:
- Factory function in `src/main/windows/`
- HTML template in `src/html/`
- UI logic in `src/js/`
- Styles in `src/styles/`
