# Task Templates - Design Document

## Scope

Core template system: CRUD, search, manual task creation with variable prompting, template-owned lists via existing list window.

Deferred: schedule/reminder `template_use` attachment (additive follow-up, no rework needed).

## New Window Types

### Template Window (dedicated, singleton)

Access: main context menu "Templates" item + `templates` command from taskbar input.

Layout:
- Left panel: template list with search bar, sorted by `updated_at DESC`
- Right panel: template editor form (create/edit)

Editor fields:
- title, description, category, tags, priority
- show_before_due_time, due_offset_minutes
- variables section (add/remove rows: key, label, description)

Actions:
- "Manage Lists" button opens existing list window with `target: { kind: "task_template", id }`
- "Use Template" button triggers variable prompt modal
- Delete button with confirmation

Data flow:
- Fetches via `template_list` on open
- Updates via `template_created`, `template_updated`, `template_deleted` broadcasts
- Search via `template_search` when user types in search bar

### Variable Prompt Modal (small frameless window)

- Dynamically generates input fields from template `variables` array
- Shows variable label + description as hints
- Submit triggers `task_create_from_template`
- Reusable from template window "Use" button and taskbar `t <search>` command

## Integration Points

### WindowManager
- New `templateWindow` singleton slot
- New `variablePromptWindow` slot

### Socket handlers
- `template_created` -> forward to template window
- `template_updated` -> forward to template window
- `template_deleted` -> forward to template window, close related surfaces
- `template_list` -> forward to template window (unicast response)
- `template_search` -> forward to template window (unicast response)

### IPC handlers
- Template CRUD relay (renderer -> main -> WebSocket)
- Open template window
- Open variable prompt with template data

### Context menu
- "Templates" item in main context menu

### Taskbar commands
- `templates` opens template window
- `t <search>` quick template picker for fast task creation

### Lists controller
- Already supports arbitrary targets via surface subscription model
- `task_template` kind flows through existing `lists_fetch`, `list_create`, etc.
- Template-owned lists: `run = null`, `run_items = null`

### Template rev tracking
- Optimistic local `rev` increment after template-owned list mutations (contract section 6.2)
- Refetch before `template_use` if rev is known stale
- Handle 409 conflict by refetching template + lists

## New Files

| File | Purpose |
|------|---------|
| `src/main/windows/templateWindow.js` | Window factory |
| `src/main/windows/variablePromptWindow.js` | Window factory |
| `src/html/templates.html` | Template window markup |
| `src/html/variablePrompt.html` | Variable prompt markup |
| `src/js/templateWindow.js` | Template window renderer logic |
| `src/js/variablePromptWindow.js` | Variable prompt renderer logic |
| `src/styles/templates.css` | Template window styles |
| `src/styles/variablePrompt.css` | Variable prompt styles |

## Architecture Decisions

- No new controller: template state lives in renderer, main process relays events
- Reuse existing list window for template-owned list editing
- Variable prompt is a separate window (reusable from multiple entry points)
- Template search returns full objects, so search results serve as the template store

## Contract Reference

Full WebSocket protocol: `docs/frontend_task_templates_ws_contract.md`
