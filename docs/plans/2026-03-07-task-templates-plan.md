# Task Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add task template CRUD, search, manual task creation from templates with variable prompting, and template-owned lists to the Electron app.

**Architecture:** Template state lives in the renderer (templateWindow.js). Main process relays WebSocket events and manages window lifecycle. Variable prompt is a separate small modal window reusable from multiple entry points (template window + taskbar command). Template-owned lists reuse the existing list window with `task_template` target kind.

**Tech Stack:** Electron BrowserWindow, vanilla JS/DOM, WebSocket events via existing socket client, CSS custom properties from variables.css.

---

### Task 1: Template Window Factory

**Files:**
- Create: `src/main/windows/templateWindow.js`

**Step 1: Create the window factory**

```javascript
import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;

export function createTemplateWindow({ screenIndex, onClose } = {}) {
	const allDisplays = screen.getAllDisplays();
	const normalizedIndex = Number.isInteger(screenIndex)
		? Math.min(Math.max(screenIndex, 0), allDisplays.length - 1)
		: undefined;
	const targetDisplay = allDisplays.length
		? allDisplays[normalizedIndex ?? 0]
		: screen.getPrimaryDisplay();
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 700,
		minHeight: 450,
		movable: true,
		show: true,
		frame: false,
		resizable: true,
		title: "Task Templates",
		backgroundColor: "#10121a",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/templates.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
```

**Step 2: Commit**

```bash
git add src/main/windows/templateWindow.js
git commit -m "feat(templates): add template window factory"
```

---

### Task 2: Variable Prompt Window Factory

**Files:**
- Create: `src/main/windows/variablePromptWindow.js`

**Step 1: Create the variable prompt window factory**

Follow the addDueWindow pattern — small, frameless, transparent, modal, centered.

```javascript
import { BrowserWindow, screen } from "electron";

const WINDOW_WIDTH = 440;
const WINDOW_HEIGHT = 320;

export function createVariablePromptWindow({ template, onClose } = {}) {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);

	const win = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor((activeDisplay.bounds.width - WINDOW_WIDTH) / 2),
		y: activeDisplay.bounds.y + Math.floor((activeDisplay.bounds.height - WINDOW_HEIGHT) / 2),
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		minimizable: false,
		resizable: true,
		minWidth: 360,
		minHeight: 200,
		modal: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		hasShadow: false,
		transparent: true,
		skipTaskbar: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	win.loadFile("src/html/variablePrompt.html");
	win.setMenuBarVisibility(false);

	win.webContents.once("did-finish-load", () => {
		win.webContents.send("variable-prompt-data", template);
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
```

**Step 2: Commit**

```bash
git add src/main/windows/variablePromptWindow.js
git commit -m "feat(templates): add variable prompt window factory"
```

---

### Task 3: Register Windows in WindowManager

**Files:**
- Modify: `src/main/controllers/windowManager.js`

**Step 1: Add factory parameter and state slots**

In `createWindowManager` parameter list, add after `createListWindow`:
```javascript
createTemplateWindow,
createVariablePromptWindow,
```

In the `state` object, add:
```javascript
template: null,
variablePrompt: null,
```

**Step 2: Add open/close/get methods**

Add these methods to the returned object (follow the calendarWindow singleton pattern):

```javascript
openTemplateWindow(options = {}) {
	if (state.template && !state.template.isDestroyed()) {
		state.template.focus();
		return state.template;
	}
	state.template = createTemplateWindow({
		...options,
		onClose: () => {
			state.template = null;
			options?.onClose?.();
		},
	});
	return state.template;
},

getTemplateWindow() {
	return state.template;
},

closeTemplateWindow() {
	if (state.template && !state.template.isDestroyed()) {
		state.template.close();
	}
},

openVariablePromptWindow(options = {}) {
	if (state.variablePrompt && !state.variablePrompt.isDestroyed()) {
		state.variablePrompt.focus();
		state.variablePrompt.webContents.send("variable-prompt-data", options?.template);
		return state.variablePrompt;
	}
	state.variablePrompt = createVariablePromptWindow({
		...options,
		onClose: () => {
			state.variablePrompt = null;
			options?.onClose?.();
		},
	});
	return state.variablePrompt;
},

getVariablePromptWindow() {
	return state.variablePrompt;
},

closeVariablePromptWindow() {
	if (state.variablePrompt && !state.variablePrompt.isDestroyed()) {
		state.variablePrompt.close();
	}
},
```

**Step 3: Commit**

```bash
git add src/main/controllers/windowManager.js
git commit -m "feat(templates): register template and variable prompt windows in WindowManager"
```

---

### Task 4: Wire Window Factories in main.js

**Files:**
- Modify: `main.js`

**Step 1: Import the new factories**

Add after the `createListWindow` import (line 24):
```javascript
import { createTemplateWindow as createTemplateBrowserWindow } from "./src/main/windows/templateWindow.js";
import { createVariablePromptWindow as createVariablePromptBrowserWindow } from "./src/main/windows/variablePromptWindow.js";
```

**Step 2: Pass to WindowManager**

In the `createWindowManager(...)` call (line 101-117), add after `createListWindow`:
```javascript
createTemplateWindow: createTemplateBrowserWindow,
createVariablePromptWindow: createVariablePromptBrowserWindow,
```

**Step 3: Add helper function for opening template window on focused screen**

Add after `openCalendarWindowOnFocusedScreen` (around line 706):
```javascript
function openTemplateWindow(options = {}) {
	const displays = screen.getAllDisplays();
	const requestedIndex = Number.isInteger(options.screenIndex)
		? options.screenIndex
		: appState.currentlySelectedScreenIndex ?? 0;
	const maxIndex = Math.max(displays.length - 1, 0);
	const normalizedIndex = Math.min(Math.max(requestedIndex, 0), maxIndex);
	try {
		return windowManager.openTemplateWindow({
			...options,
			screenIndex: normalizedIndex,
		});
	} catch (e) {
		console.error(e);
	}
}
```

**Step 4: Add template window to DevTools shortcut and close handler**

In the `Cmd+Shift+j` handler (line 470-492), add:
```javascript
windowManager.getTemplateWindow()?.webContents.openDevTools();
```

In `handleCloseAppRequest` (line 429-438), add before `windowManager.getTaskbarWindow()?.close()`:
```javascript
windowManager.closeTemplateWindow();
windowManager.closeVariablePromptWindow();
```

**Step 5: Commit**

```bash
git add main.js
git commit -m "feat(templates): wire template window factories in main.js"
```

---

### Task 5: Add WebSocket Handlers for Template Events

**Files:**
- Modify: `src/main/socket/handlers.js`

**Step 1: Add template event handlers**

Add these entries to the `eventHandlers` object, after the `standalone_list_attached` handler (line 581):

```javascript
// ---- Template events ----
template_created: ({ data }) => {
	let payload = data;
	if (typeof payload === "string") {
		try { payload = JSON.parse(payload); } catch { return; }
	}
	if (!payload) return;
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("template-created", payload);
	}
},
template_updated: ({ data }) => {
	let payload = data;
	if (typeof payload === "string") {
		try { payload = JSON.parse(payload); } catch { return; }
	}
	if (!payload) return;
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("template-updated", payload);
	}
},
template_deleted: ({ data }) => {
	let payload = data;
	if (typeof payload === "string") {
		try { payload = JSON.parse(payload); } catch { return; }
	}
	if (!payload) return;
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("template-deleted", payload);
	}
	// Close any list window targeting this template
	const templateId = payload?.id;
	if (templateId) {
		windowManager.closeListWindow?.({ kind: "task_template", id: templateId });
	}
},
template_list: ({ data }) => {
	let payload = data;
	if (typeof payload === "string") {
		try { payload = JSON.parse(payload); } catch { return; }
	}
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("template-list", payload);
	}
},
template_search: ({ data }) => {
	let payload = data;
	if (typeof payload === "string") {
		try { payload = JSON.parse(payload); } catch { return; }
	}
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("template-search", payload);
	}
},
```

**Step 2: Commit**

```bash
git add src/main/socket/handlers.js
git commit -m "feat(templates): add WebSocket handlers for template events"
```

---

### Task 6: Add IPC Handlers for Templates

**Files:**
- Modify: `src/main/ipc/registerHandlers.js`

**Step 1: Add template IPC handlers**

Add after the lists IPC handlers section (after line 880):

```javascript
// ---- Template IPC handlers ----

ipc.on("open-template-window", () => {
	windowManager.openTemplateWindow?.({
		screenIndex: appState.currentlySelectedScreenIndex ?? 0,
	});
});

ipc.on("template-create", (_, data) => {
	if (!data) return;
	sendEvent?.("template_create", data);
});

ipc.on("template-edit", (_, data) => {
	if (!data) return;
	sendEvent?.("template_edit", data);
});

ipc.on("template-delete", (_, data) => {
	if (!data?.id) return;
	sendEvent?.("template_delete", { id: data.id });
});

ipc.on("template-list", () => {
	sendEvent?.("template_list", {});
});

ipc.on("template-search", (_, data) => {
	sendEvent?.("template_search", data ?? {});
});

ipc.on("task-create-from-template", (_, data) => {
	if (!data?.template_use) return;
	sendEvent?.("task_create_from_template", data);
});

ipc.on("open-variable-prompt", (_, data) => {
	if (!data?.template) return;
	windowManager.openVariablePromptWindow?.({ template: data.template });
});

ipc.on("variable-prompt-close", () => {
	windowManager.closeVariablePromptWindow?.();
});

ipc.on("variable-prompt-submit", (_, data) => {
	if (!data?.template_use) return;
	sendEvent?.("task_create_from_template", {
		template_use: data.template_use,
		last_modified_at: Date.now(),
	});
	windowManager.closeVariablePromptWindow?.();
});
```

**Step 2: Commit**

```bash
git add src/main/ipc/registerHandlers.js
git commit -m "feat(templates): add IPC handlers for template CRUD and variable prompt"
```

---

### Task 7: Add Context Menu and Taskbar Command Integration

**Files:**
- Modify: `src/main/menus/index.js`
- Modify: `src/js/newIndex.js`

**Step 1: Add "Templates" to main context menu**

In `showMainContextMenu`, add `openTemplateWindow` to the destructured parameters:
```javascript
export function showMainContextMenu({
	...,
	openTemplateWindow,
}) {
```

Add menu item after "Calendar" (line 147):
```javascript
menu.append(
	new MenuItem({
		label: "Templates",
		toolTip: "Open the task templates manager",
		click: () => openTemplateWindow?.(),
	})
);
```

**Step 2: Pass openTemplateWindow from main.js**

In `main.js`, update `showMainMenu` (line 298-317) to include:
```javascript
openTemplateWindow,
```

**Step 3: Add `templates` command to parseCommand**

In `src/js/newIndex.js`, add before the `llc` command (line 909):
```javascript
// Templates command
if (trimmed === 'templates') {
	return { type: 'open_templates' };
}
```

**Step 4: Add `open_templates` to executeCommand**

In `executeCommand`, add before the `invalid` case (line 1112):
```javascript
case 'open_templates':
	ipc.send('open-template-window');
	return { success: true, message: "Opening templates window" };
```

**Step 5: Add to command suggestions**

In `getCommandSuggestions`, add to the empty-input defaults list (around line 1143):
```javascript
{ command: 'templates', description: 'open task templates' },
```

Add to the prefix matching section (around line 1156):
```javascript
if ('templates'.startsWith(trimmed) && trimmed.startsWith('te')) {
	suggestions.push({ command: 'templates', description: 'open task templates' });
}
```

Add to the `allCommands` array (around line 1185):
```javascript
{ command: 'templates', description: 'open task templates', pattern: /^templates$/ },
```

**Step 6: Commit**

```bash
git add src/main/menus/index.js src/js/newIndex.js main.js
git commit -m "feat(templates): add context menu item and taskbar command for templates"
```

---

### Task 8: Template Window HTML

**Files:**
- Create: `src/html/templates.html`

**Step 1: Create the HTML template**

Two-panel layout: left panel with search + template list, right panel with editor form.

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="../styles/variables.css">
	<link rel="stylesheet" href="../styles/templates.css">
	<title>Task Templates</title>
</head>
<body>
	<div class="tpl-window" id="tplWindow">
		<div class="tpl-titlebar" style="-webkit-app-region: drag;">
			<span class="tpl-titlebar-text">Task Templates</span>
			<button class="tpl-close-btn" id="closeBtn" style="-webkit-app-region: no-drag;">
				<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
			</button>
		</div>

		<div class="tpl-body">
			<!-- Left panel: list -->
			<div class="tpl-list-panel">
				<div class="tpl-search-bar">
					<input type="text" class="tpl-search-input" id="searchInput" placeholder="Search templates..." autocomplete="off" />
				</div>
				<div class="tpl-list" id="templateList">
					<!-- template cards rendered here -->
				</div>
				<button class="tpl-new-btn" id="newTemplateBtn">+ New Template</button>
			</div>

			<!-- Right panel: editor -->
			<div class="tpl-editor-panel" id="editorPanel">
				<div class="tpl-editor-empty" id="editorEmpty">
					<p>Select a template or create a new one</p>
				</div>

				<form class="tpl-editor-form" id="editorForm" style="display:none;">
					<div class="tpl-form-row">
						<label for="tplTitle">Title</label>
						<input type="text" id="tplTitle" placeholder="e.g. Call {{name}}" required />
					</div>

					<div class="tpl-form-row">
						<label for="tplDescription">Description</label>
						<textarea id="tplDescription" rows="3" placeholder="e.g. Follow up with {{name}} tomorrow"></textarea>
					</div>

					<div class="tpl-form-row">
						<label for="tplCategory">Category</label>
						<input type="text" id="tplCategory" placeholder="Life" />
					</div>

					<div class="tpl-form-row">
						<label>Tags</label>
						<div class="tpl-tags-container">
							<input type="text" class="tpl-tags-input" id="tplTagsInput" placeholder="Add tag..." />
							<button type="button" class="tpl-tags-add-btn" id="tplTagsAddBtn">Add</button>
						</div>
						<div class="tpl-tags-list" id="tplTagsList"></div>
					</div>

					<div class="tpl-form-row tpl-form-row-inline">
						<div>
							<label for="tplPriority">Priority (1-10)</label>
							<input type="number" id="tplPriority" min="1" max="10" />
						</div>
						<div>
							<label>Show Before Due</label>
							<div class="tpl-time-row">
								<input type="number" id="tplShowBeforeH" min="0" max="23" value="0" />
								<span>h</span>
								<input type="number" id="tplShowBeforeM" min="0" max="59" value="0" />
								<span>m</span>
							</div>
						</div>
						<div>
							<label>Due Offset</label>
							<div class="tpl-time-row">
								<input type="number" id="tplDueOffsetH" min="0" value="0" />
								<span>h</span>
								<input type="number" id="tplDueOffsetM" min="0" max="59" value="0" />
								<span>m</span>
							</div>
						</div>
					</div>

					<!-- Variables section -->
					<div class="tpl-form-row">
						<label>Variables</label>
						<div class="tpl-vars-list" id="tplVarsList"></div>
						<button type="button" class="tpl-vars-add-btn" id="tplVarsAddBtn">+ Add Variable</button>
					</div>

					<!-- Actions -->
					<div class="tpl-editor-actions">
						<button type="button" class="tpl-btn tpl-btn-secondary" id="manageListsBtn">Manage Lists</button>
						<button type="button" class="tpl-btn tpl-btn-accent" id="useTemplateBtn">Use Template</button>
						<div class="tpl-editor-actions-right">
							<button type="button" class="tpl-btn tpl-btn-danger" id="deleteTemplateBtn" style="display:none;">Delete</button>
							<button type="submit" class="tpl-btn tpl-btn-primary" id="saveTemplateBtn">Save</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>

	<script type="module" src="../js/templateWindow.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add src/html/templates.html
git commit -m "feat(templates): add template window HTML"
```

---

### Task 9: Variable Prompt HTML

**Files:**
- Create: `src/html/variablePrompt.html`

**Step 1: Create the HTML**

Small dialog with dynamic variable fields. Follow the addDue.html pattern.

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="../styles/variables.css">
	<link rel="stylesheet" href="../styles/variablePrompt.css">
	<title>Use Template</title>
</head>
<body>
	<div class="vp-card" id="vpCard">
		<h2 class="vp-title" id="vpTitle">Use Template</h2>
		<div class="vp-fields" id="vpFields">
			<!-- dynamic variable inputs rendered here -->
		</div>
		<div class="vp-actions">
			<button class="vp-btn vp-btn-cancel" id="cancelBtn">Cancel</button>
			<button class="vp-btn vp-btn-submit" id="submitBtn">Create Task</button>
		</div>
	</div>

	<script type="module" src="../js/variablePromptWindow.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add src/html/variablePrompt.html
git commit -m "feat(templates): add variable prompt HTML"
```

---

### Task 10: Template Window CSS

**Files:**
- Create: `src/styles/templates.css`

**Step 1: Create the stylesheet**

Use design tokens from `variables.css`. Dark theme consistent with the calendar window.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
	font-family: 'Nunito', -apple-system, sans-serif;
	background: transparent;
	color: var(--color-text-white);
	overflow: hidden;
	height: 100vh;
}

/* Window chrome */
.tpl-window {
	display: flex;
	flex-direction: column;
	height: 100vh;
	background: var(--color-bg-root);
	border-radius: 12px;
	overflow: hidden;
}

.tpl-titlebar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 14px;
	background: oklch(0.22 0.08 80);
	flex-shrink: 0;
}

.tpl-titlebar-text {
	font-size: 13px;
	font-weight: 600;
	opacity: 0.7;
}

.tpl-close-btn {
	background: none;
	border: none;
	color: var(--color-text-white);
	opacity: 0.5;
	cursor: pointer;
	padding: 4px;
	border-radius: 4px;
	display: flex;
	align-items: center;
}

.tpl-close-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

/* Body layout */
.tpl-body {
	display: flex;
	flex: 1;
	overflow: hidden;
}

/* Left panel */
.tpl-list-panel {
	width: 260px;
	min-width: 200px;
	border-right: 1px solid oklch(0.30 0.05 80);
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
}

.tpl-search-bar {
	padding: 10px;
	flex-shrink: 0;
}

.tpl-search-input {
	width: 100%;
	padding: 7px 10px;
	font-size: 13px;
	border: 1px solid oklch(0.35 0.05 80);
	border-radius: 6px;
	background: oklch(0.20 0.06 80);
	color: var(--color-text-white);
	outline: none;
	font-family: inherit;
}

.tpl-search-input:focus {
	border-color: var(--color-border-focus);
}

.tpl-search-input::placeholder {
	color: oklch(0.55 0.03 80);
}

.tpl-list {
	flex: 1;
	overflow-y: auto;
	padding: 0 6px;
}

.tpl-list::-webkit-scrollbar { width: 5px; }
.tpl-list::-webkit-scrollbar-thumb { background: oklch(0.40 0.04 80); border-radius: 4px; }

.tpl-card {
	padding: 8px 10px;
	border-radius: 6px;
	cursor: pointer;
	margin-bottom: 2px;
	transition: background 0.12s;
}

.tpl-card:hover { background: oklch(0.28 0.06 80); }
.tpl-card.active { background: oklch(0.32 0.08 80); }

.tpl-card-title {
	font-size: 13px;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tpl-card-meta {
	font-size: 11px;
	opacity: 0.5;
	margin-top: 2px;
}

.tpl-new-btn {
	margin: 8px 10px;
	padding: 8px;
	font-size: 13px;
	font-weight: 500;
	border: 1px dashed oklch(0.40 0.05 80);
	border-radius: 6px;
	background: transparent;
	color: var(--color-text-white);
	opacity: 0.6;
	cursor: pointer;
	transition: opacity 0.15s, background 0.15s;
	flex-shrink: 0;
	font-family: inherit;
}

.tpl-new-btn:hover { opacity: 1; background: oklch(0.25 0.06 80); }

/* Right panel: editor */
.tpl-editor-panel {
	flex: 1;
	overflow-y: auto;
	padding: 16px 20px;
}

.tpl-editor-panel::-webkit-scrollbar { width: 5px; }
.tpl-editor-panel::-webkit-scrollbar-thumb { background: oklch(0.40 0.04 80); border-radius: 4px; }

.tpl-editor-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	opacity: 0.4;
	font-size: 14px;
}

.tpl-editor-form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.tpl-form-row label {
	display: block;
	font-size: 12px;
	font-weight: 500;
	color: oklch(0.65 0.04 80);
	margin-bottom: 4px;
}

.tpl-form-row input[type="text"],
.tpl-form-row input[type="number"],
.tpl-form-row textarea,
.tpl-form-row select {
	width: 100%;
	padding: 7px 10px;
	font-size: 13px;
	border: 1px solid oklch(0.35 0.05 80);
	border-radius: 6px;
	background: oklch(0.20 0.06 80);
	color: var(--color-text-white);
	outline: none;
	font-family: inherit;
}

.tpl-form-row input:focus,
.tpl-form-row textarea:focus {
	border-color: var(--color-border-focus);
}

.tpl-form-row textarea {
	resize: vertical;
	min-height: 60px;
}

.tpl-form-row-inline {
	display: flex;
	gap: 12px;
}

.tpl-form-row-inline > div {
	flex: 1;
}

.tpl-form-row-inline input[type="number"] {
	width: 56px;
}

.tpl-time-row {
	display: flex;
	align-items: center;
	gap: 4px;
}

.tpl-time-row span {
	font-size: 12px;
	opacity: 0.5;
}

/* Tags */
.tpl-tags-container {
	display: flex;
	gap: 6px;
}

.tpl-tags-container input { flex: 1; }

.tpl-tags-add-btn {
	padding: 6px 14px;
	font-size: 12px;
	font-weight: 500;
	border: none;
	border-radius: 6px;
	background: var(--color-accent-primary);
	color: white;
	cursor: pointer;
	font-family: inherit;
}

.tpl-tags-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 6px;
}

.tpl-tag {
	padding: 3px 8px;
	font-size: 11px;
	font-weight: 500;
	border-radius: 4px;
	background: oklch(0.30 0.08 80);
	cursor: pointer;
	transition: background 0.15s;
}

.tpl-tag:hover { background: oklch(0.40 0.12 20); }

/* Variables */
.tpl-vars-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.tpl-var-row {
	display: flex;
	gap: 6px;
	align-items: center;
}

.tpl-var-row input {
	flex: 1;
	padding: 5px 8px;
	font-size: 12px;
	border: 1px solid oklch(0.35 0.05 80);
	border-radius: 4px;
	background: oklch(0.20 0.06 80);
	color: var(--color-text-white);
	outline: none;
	font-family: inherit;
}

.tpl-var-row input:focus { border-color: var(--color-border-focus); }

.tpl-var-remove-btn {
	background: none;
	border: none;
	color: oklch(0.60 0.15 20);
	cursor: pointer;
	font-size: 16px;
	padding: 2px 6px;
	border-radius: 4px;
}

.tpl-var-remove-btn:hover { background: oklch(0.30 0.10 20); }

.tpl-vars-add-btn {
	margin-top: 4px;
	padding: 5px 10px;
	font-size: 12px;
	border: 1px dashed oklch(0.40 0.05 80);
	border-radius: 4px;
	background: transparent;
	color: var(--color-text-white);
	opacity: 0.6;
	cursor: pointer;
	font-family: inherit;
	align-self: flex-start;
}

.tpl-vars-add-btn:hover { opacity: 1; }

/* Actions bar */
.tpl-editor-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 8px;
	padding-top: 12px;
	border-top: 1px solid oklch(0.30 0.05 80);
}

.tpl-editor-actions-right {
	display: flex;
	gap: 8px;
	margin-left: auto;
}

.tpl-btn {
	padding: 7px 16px;
	font-size: 13px;
	font-weight: 500;
	border-radius: 6px;
	cursor: pointer;
	border: none;
	font-family: inherit;
	transition: background 0.15s;
}

.tpl-btn-primary {
	background: var(--color-bg-hover);
	color: var(--color-text-white);
}

.tpl-btn-primary:hover { background: var(--color-accent-hover); }

.tpl-btn-secondary {
	background: oklch(0.28 0.06 80);
	color: var(--color-text-white);
}

.tpl-btn-secondary:hover { background: oklch(0.33 0.07 80); }

.tpl-btn-accent {
	background: oklch(0.50 0.16 145);
	color: white;
}

.tpl-btn-accent:hover { background: oklch(0.55 0.18 145); }

.tpl-btn-danger {
	background: oklch(0.35 0.12 20);
	color: oklch(0.85 0.10 20);
}

.tpl-btn-danger:hover { background: oklch(0.40 0.15 20); }

/* Status messages */
.tpl-status {
	position: fixed;
	bottom: 12px;
	right: 12px;
	padding: 8px 14px;
	font-size: 12px;
	border-radius: 6px;
	background: oklch(0.30 0.08 80);
	opacity: 0;
	transition: opacity 0.2s;
	pointer-events: none;
}

.tpl-status.visible { opacity: 1; }
.tpl-status.error { background: oklch(0.35 0.14 20); }
.tpl-status.success { background: oklch(0.35 0.14 145); }

/* Empty list state */
.tpl-list-empty {
	padding: 20px;
	text-align: center;
	opacity: 0.4;
	font-size: 13px;
}
```

**Step 2: Commit**

```bash
git add src/styles/templates.css
git commit -m "feat(templates): add template window CSS"
```

---

### Task 11: Variable Prompt CSS

**Files:**
- Create: `src/styles/variablePrompt.css`

**Step 1: Create the stylesheet**

Follow the addDue.css card pattern.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
	font-family: 'Nunito', -apple-system, sans-serif;
	background: transparent;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100vh;
	overflow: hidden;
}

.vp-card {
	background: var(--color-bg-elevated);
	border: 1px solid var(--color-border-primary);
	border-radius: 12px;
	padding: 20px 24px;
	width: 100%;
	max-width: 400px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.vp-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--color-text-primary);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vp-fields {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-height: 300px;
	overflow-y: auto;
}

.vp-field label {
	display: block;
	font-size: 12px;
	font-weight: 500;
	color: var(--color-text-secondary);
	margin-bottom: 3px;
}

.vp-field-desc {
	font-size: 11px;
	color: var(--color-text-tertiary);
	margin-bottom: 3px;
}

.vp-field input {
	width: 100%;
	padding: 8px 10px;
	font-size: 14px;
	border: 1px solid var(--color-border-primary);
	border-radius: 6px;
	background: var(--color-bg-primary);
	color: var(--color-text-primary);
	outline: none;
	transition: border-color 0.15s;
	font-family: inherit;
}

.vp-field input:focus {
	border-color: var(--color-border-focus);
}

.vp-field input.vp-error {
	border-color: var(--color-text-warning);
}

.vp-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 4px;
}

.vp-btn {
	padding: 7px 18px;
	font-size: 13px;
	font-weight: 500;
	border-radius: 6px;
	cursor: pointer;
	transition: background 0.15s, border-color 0.15s;
	font-family: inherit;
}

.vp-btn-cancel {
	background: var(--color-bg-primary);
	color: var(--color-text-primary);
	border: 1px solid var(--color-border-primary);
}

.vp-btn-cancel:hover {
	background: var(--color-bg-secondary);
}

.vp-btn-submit {
	background: var(--color-bg-hover);
	color: var(--color-text-white);
	border: 1px solid var(--color-bg-hover);
}

.vp-btn-submit:hover {
	background: var(--color-accent-hover);
	border-color: var(--color-accent-hover);
}
```

**Step 2: Commit**

```bash
git add src/styles/variablePrompt.css
git commit -m "feat(templates): add variable prompt CSS"
```

---

### Task 12: Variable Prompt Renderer Logic

**Files:**
- Create: `src/js/variablePromptWindow.js`

**Step 1: Create the renderer**

Listens for template data, renders variable fields, validates and submits.

```javascript
const { ipcRenderer: ipc } = require("electron");

let template = null;

const vpTitle = document.getElementById("vpTitle");
const vpFields = document.getElementById("vpFields");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");

ipc.on("variable-prompt-data", (_, data) => {
	template = data;
	render();
});

function render() {
	if (!template) return;
	vpTitle.textContent = template.title || "Use Template";
	vpFields.innerHTML = "";

	const variables = template.variables || [];
	if (variables.length === 0) {
		// No variables — submit immediately
		submitForm();
		return;
	}

	variables.forEach((v, i) => {
		const field = document.createElement("div");
		field.className = "vp-field";

		const label = document.createElement("label");
		label.textContent = v.label || v.key;
		label.setAttribute("for", `var-${v.key}`);
		field.appendChild(label);

		if (v.description) {
			const desc = document.createElement("div");
			desc.className = "vp-field-desc";
			desc.textContent = v.description;
			field.appendChild(desc);
		}

		const input = document.createElement("input");
		input.type = "text";
		input.id = `var-${v.key}`;
		input.dataset.key = v.key;
		input.placeholder = v.label || v.key;
		if (i === 0) input.autofocus = true;
		field.appendChild(input);

		vpFields.appendChild(field);
	});

	// Focus first input after render
	requestAnimationFrame(() => {
		const firstInput = vpFields.querySelector("input");
		firstInput?.focus();
	});
}

function collectVariables() {
	const variables = {};
	const inputs = vpFields.querySelectorAll("input[data-key]");
	let valid = true;

	inputs.forEach((input) => {
		const value = input.value.trim();
		if (!value) {
			input.classList.add("vp-error");
			valid = false;
		} else {
			input.classList.remove("vp-error");
		}
		variables[input.dataset.key] = value;
	});

	return { variables, valid };
}

function submitForm() {
	if (!template) return;

	const variables = template.variables || [];
	if (variables.length === 0) {
		ipc.send("variable-prompt-submit", {
			template_use: {
				template_id: template.id,
				template_rev: template.rev,
				variables: {},
			},
		});
		return;
	}

	const { variables: vars, valid } = collectVariables();
	if (!valid) return;

	ipc.send("variable-prompt-submit", {
		template_use: {
			template_id: template.id,
			template_rev: template.rev,
			variables: vars,
		},
	});
}

submitBtn.addEventListener("click", submitForm);

cancelBtn.addEventListener("click", () => {
	ipc.send("variable-prompt-close");
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		ipc.send("variable-prompt-close");
	}
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		submitForm();
	}
});
```

**Step 2: Commit**

```bash
git add src/js/variablePromptWindow.js
git commit -m "feat(templates): add variable prompt renderer logic"
```

---

### Task 13: Template Window Renderer Logic

**Files:**
- Create: `src/js/templateWindow.js`

This is the largest task. The renderer manages:
- Template list display and search
- Template editor form (create/edit)
- Variable rows management
- Tag management
- WebSocket event handling
- Template rev tracking for list mutations

**Step 1: Create the renderer**

```javascript
const { ipcRenderer: ipc } = require("electron");

// ---- State ----
let templates = [];           // full template objects
let selectedId = null;        // currently selected template id
let isNewMode = false;        // creating a new template (no id yet)
let searchDebounce = null;
let tags = [];                // current editor tags

// ---- DOM refs ----
const closeBtn = document.getElementById("closeBtn");
const searchInput = document.getElementById("searchInput");
const templateList = document.getElementById("templateList");
const newTemplateBtn = document.getElementById("newTemplateBtn");
const editorPanel = document.getElementById("editorPanel");
const editorEmpty = document.getElementById("editorEmpty");
const editorForm = document.getElementById("editorForm");
const tplTitle = document.getElementById("tplTitle");
const tplDescription = document.getElementById("tplDescription");
const tplCategory = document.getElementById("tplCategory");
const tplTagsInput = document.getElementById("tplTagsInput");
const tplTagsAddBtn = document.getElementById("tplTagsAddBtn");
const tplTagsList = document.getElementById("tplTagsList");
const tplPriority = document.getElementById("tplPriority");
const tplShowBeforeH = document.getElementById("tplShowBeforeH");
const tplShowBeforeM = document.getElementById("tplShowBeforeM");
const tplDueOffsetH = document.getElementById("tplDueOffsetH");
const tplDueOffsetM = document.getElementById("tplDueOffsetM");
const tplVarsList = document.getElementById("tplVarsList");
const tplVarsAddBtn = document.getElementById("tplVarsAddBtn");
const manageListsBtn = document.getElementById("manageListsBtn");
const useTemplateBtn = document.getElementById("useTemplateBtn");
const deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
const saveTemplateBtn = document.getElementById("saveTemplateBtn");

// ---- Init ----
ipc.send("template-list");

// ---- IPC Listeners ----
ipc.on("template-list", (_, data) => {
	templates = Array.isArray(data) ? data : [];
	renderList();
	// Re-select if we had one
	if (selectedId) {
		const still = templates.find((t) => t.id === selectedId);
		if (still) loadEditor(still);
		else clearEditor();
	}
});

ipc.on("template-search", (_, data) => {
	templates = Array.isArray(data) ? data : [];
	renderList();
});

ipc.on("template-created", (_, tpl) => {
	if (!tpl?.id) return;
	const idx = templates.findIndex((t) => t.id === tpl.id);
	if (idx >= 0) templates[idx] = tpl;
	else templates.unshift(tpl);
	renderList();
	if (isNewMode) {
		isNewMode = false;
		selectedId = tpl.id;
		loadEditor(tpl);
	}
});

ipc.on("template-updated", (_, tpl) => {
	if (!tpl?.id) return;
	const idx = templates.findIndex((t) => t.id === tpl.id);
	if (idx >= 0) templates[idx] = tpl;
	else templates.unshift(tpl);
	renderList();
	if (selectedId === tpl.id) loadEditor(tpl);
});

ipc.on("template-deleted", (_, data) => {
	const id = data?.id;
	if (!id) return;
	templates = templates.filter((t) => t.id !== id);
	renderList();
	if (selectedId === id) clearEditor();
});

// ---- List rendering ----
function renderList() {
	templateList.innerHTML = "";
	if (templates.length === 0) {
		templateList.innerHTML = '<div class="tpl-list-empty">No templates found</div>';
		return;
	}
	templates.forEach((tpl) => {
		const card = document.createElement("div");
		card.className = "tpl-card" + (tpl.id === selectedId ? " active" : "");
		card.dataset.id = tpl.id;

		const title = document.createElement("div");
		title.className = "tpl-card-title";
		title.textContent = tpl.title;
		card.appendChild(title);

		const meta = document.createElement("div");
		meta.className = "tpl-card-meta";
		meta.textContent = tpl.category || "Life";
		if (tpl.variables?.length) {
			meta.textContent += ` \u00b7 ${tpl.variables.length} var${tpl.variables.length > 1 ? "s" : ""}`;
		}
		card.appendChild(meta);

		card.addEventListener("click", () => {
			isNewMode = false;
			selectedId = tpl.id;
			loadEditor(tpl);
			renderList();
		});

		templateList.appendChild(card);
	});
}

// ---- Editor ----
function clearEditor() {
	selectedId = null;
	isNewMode = false;
	editorForm.style.display = "none";
	editorEmpty.style.display = "flex";
}

function loadEditor(tpl) {
	editorEmpty.style.display = "none";
	editorForm.style.display = "flex";

	tplTitle.value = tpl.title || "";
	tplDescription.value = tpl.description || "";
	tplCategory.value = tpl.category || "";
	tplPriority.value = tpl.priority?.Valid ? tpl.priority.Int32 : "";

	const showBefore = tpl.show_before_due_time || 0;
	tplShowBeforeH.value = Math.floor(showBefore / 60);
	tplShowBeforeM.value = showBefore % 60;

	const dueOffset = tpl.due_offset_minutes?.Valid ? tpl.due_offset_minutes.Int32 : 0;
	tplDueOffsetH.value = Math.floor(dueOffset / 60);
	tplDueOffsetM.value = dueOffset % 60;

	tags = Array.isArray(tpl.tags) ? [...tpl.tags] : [];
	renderTags();

	renderVariables(tpl.variables || []);

	deleteTemplateBtn.style.display = isNewMode ? "none" : "inline-block";
	manageListsBtn.style.display = isNewMode ? "none" : "inline-block";
	useTemplateBtn.style.display = isNewMode ? "none" : "inline-block";
}

function loadEmptyEditor() {
	editorEmpty.style.display = "none";
	editorForm.style.display = "flex";
	tplTitle.value = "";
	tplDescription.value = "";
	tplCategory.value = "";
	tplPriority.value = "";
	tplShowBeforeH.value = "0";
	tplShowBeforeM.value = "0";
	tplDueOffsetH.value = "0";
	tplDueOffsetM.value = "0";
	tags = [];
	renderTags();
	renderVariables([]);
	deleteTemplateBtn.style.display = "none";
	manageListsBtn.style.display = "none";
	useTemplateBtn.style.display = "none";
	tplTitle.focus();
}

// ---- Tags ----
function renderTags() {
	tplTagsList.innerHTML = "";
	tags.forEach((tag, i) => {
		const el = document.createElement("span");
		el.className = "tpl-tag";
		el.textContent = tag;
		el.title = "Click to remove";
		el.addEventListener("click", () => {
			tags.splice(i, 1);
			renderTags();
		});
		tplTagsList.appendChild(el);
	});
}

function addTag() {
	const val = tplTagsInput.value.trim();
	if (val && !tags.includes(val)) {
		tags.push(val);
		renderTags();
	}
	tplTagsInput.value = "";
	tplTagsInput.focus();
}

tplTagsAddBtn.addEventListener("click", addTag);
tplTagsInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") { e.preventDefault(); addTag(); }
});

// ---- Variables ----
function renderVariables(vars) {
	tplVarsList.innerHTML = "";
	vars.forEach((v, i) => addVariableRow(v));
}

function addVariableRow(v = {}) {
	const row = document.createElement("div");
	row.className = "tpl-var-row";

	const keyInput = document.createElement("input");
	keyInput.type = "text";
	keyInput.placeholder = "key";
	keyInput.value = v.key || "";
	keyInput.dataset.field = "key";
	row.appendChild(keyInput);

	const labelInput = document.createElement("input");
	labelInput.type = "text";
	labelInput.placeholder = "label";
	labelInput.value = v.label || "";
	labelInput.dataset.field = "label";
	row.appendChild(labelInput);

	const descInput = document.createElement("input");
	descInput.type = "text";
	descInput.placeholder = "description";
	descInput.value = v.description || "";
	descInput.dataset.field = "description";
	row.appendChild(descInput);

	const removeBtn = document.createElement("button");
	removeBtn.className = "tpl-var-remove-btn";
	removeBtn.textContent = "\u00d7";
	removeBtn.type = "button";
	removeBtn.addEventListener("click", () => row.remove());
	row.appendChild(removeBtn);

	tplVarsList.appendChild(row);
}

tplVarsAddBtn.addEventListener("click", () => addVariableRow());

// ---- Collect form data ----
function collectFormData() {
	const title = tplTitle.value.trim();
	if (!title) {
		tplTitle.focus();
		return null;
	}

	const variables = [];
	tplVarsList.querySelectorAll(".tpl-var-row").forEach((row) => {
		const key = row.querySelector('[data-field="key"]').value.trim();
		if (!key) return;
		const obj = { key };
		const label = row.querySelector('[data-field="label"]').value.trim();
		const desc = row.querySelector('[data-field="description"]').value.trim();
		if (label) obj.label = label;
		if (desc) obj.description = desc;
		variables.push(obj);
	});

	const priorityVal = parseInt(tplPriority.value, 10);
	const showBefore = (parseInt(tplShowBeforeH.value, 10) || 0) * 60 + (parseInt(tplShowBeforeM.value, 10) || 0);
	const dueOffsetTotal = (parseInt(tplDueOffsetH.value, 10) || 0) * 60 + (parseInt(tplDueOffsetM.value, 10) || 0);

	const data = {
		title,
		description: tplDescription.value.trim(),
		category: tplCategory.value.trim() || "Life",
		tags: [...tags],
		priority: Number.isFinite(priorityVal) && priorityVal >= 1 && priorityVal <= 10 ? priorityVal : null,
		show_before_due_time: showBefore,
		due_offset_minutes: dueOffsetTotal > 0 ? dueOffsetTotal : null,
		variables,
		last_modified_at: Date.now(),
	};

	return data;
}

// ---- Save ----
editorForm.addEventListener("submit", (e) => {
	e.preventDefault();
	const data = collectFormData();
	if (!data) return;

	if (isNewMode) {
		ipc.send("template-create", data);
	} else if (selectedId) {
		data.id = selectedId;
		ipc.send("template-edit", data);
	}
});

// ---- Delete ----
deleteTemplateBtn.addEventListener("click", () => {
	if (!selectedId) return;
	if (!confirm("Delete this template?")) return;
	ipc.send("template-delete", { id: selectedId });
});

// ---- New template ----
newTemplateBtn.addEventListener("click", () => {
	isNewMode = true;
	selectedId = null;
	loadEmptyEditor();
	renderList();
});

// ---- Manage Lists ----
manageListsBtn.addEventListener("click", () => {
	if (!selectedId) return;
	ipc.send("open-list-window", {
		target: { kind: "task_template", id: selectedId },
	});
});

// ---- Use Template ----
useTemplateBtn.addEventListener("click", () => {
	if (!selectedId) return;
	const tpl = templates.find((t) => t.id === selectedId);
	if (!tpl) return;
	ipc.send("open-variable-prompt", { template: tpl });
});

// ---- Search ----
searchInput.addEventListener("input", () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(() => {
		const query = searchInput.value.trim();
		if (query) {
			ipc.send("template-search", { search_query: query });
		} else {
			ipc.send("template-list");
		}
	}, 250);
});

// ---- Close ----
closeBtn.addEventListener("click", () => {
	window.close();
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") window.close();
});

// ---- Track template rev staleness from list mutations ----
// When a list mutation broadcast arrives for a task_template target, the template rev
// was silently incremented by the backend. We optimistically increment our local copy.
ipc.on("lists-surface-updated", (_, data) => {
	const target = data?.target;
	if (target?.kind !== "task_template") return;
	const tpl = templates.find((t) => t.id === target.id);
	if (tpl) {
		tpl.rev = (tpl.rev || 0) + 1;
	}
});
```

**Step 2: Commit**

```bash
git add src/js/templateWindow.js
git commit -m "feat(templates): add template window renderer logic"
```

---

### Task 14: Notify Template Window of List Surface Updates

**Files:**
- Modify: `src/main/controllers/listsController.js`

The template window needs to know when a template-owned list mutation succeeds so it can optimistically increment the local `rev`. The listsController already tracks surfaces and receives all list mutation broadcasts.

**Step 1: Find the surface notification code in listsController**

Look for where `handleTemplateMutation` notifies subscribers. After it pushes the payload to subscriber windows, also check if the surface target is `task_template` and if so, push a notification to the template window.

Add a new callback parameter `onTemplateSurfaceUpdated` to the constructor, and call it when a `task_template` surface receives a successful mutation:

In `createListsController` parameters, add:
```javascript
onTemplateSurfaceUpdated,
```

In the code that handles successful template mutations and notifies subscribers, after the subscriber notification loop, add:
```javascript
if (surface?.target?.kind === "task_template") {
	onTemplateSurfaceUpdated?.(surface.target);
}
```

**Step 2: Wire in main.js**

When creating `listsController` in `main.js` (line 214-222), add:
```javascript
onTemplateSurfaceUpdated: (target) => {
	const win = windowManager.getTemplateWindow?.();
	if (win && !win.isDestroyed()) {
		win.webContents.send("lists-surface-updated", { target });
	}
},
```

**Step 3: Commit**

```bash
git add src/main/controllers/listsController.js main.js
git commit -m "feat(templates): notify template window of list surface updates for rev tracking"
```

---

### Task 15: Socket Reconnect — Refetch Templates

**Files:**
- Modify: `src/main/socket/handlers.js`

Per the contract (section 6.1), after a WebSocket reconnect the frontend must re-issue `template_list` if a template surface is visible.

**Step 1: Add template refetch to the connected handler**

In the `setUpTasks` function (called by the `connected` event), after `listsController?.refetchAllActive?.()` (line 115), add:

```javascript
// Refetch templates if the template window is open
const templateWin = windowManager.getTemplateWindow?.();
if (templateWin && !templateWin.isDestroyed()) {
	templateWin.webContents.send("socket-reconnected");
}
```

Then in `src/js/templateWindow.js`, add a listener:
```javascript
ipc.on("socket-reconnected", () => {
	ipc.send("template-list");
});
```

**Step 2: Commit**

```bash
git add src/main/socket/handlers.js src/js/templateWindow.js
git commit -m "feat(templates): refetch templates on WebSocket reconnect"
```

---

### Task 16: End-to-End Manual Testing

**No files created. This is a verification task.**

**Step 1: Start the app**

```bash
npm start
```

**Step 2: Verify template window opens**

- Right-click taskbar → click "Templates" → template window should open
- Type `templates` in taskbar search input → template window should open

**Step 3: Verify template CRUD**

- Click "+ New Template" → editor form appears
- Fill in title "Call {{name}}", category "Work", add variable with key "name", label "Contact name"
- Click Save → template appears in left list
- Click the template → editor populates with saved data
- Edit the title → click Save → list updates
- Click Delete → confirm → template removed

**Step 4: Verify template use**

- Create a template with a variable
- Click "Use Template" → variable prompt modal appears
- Fill in the variable value → click "Create Task" → task appears in taskbar
- Verify the task title has the variable substituted

**Step 5: Verify Manage Lists**

- Create a template → click "Manage Lists" → list window opens with `task_template` target
- Create a list item → verify it works
- Close list window → click "Use Template" → created task should have the list

**Step 6: Verify error handling**

- Try saving a template with no title → should not submit
- Try using a template with blank variables → fields highlighted red

---

### Task 17: Final Commit and Cleanup

**Step 1: Verify git status is clean**

```bash
git status
```

All files should be committed. No untracked files from the implementation.

**Step 2: If any loose files remain, clean up and commit**

```bash
git add -A && git commit -m "chore: clean up template implementation"
```
