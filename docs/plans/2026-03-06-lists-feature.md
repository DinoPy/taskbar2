# Lists Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add checklist/workflow/routine lists to tasks, schedules, occurrences, and notifications with real-time WebSocket sync, a dedicated list editor window, and inline progress summaries in existing windows.

**Architecture:** Hybrid approach — a new ListsController in the main process manages all list state centrally, a dedicated List Window handles full CRUD and runtime interaction, and inline progress summaries appear in the edit, notifications, calendar, and reminder windows. All state flows through the controller; windows never cache independently.

**Tech Stack:** Electron (BrowserWindow), vanilla JS DOM manipulation, WebSocket via existing socket client, CSS with existing design token system.

**Contract reference:** `docs/frontend_lists_ws_contract.md`

---

### Task 1: ListsController — Core State Management

**Files:**
- Create: `src/main/controllers/listsController.js`

**Step 1: Create the controller with state and helper methods**

```js
export function createListsController({ sendEvent, log }) {
	const logger = log ?? console.log;

	// surfaces keyed by "kind:id" e.g. "task:abc-123"
	const surfaces = new Map();
	// windowId -> Set of surfaceKeys this window is subscribed to
	const windowSubscriptions = new Map();
	// surfaceKey -> Set of windowIds watching it
	const surfaceSubscribers = new Map();
	// run_id -> surfaceKey for fast runtime event lookup
	const runIndex = new Map();

	const surfaceKey = (target) => `${target.kind}:${target.id}`;

	const rebuildRunIndex = (key, lists) => {
		// Remove old entries for this surface
		for (const [runId, sk] of runIndex) {
			if (sk === key) runIndex.delete(runId);
		}
		// Add new entries
		if (!Array.isArray(lists)) return;
		for (const bundle of lists) {
			if (bundle.run?.id) {
				runIndex.set(bundle.run.id, key);
			}
		}
	};

	const getSubscriberWindows = (key) => {
		return surfaceSubscribers.get(key) ?? new Set();
	};

	const pushToSubscribers = (key, channel, payload) => {
		const subscribers = getSubscriberWindows(key);
		for (const windowId of subscribers) {
			if (windowId._pushFn) {
				windowId._pushFn(channel, payload);
			}
		}
	};

	return {
		subscribe(target, windowRef) {
			const key = surfaceKey(target);
			if (!surfaceSubscribers.has(key)) {
				surfaceSubscribers.set(key, new Set());
			}
			surfaceSubscribers.get(key).add(windowRef);

			if (!windowSubscriptions.has(windowRef)) {
				windowSubscriptions.set(windowRef, new Set());
			}
			windowSubscriptions.get(windowRef).add(key);

			// If we already have data, push immediately
			const existing = surfaces.get(key);
			if (existing) {
				if (windowRef._pushFn) {
					windowRef._pushFn("lists-data", existing);
				}
			}
		},

		unsubscribe(windowRef) {
			const keys = windowSubscriptions.get(windowRef);
			if (!keys) return;

			for (const key of keys) {
				const subs = surfaceSubscribers.get(key);
				if (subs) {
					subs.delete(windowRef);
					if (subs.size === 0) {
						surfaceSubscribers.delete(key);
						// Clean up surface state and run index
						surfaces.delete(key);
						for (const [runId, sk] of runIndex) {
							if (sk === key) runIndex.delete(runId);
						}
					}
				}
			}
			windowSubscriptions.delete(windowRef);
		},

		fetchForTarget(target, windowRef) {
			this.subscribe(target, windowRef);
			sendEvent("lists_fetch", { target });
		},

		sendMutation(event, data) {
			sendEvent(event, {
				...data,
				last_modified_at: data.last_modified_at || Date.now(),
			});
		},

		// Called by socket handlers for full-payload responses
		handleListsTarget(payload) {
			if (!payload?.target) return;
			const key = surfaceKey(payload.target);
			surfaces.set(key, payload);
			rebuildRunIndex(key, payload.lists);
			pushToSubscribers(key, "lists-data", payload);
		},

		// Called by socket handlers for template mutation broadcasts
		// These all return full ListsTargetPayload
		handleTemplateMutation(payload) {
			this.handleListsTarget(payload);
		},

		// Called by socket handlers for list_run_item_updated
		handleRunItemUpdated(runItem) {
			if (!runItem?.run_id) return;
			const key = runIndex.get(runItem.run_id);
			if (!key) return;
			const surface = surfaces.get(key);
			if (!surface?.lists) return;

			for (const bundle of surface.lists) {
				if (bundle.run?.id !== runItem.run_id) continue;
				if (!Array.isArray(bundle.run_items)) continue;
				const idx = bundle.run_items.findIndex((ri) => ri.id === runItem.id);
				if (idx >= 0) {
					bundle.run_items[idx] = runItem;
				}
				break;
			}
			pushToSubscribers(key, "lists-data", surface);
		},

		// Called by socket handlers for list_run_updated
		handleRunUpdated(run) {
			if (!run?.id) return;
			const key = runIndex.get(run.id);
			if (!key) return;
			const surface = surfaces.get(key);
			if (!surface?.lists) return;

			for (const bundle of surface.lists) {
				if (bundle.run?.id !== run.id) continue;
				bundle.run = run;
				break;
			}
			pushToSubscribers(key, "lists-data", surface);
		},

		// Called by socket handlers for connection_error with list types
		handleListError(errorPayload) {
			// Push error to all subscribers of all surfaces
			// The error doesn't specify which surface, so broadcast to all
			for (const [key] of surfaceSubscribers) {
				pushToSubscribers(key, "lists-error", errorPayload);
			}
		},

		// Called on reconnect — refetch all surfaces with active subscribers
		refetchAllActive() {
			for (const [key] of surfaceSubscribers) {
				const [kind, id] = key.split(":");
				if (kind && id) {
					sendEvent("lists_fetch", { target: { kind, id } });
				}
			}
		},

		// Get surface data for a target (used by inline summaries)
		getSurface(target) {
			return surfaces.get(surfaceKey(target)) ?? null;
		},

		// Get all active surface keys (for debugging)
		getActiveSurfaces() {
			return Array.from(surfaceSubscribers.keys());
		},
	};
}
```

**Step 2: Verify the file is syntactically valid**

Run: `node -c src/main/controllers/listsController.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add src/main/controllers/listsController.js
git commit -m "feat(lists): add ListsController for centralized list state management"
```

---

### Task 2: Wire ListsController into Main Process

**Files:**
- Modify: `main.js:1-10` (imports), `main.js:187-209` (controller creation), `main.js:328-386` (socket handlers + IPC registration)

**Step 1: Add import**

At `main.js:32` (after calendarController import), add:

```js
import { createListsController } from "./src/main/controllers/listsController.js";
```

**Step 2: Create controller instance**

After `calendarController` creation (after line 208), add:

```js
const listsController = createListsController({
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
	log: (...args) => console.log(...args),
});
```

**Step 3: Pass to socket handlers**

Add `listsController` to the `createSocketHandlers` call at line 328:

```js
const {
	handleSocketConnect,
	handleSocketDisconnect,
	eventHandlers: socketEventHandlers,
} = createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow: () => windowManager.getTaskbarWindow(),
	notificationsController,
	schedulesController,
	calendarController,
	listsController,  // ADD THIS
});
```

**Step 4: Pass to IPC handlers**

Add `listsController` to `registerIpcHandlers` call at line 361:

```js
registerIpcHandlers({
	// ...existing params...
	listsController,  // ADD THIS
	// ...rest...
});
```

**Step 5: Verify app starts**

Run: `npm start`
Expected: App launches without errors (lists not yet connected to UI)

**Step 6: Commit**

```bash
git add main.js
git commit -m "feat(lists): wire ListsController into main process"
```

---

### Task 3: Socket Handlers for Lists

**Files:**
- Modify: `src/main/socket/handlers.js:1-11` (params), `src/main/socket/handlers.js:129-483` (eventHandlers)

**Step 1: Add listsController to destructured params**

At line 1, add `listsController` to the destructured parameter:

```js
export function createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow,
	notificationsController,
	schedulesController,
	calendarController,
	listsController,  // ADD THIS
}) {
```

**Step 2: Add reconnect refetch to setUpTasks**

At the end of `setUpTasks` function (after line 112, before the closing `}`), add:

```js
		// Refetch any active list surfaces after reconnect
		listsController?.refetchAllActive?.();
```

**Step 3: Add list event handlers to eventHandlers object**

Before the closing `};` of `eventHandlers` (before line 483), add the list handlers:

```js
		// ── List Events ──────────────────────────────────────
		lists_target: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleListsTarget?.(payload);
		},
		list_created: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_deleted: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		lists_reordered: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_created: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_deleted: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_items_reordered: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_run_item_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleRunItemUpdated?.(payload);
		},
		list_run_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try { payload = JSON.parse(data); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleRunUpdated?.(payload);
		},
```

**Step 4: Enhance connection_error handler to route list errors**

Modify the existing `connection_error` handler (line 168) to also forward to listsController:

```js
		connection_error: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try {
					payload = JSON.parse(payload);
				} catch {
					payload = { message: payload };
				}
			}
			const normalized = payload && typeof payload === "object" ? payload : {};
			calendarController?.handleConnectionError?.(normalized);
			// Route list-specific errors to listsController
			const listErrorTypes = new Set([
				"invalid_list_target", "invalid_list_item_type", "list_run_locked",
				"list_owner_locked", "task_blocked_by_list",
			]);
			if (listErrorTypes.has(normalized.type)) {
				listsController?.handleListError?.(normalized);
			}
			broadcast("socket-connection-error", normalized);
		},
```

**Step 5: Verify syntax**

Run: `node -c src/main/socket/handlers.js`
Expected: No syntax errors

**Step 6: Commit**

```bash
git add src/main/socket/handlers.js
git commit -m "feat(lists): add WebSocket event handlers for all list events"
```

---

### Task 4: IPC Handlers for Lists

**Files:**
- Modify: `src/main/ipc/registerHandlers.js:1-26` (params), append new handlers at end

**Step 1: Add listsController to destructured params**

Add `listsController` to the function parameter at line 1:

```js
export function registerIpcHandlers({
	ipc,
	appState,
	windowManager,
	// ...existing params...
	listsController,  // ADD THIS
	// ...rest...
}) {
```

**Step 2: Add IPC listeners at the end of the function**

Before the closing `}` of `registerIpcHandlers`, add:

```js
	// ── List IPC Handlers ──────────────────────────────────

	ipc.on("lists-fetch", (event, data) => {
		if (!data?.target) return;
		const senderWindow = event?.sender;
		if (!senderWindow) return;
		const windowRef = {
			_id: senderWindow.id,
			_pushFn: (channel, payload) => {
				try {
					if (!senderWindow.isDestroyed()) {
						senderWindow.send(channel, payload);
					}
				} catch { /* window closed */ }
			},
		};
		listsController?.fetchForTarget?.(data.target, windowRef);
	});

	ipc.on("lists-unsubscribe", (event) => {
		const senderWindow = event?.sender;
		if (!senderWindow) return;
		// Find and unsubscribe the windowRef matching this sender
		listsController?.unsubscribe?.({
			_id: senderWindow.id,
			_pushFn: () => {},
		});
	});

	ipc.on("lists-mutation", (_, data) => {
		if (!data?.event) return;
		listsController?.sendMutation?.(data.event, data.data ?? {});
	});
```

**Step 3: Fix unsubscribe to work with sender ID matching**

The unsubscribe above won't match because it creates a new object. We need to update the controller to match by `_id`. Update `listsController.js` — replace the `subscribe` and `unsubscribe` methods to use a Map keyed by `_id`:

In `src/main/controllers/listsController.js`, replace the subscriber tracking to use `_id` based lookup:

```js
	// Change surfaceSubscribers to: surfaceKey -> Map<windowId, windowRef>
	// Change windowSubscriptions to: windowId -> Set<surfaceKey>
```

Actually, let's keep it simpler. Change `surfaceSubscribers` from `Map<key, Set<windowRef>>` to `Map<key, Map<windowId, windowRef>>`:

In `listsController.js`:
- `surfaceSubscribers`: `Map<surfaceKey, Map<number, windowRef>>`
- `windowSubscriptions`: `Map<number, Set<surfaceKey>>`

Replace the subscribe/unsubscribe/push methods:

```js
		subscribe(target, windowRef) {
			const key = surfaceKey(target);
			const wId = windowRef._id;
			if (!surfaceSubscribers.has(key)) {
				surfaceSubscribers.set(key, new Map());
			}
			surfaceSubscribers.get(key).set(wId, windowRef);

			if (!windowSubscriptions.has(wId)) {
				windowSubscriptions.set(wId, new Set());
			}
			windowSubscriptions.get(wId).add(key);

			const existing = surfaces.get(key);
			if (existing && windowRef._pushFn) {
				windowRef._pushFn("lists-data", existing);
			}
		},

		unsubscribe(windowRef) {
			const wId = windowRef._id;
			const keys = windowSubscriptions.get(wId);
			if (!keys) return;

			for (const key of keys) {
				const subs = surfaceSubscribers.get(key);
				if (subs) {
					subs.delete(wId);
					if (subs.size === 0) {
						surfaceSubscribers.delete(key);
						surfaces.delete(key);
						for (const [runId, sk] of runIndex) {
							if (sk === key) runIndex.delete(runId);
						}
					}
				}
			}
			windowSubscriptions.delete(wId);
		},
```

And update `pushToSubscribers`:

```js
	const pushToSubscribers = (key, channel, payload) => {
		const subscribers = surfaceSubscribers.get(key);
		if (!subscribers) return;
		for (const [, windowRef] of subscribers) {
			if (windowRef._pushFn) {
				windowRef._pushFn(channel, payload);
			}
		}
	};
```

**Step 4: Verify syntax**

Run: `node -c src/main/ipc/registerHandlers.js && node -c src/main/controllers/listsController.js`
Expected: No syntax errors

**Step 5: Commit**

```bash
git add src/main/ipc/registerHandlers.js src/main/controllers/listsController.js
git commit -m "feat(lists): add IPC handlers for list fetch, unsubscribe, mutation"
```

---

### Task 5: List Window — BrowserWindow Factory

**Files:**
- Create: `src/main/windows/listWindow.js`

**Step 1: Create the window factory**

Follow the exact pattern from `src/main/windows/editWindow.js`:

```js
import { BrowserWindow, screen } from "electron";

export const createListWindow = ({
	props,
	onClose,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const windowWidth = 680;
	const windowHeight = 520;
	const listWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - windowWidth / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.15),
		width: windowWidth,
		height: windowHeight,
		minWidth: 500,
		minHeight: 400,
		minimizable: false,
		resizable: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		transparent: true,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	listWindow.setBackgroundColor("#1b1d23");
	listWindow.loadFile("src/html/list.html");

	listWindow.webContents.once("dom-ready", () => {
		listWindow.show();
	});

	listWindow.webContents.once("did-finish-load", () => {
		listWindow.webContents.send("data-from-parent", props);
	});

	listWindow.on("ready-to-show", () => listWindow.focus());

	if (onClose) {
		listWindow.on("close", onClose);
	}

	return listWindow;
};
```

**Step 2: Verify syntax**

Run: `node -c src/main/windows/listWindow.js`

**Step 3: Commit**

```bash
git add src/main/windows/listWindow.js
git commit -m "feat(lists): add List Window BrowserWindow factory"
```

---

### Task 6: Register List Window in WindowManager

**Files:**
- Modify: `src/main/controllers/windowManager.js:1-16` (params), `src/main/controllers/windowManager.js:17-32` (state), add methods
- Modify: `main.js` (import + pass factory)

**Step 1: Add createListWindow to WindowManager params and state**

In `windowManager.js` line 1, add `createListWindow` to params:

```js
export function createWindowManager({
	// ...existing...
	createListWindow,  // ADD THIS
}) {
```

In state (line 17-32), add:

```js
		listWindows: new Map(),  // keyed by "kind:id"
```

**Step 2: Add list window management methods**

Before the closing `};` of the return object, add:

```js
		openListWindow({ target, props, onClose }) {
			const key = `${target.kind}:${target.id}`;
			const existing = state.listWindows.get(key);
			if (existing && !existing.isDestroyed()) {
				existing.focus();
				return existing;
			}
			const win = createListWindow({
				props: { target, ...props },
				onClose: () => {
					state.listWindows.delete(key);
					onClose?.();
				},
			});
			state.listWindows.set(key, win);
			return win;
		},

		getListWindow(target) {
			const key = `${target.kind}:${target.id}`;
			const win = state.listWindows.get(key);
			if (win && !win.isDestroyed()) return win;
			state.listWindows.delete(key);
			return null;
		},

		closeListWindow(target) {
			const key = `${target.kind}:${target.id}`;
			const win = state.listWindows.get(key);
			if (win && !win.isDestroyed()) {
				win.close();
			}
		},

		closeAllListWindows() {
			for (const [key, win] of state.listWindows) {
				if (win && !win.isDestroyed()) win.close();
			}
		},

		getAllListWindows() {
			return Array.from(state.listWindows.values()).filter(w => w && !w.isDestroyed());
		},
```

**Step 3: Wire factory in main.js**

Add import at top of `main.js` (after line 23):

```js
import { createListWindow as createListBrowserWindow } from "./src/main/windows/listWindow.js";
```

Add to windowManager creation (after line 113):

```js
	createListWindow: createListBrowserWindow,
```

Add list window cleanup to `handleCloseAppRequest` (after line 418):

```js
	windowManager.closeAllListWindows();
```

Add to devtools shortcut (after line 462):

```js
		windowManager.getAllListWindows().forEach((lw) => lw.webContents.openDevTools());
```

**Step 4: Add IPC handler for opening list window**

In `src/main/ipc/registerHandlers.js`, add to the list IPC handlers section:

```js
	ipc.on("open-list-window", (_, data) => {
		if (!data?.target) return;
		windowManager.openListWindow({
			target: data.target,
			props: data.props ?? {},
		});
	});
```

**Step 5: Verify syntax**

Run: `node -c src/main/controllers/windowManager.js && node -c main.js`

**Step 6: Commit**

```bash
git add src/main/controllers/windowManager.js main.js src/main/ipc/registerHandlers.js
git commit -m "feat(lists): register List Window in WindowManager with per-target singleton"
```

---

### Task 7: List Window HTML Template

**Files:**
- Create: `src/html/list.html`

**Step 1: Create the HTML template**

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Lists</title>
		<link href="../styles/variables.css" rel="stylesheet" />
		<link href="../styles/list.css" rel="stylesheet" />
		<script src="../js/listWindow.js" defer type="module"></script>
	</head>
	<body class="list-body">
		<header class="list-header">
			<h1 class="list-header-title">Lists</h1>
			<span class="list-header-target"></span>
			<img class="close-icon" id="closeBtn" src="../images/close.svg" title="Close" />
		</header>

		<div class="list-container">
			<!-- Left panel: list definitions -->
			<aside class="list-sidebar">
				<div class="list-sidebar-items" id="listSidebarItems"></div>
				<button class="btn list-add-btn" id="addListBtn">+ Add list</button>
			</aside>

			<!-- Right panel: items + run -->
			<section class="list-main">
				<!-- Template items section -->
				<div class="list-template-section" id="templateSection">
					<div class="list-template-header">
						<h2 class="list-section-title">Items</h2>
						<button class="btn list-add-item-btn" id="addItemBtn">+ Add item</button>
					</div>
					<div class="list-items-container" id="listItemsContainer"></div>
				</div>

				<!-- Run progress section -->
				<div class="list-run-section" id="runSection" style="display:none;">
					<div class="list-run-header">
						<h2 class="list-section-title">Progress</h2>
						<div class="list-run-progress-bar">
							<div class="list-run-progress-fill" id="progressFill"></div>
						</div>
						<span class="list-run-progress-text" id="progressText">0/0</span>
					</div>
					<div class="list-run-items-container" id="runItemsContainer"></div>
				</div>

				<!-- Empty state -->
				<div class="list-empty-state" id="emptyState">
					<p>No lists yet</p>
					<p class="list-empty-hint">Click "+ Add list" to create your first list</p>
				</div>
			</section>
		</div>

		<!-- Add list dialog -->
		<dialog class="list-dialog" id="addListDialog">
			<h3>New List</h3>
			<input type="text" id="listTitleInput" placeholder="List title" />
			<div class="list-dialog-kind-selector">
				<label><input type="radio" name="listKind" value="checklist" checked /> Checklist</label>
				<label><input type="radio" name="listKind" value="workflow" /> Workflow</label>
				<label><input type="radio" name="listKind" value="routine" /> Routine</label>
			</div>
			<div class="list-dialog-actions">
				<button class="btn submitBtn" id="createListBtn">Create</button>
				<button class="btn cancelBtn" id="cancelListBtn">Cancel</button>
			</div>
		</dialog>

		<!-- Add item dialog -->
		<dialog class="list-dialog" id="addItemDialog">
			<h3 id="itemDialogTitle">New Item</h3>
			<input type="text" id="itemTitleInput" placeholder="Item title" />
			<div class="list-dialog-type-selector">
				<label><input type="radio" name="itemType" value="checkbox" checked /> Checkbox</label>
				<label><input type="radio" name="itemType" value="timer" /> Timer</label>
				<label><input type="radio" name="itemType" value="note" /> Note</label>
			</div>
			<div class="list-dialog-timer-config" id="timerConfigSection" style="display:none;">
				<label>Duration (minutes): <input type="number" id="timerDurationInput" min="1" value="25" /></label>
			</div>
			<div class="list-dialog-item-options">
				<label><input type="checkbox" id="itemRequiredCheck" checked /> Required</label>
			</div>
			<textarea id="itemDescriptionInput" placeholder="Description (optional)" rows="2"></textarea>
			<div class="list-dialog-actions">
				<button class="btn submitBtn" id="createItemBtn">Create</button>
				<button class="btn cancelBtn" id="cancelItemBtn">Cancel</button>
			</div>
		</dialog>

		<!-- Footer -->
		<footer class="list-footer" id="listFooter">
			<span class="list-footer-owner" id="footerOwner"></span>
			<span class="list-footer-rev" id="footerRev"></span>
			<span class="list-footer-status" id="footerStatus"></span>
		</footer>
	</body>
</html>
```

**Step 2: Commit**

```bash
git add src/html/list.html
git commit -m "feat(lists): add List Window HTML template"
```

---

### Task 8: List Window CSS

**Files:**
- Create: `src/styles/list.css`

**Step 1: Create the stylesheet**

```css
.list-body {
	margin: 0;
	padding: 0;
	background: var(--color-bg-root);
	color: var(--color-text-white);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: var(--font-size-md);
	display: flex;
	flex-direction: column;
	height: 100vh;
	overflow: hidden;
	border-radius: var(--border-radius-lg);
	border: 1px solid var(--color-border-primary);
}

/* Header */
.list-header {
	display: flex;
	align-items: center;
	padding: var(--spacing-sm) var(--spacing-md);
	background: oklch(0.30 0.08 80);
	border-bottom: 1px solid var(--color-border-primary);
	-webkit-app-region: drag;
	flex-shrink: 0;
}

.list-header-title {
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-semibold);
	margin: 0;
	margin-right: var(--spacing-sm);
}

.list-header-target {
	font-size: var(--font-size-sm);
	opacity: 0.7;
	flex: 1;
}

.close-icon {
	width: 16px;
	height: 16px;
	cursor: pointer;
	opacity: 0.7;
	-webkit-app-region: no-drag;
}

.close-icon:hover {
	opacity: 1;
}

/* Container */
.list-container {
	display: flex;
	flex: 1;
	overflow: hidden;
}

/* Sidebar */
.list-sidebar {
	width: 180px;
	min-width: 140px;
	border-right: 1px solid var(--color-border-primary);
	display: flex;
	flex-direction: column;
	padding: var(--spacing-sm);
	gap: var(--spacing-xs);
	overflow-y: auto;
}

.list-sidebar-item {
	padding: var(--spacing-xs) var(--spacing-sm);
	border-radius: var(--border-radius-md);
	cursor: pointer;
	font-size: var(--font-size-sm);
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
	transition: background var(--transition-fast);
}

.list-sidebar-item:hover {
	background: oklch(0.35 0.06 80);
}

.list-sidebar-item.active {
	background: oklch(0.40 0.10 80);
	font-weight: var(--font-weight-medium);
}

.list-sidebar-item-kind {
	font-size: var(--font-size-xs);
	opacity: 0.5;
}

.list-sidebar-item-actions {
	margin-left: auto;
	display: flex;
	gap: 2px;
	opacity: 0;
}

.list-sidebar-item:hover .list-sidebar-item-actions {
	opacity: 0.7;
}

.list-sidebar-item-actions button {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 2px;
	font-size: var(--font-size-xs);
}

.list-sidebar-item-actions button:hover {
	opacity: 1;
}

.list-add-btn {
	margin-top: auto;
	font-size: var(--font-size-sm);
	padding: var(--spacing-xs) var(--spacing-sm);
	background: transparent;
	border: 1px dashed var(--color-border-primary);
	color: var(--color-text-white);
	border-radius: var(--border-radius-md);
	cursor: pointer;
	opacity: 0.7;
}

.list-add-btn:hover {
	opacity: 1;
	background: oklch(0.30 0.06 80);
}

/* Main panel */
.list-main {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.list-template-section,
.list-run-section {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	min-height: 0;
}

.list-template-header,
.list-run-header {
	display: flex;
	align-items: center;
	padding: var(--spacing-sm) var(--spacing-md);
	gap: var(--spacing-sm);
	flex-shrink: 0;
	border-bottom: 1px solid oklch(0.35 0.04 80);
}

.list-section-title {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	opacity: 0.7;
	margin: 0;
}

.list-add-item-btn {
	margin-left: auto;
	font-size: var(--font-size-xs);
	padding: 2px var(--spacing-sm);
	background: transparent;
	border: 1px solid var(--color-border-primary);
	color: var(--color-text-white);
	border-radius: var(--border-radius-md);
	cursor: pointer;
	opacity: 0.7;
}

.list-add-item-btn:hover {
	opacity: 1;
}

/* Items container */
.list-items-container,
.list-run-items-container {
	flex: 1;
	overflow-y: auto;
	padding: var(--spacing-sm);
}

/* Template item row */
.list-item-row {
	display: flex;
	align-items: center;
	padding: var(--spacing-xs) var(--spacing-sm);
	border-radius: var(--border-radius-md);
	gap: var(--spacing-sm);
	margin-bottom: 2px;
}

.list-item-row:hover {
	background: oklch(0.32 0.04 80);
}

.list-item-type-icon {
	font-size: var(--font-size-sm);
	width: 20px;
	text-align: center;
	flex-shrink: 0;
}

.list-item-title {
	flex: 1;
	font-size: var(--font-size-sm);
}

.list-item-meta {
	font-size: var(--font-size-xs);
	opacity: 0.5;
}

.list-item-actions {
	display: flex;
	gap: 2px;
	opacity: 0;
}

.list-item-row:hover .list-item-actions {
	opacity: 0.7;
}

.list-item-actions button {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 2px 4px;
	font-size: var(--font-size-xs);
	border-radius: var(--border-radius-sm);
}

.list-item-actions button:hover {
	background: oklch(0.40 0.06 80);
}

.list-item-children {
	padding-left: var(--spacing-lg);
}

/* Run item row */
.list-run-item {
	display: flex;
	align-items: center;
	padding: var(--spacing-xs) var(--spacing-sm);
	border-radius: var(--border-radius-md);
	gap: var(--spacing-sm);
	margin-bottom: 2px;
}

.list-run-item:hover {
	background: oklch(0.32 0.04 80);
}

.list-run-item.completed {
	opacity: 0.5;
}

.list-run-item-checkbox {
	width: 18px;
	height: 18px;
	cursor: pointer;
	accent-color: var(--color-status-success);
}

.list-run-item-title {
	flex: 1;
	font-size: var(--font-size-sm);
}

.list-run-item.completed .list-run-item-title {
	text-decoration: line-through;
}

/* Timer controls */
.list-run-timer {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
	font-size: var(--font-size-xs);
	font-variant-numeric: tabular-nums;
}

.list-run-timer-btn {
	background: none;
	border: 1px solid var(--color-border-primary);
	color: inherit;
	cursor: pointer;
	padding: 2px 6px;
	font-size: var(--font-size-xs);
	border-radius: var(--border-radius-md);
}

.list-run-timer-btn:hover {
	background: oklch(0.40 0.08 80);
}

.list-run-timer-btn.running {
	border-color: var(--color-status-warning);
	color: var(--color-status-warning);
}

/* Note input */
.list-run-note-input {
	width: 100%;
	background: oklch(0.28 0.04 80);
	border: 1px solid oklch(0.40 0.04 80);
	color: var(--color-text-white);
	padding: var(--spacing-xs) var(--spacing-sm);
	border-radius: var(--border-radius-md);
	font-size: var(--font-size-sm);
	resize: vertical;
	min-height: 32px;
	font-family: inherit;
}

.list-run-note-input:focus {
	outline: none;
	border-color: var(--color-border-focus);
}

/* Progress bar */
.list-run-progress-bar {
	flex: 1;
	height: 6px;
	background: oklch(0.30 0.04 80);
	border-radius: 3px;
	overflow: hidden;
	max-width: 200px;
}

.list-run-progress-fill {
	height: 100%;
	background: var(--color-status-success);
	border-radius: 3px;
	transition: width 0.3s ease;
}

.list-run-progress-text {
	font-size: var(--font-size-xs);
	opacity: 0.7;
	min-width: 30px;
}

/* Empty state */
.list-empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	flex: 1;
	opacity: 0.5;
	gap: var(--spacing-xs);
}

.list-empty-hint {
	font-size: var(--font-size-sm);
}

/* Footer */
.list-footer {
	display: flex;
	align-items: center;
	padding: var(--spacing-xs) var(--spacing-md);
	font-size: var(--font-size-xs);
	opacity: 0.5;
	border-top: 1px solid oklch(0.35 0.04 80);
	gap: var(--spacing-md);
	flex-shrink: 0;
}

/* Dialogs */
.list-dialog {
	background: oklch(0.28 0.06 80);
	color: var(--color-text-white);
	border: 1px solid var(--color-border-primary);
	border-radius: var(--border-radius-lg);
	padding: var(--spacing-md);
	min-width: 300px;
}

.list-dialog::backdrop {
	background: rgba(0, 0, 0, 0.5);
}

.list-dialog h3 {
	margin: 0 0 var(--spacing-sm);
	font-size: var(--font-size-xl);
}

.list-dialog input[type="text"],
.list-dialog input[type="number"],
.list-dialog textarea {
	width: 100%;
	padding: var(--spacing-xs) var(--spacing-sm);
	background: oklch(0.22 0.04 80);
	border: 1px solid var(--color-border-primary);
	color: var(--color-text-white);
	border-radius: var(--border-radius-md);
	font-size: var(--font-size-md);
	margin-bottom: var(--spacing-sm);
	box-sizing: border-box;
	font-family: inherit;
}

.list-dialog input:focus,
.list-dialog textarea:focus {
	outline: none;
	border-color: var(--color-border-focus);
}

.list-dialog-kind-selector,
.list-dialog-type-selector,
.list-dialog-item-options {
	display: flex;
	gap: var(--spacing-md);
	margin-bottom: var(--spacing-sm);
	font-size: var(--font-size-sm);
}

.list-dialog-actions {
	display: flex;
	gap: var(--spacing-sm);
	justify-content: flex-end;
	margin-top: var(--spacing-sm);
}

.list-dialog-actions .btn {
	padding: var(--spacing-xs) var(--spacing-md);
	border: none;
	border-radius: var(--border-radius-md);
	cursor: pointer;
	font-size: var(--font-size-sm);
}

.list-dialog-actions .submitBtn {
	background: var(--color-button-primary);
	color: white;
}

.list-dialog-actions .submitBtn:hover {
	background: var(--color-button-primary-hover);
}

.list-dialog-actions .cancelBtn {
	background: var(--color-button-secondary);
	color: var(--color-text-white);
}

.list-dialog-actions .cancelBtn:hover {
	background: var(--color-button-secondary-hover);
}

/* Read-only state */
.list-readonly .list-add-btn,
.list-readonly .list-add-item-btn,
.list-readonly .list-item-actions,
.list-readonly .list-sidebar-item-actions {
	display: none;
}

.list-run-readonly .list-run-item-checkbox {
	pointer-events: none;
	opacity: 0.5;
}

.list-run-readonly .list-run-timer-btn {
	pointer-events: none;
	opacity: 0.5;
}

.list-run-readonly .list-run-note-input {
	pointer-events: none;
	opacity: 0.5;
}

/* Reorder buttons */
.list-item-reorder {
	display: flex;
	flex-direction: column;
	gap: 0;
	opacity: 0;
}

.list-item-row:hover .list-item-reorder {
	opacity: 0.7;
}

.list-item-reorder button {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 0;
	font-size: 9px;
	line-height: 1;
}

.list-item-reorder button:hover {
	opacity: 1;
}

/* Error toast */
.list-error-toast {
	position: fixed;
	bottom: 40px;
	left: 50%;
	transform: translateX(-50%);
	background: var(--color-status-error);
	color: white;
	padding: var(--spacing-xs) var(--spacing-md);
	border-radius: var(--border-radius-md);
	font-size: var(--font-size-sm);
	z-index: 100;
	animation: fadeInOut 3s ease forwards;
}

@keyframes fadeInOut {
	0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
	15% { opacity: 1; transform: translateX(-50%) translateY(0); }
	85% { opacity: 1; }
	100% { opacity: 0; }
}
```

**Step 2: Commit**

```bash
git add src/styles/list.css
git commit -m "feat(lists): add List Window CSS stylesheet"
```

---

### Task 9: List Window — Renderer Logic

**Files:**
- Create: `src/js/listWindow.js`

**Step 1: Create the full renderer logic**

This is the largest file. It handles:
- Receiving data from main via IPC
- Rendering list sidebar, template items, and run items
- All CRUD dialogs
- Timer display ticking
- Runtime mutations (toggle, timer, notes)

```js
const { ipcRenderer } = window.require("electron");
const ipc = ipcRenderer;

// ── State ─────────────────────────────────────────────────
let target = null;
let listsPayload = null; // full ListsTargetPayload
let selectedListId = null;
let isOwnerFrozen = false;
let editingItemId = null; // for edit mode reuse of add dialog
let timerIntervalId = null;

// ── DOM refs ──────────────────────────────────────────────
const closeBtn = document.getElementById("closeBtn");
const headerTarget = document.querySelector(".list-header-target");
const sidebarItems = document.getElementById("listSidebarItems");
const addListBtn = document.getElementById("addListBtn");
const templateSection = document.getElementById("templateSection");
const addItemBtn = document.getElementById("addItemBtn");
const listItemsContainer = document.getElementById("listItemsContainer");
const runSection = document.getElementById("runSection");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const runItemsContainer = document.getElementById("runItemsContainer");
const emptyState = document.getElementById("emptyState");
const addListDialog = document.getElementById("addListDialog");
const listTitleInput = document.getElementById("listTitleInput");
const createListBtn = document.getElementById("createListBtn");
const cancelListBtn = document.getElementById("cancelListBtn");
const addItemDialog = document.getElementById("addItemDialog");
const itemDialogTitle = document.getElementById("itemDialogTitle");
const itemTitleInput = document.getElementById("itemTitleInput");
const timerConfigSection = document.getElementById("timerConfigSection");
const timerDurationInput = document.getElementById("timerDurationInput");
const itemRequiredCheck = document.getElementById("itemRequiredCheck");
const itemDescriptionInput = document.getElementById("itemDescriptionInput");
const createItemBtn = document.getElementById("createItemBtn");
const cancelItemBtn = document.getElementById("cancelItemBtn");
const footerOwner = document.getElementById("footerOwner");
const footerRev = document.getElementById("footerRev");
const footerStatus = document.getElementById("footerStatus");
const listBody = document.querySelector(".list-body");

// ── Helpers ───────────────────────────────────────────────
const typeIcon = (type) => {
	if (type === "checkbox") return "\u2610";
	if (type === "timer") return "\u23F1";
	if (type === "note") return "\uD83D\uDCDD";
	return "\u2022";
};

const formatTimerDisplay = (elapsed, duration) => {
	const remaining = Math.max(0, duration - elapsed);
	const m = Math.floor(remaining / 60);
	const s = remaining % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
};

const getSelectedBundle = () => {
	if (!listsPayload?.lists || !selectedListId) return null;
	return listsPayload.lists.find((b) => b.definition?.id === selectedListId) ?? null;
};

const sendMutation = (event, data) => {
	ipc.send("lists-mutation", { event, data });
};

const showToast = (message) => {
	const existing = document.querySelector(".list-error-toast");
	if (existing) existing.remove();
	const toast = document.createElement("div");
	toast.className = "list-error-toast";
	toast.textContent = message;
	document.body.appendChild(toast);
	setTimeout(() => toast.remove(), 3000);
};

// ── Render ────────────────────────────────────────────────
const render = () => {
	if (!listsPayload) return;

	const lists = listsPayload.lists ?? [];
	const hasLists = lists.length > 0;

	emptyState.style.display = hasLists ? "none" : "flex";
	templateSection.style.display = hasLists ? "flex" : "none";

	// Auto-select first list if none selected
	if (hasLists && (!selectedListId || !lists.find((b) => b.definition?.id === selectedListId))) {
		selectedListId = lists[0].definition?.id ?? null;
	}

	// Owner frozen check
	isOwnerFrozen = false;
	// We don't have direct owner status info — infer from run status
	// If all runs are completed/canceled, owner is likely frozen
	const bundle = getSelectedBundle();
	if (bundle?.run?.status === "completed" || bundle?.run?.status === "canceled") {
		isOwnerFrozen = true;
	}

	listBody.classList.toggle("list-readonly", isOwnerFrozen);

	renderSidebar(lists);
	renderTemplateItems();
	renderRunItems();
	renderFooter();
};

const renderSidebar = (lists) => {
	sidebarItems.innerHTML = "";

	const sorted = [...lists].sort((a, b) => (a.definition?.position ?? 0) - (b.definition?.position ?? 0));

	for (const bundle of sorted) {
		const def = bundle.definition;
		if (!def) continue;

		const el = document.createElement("div");
		el.className = `list-sidebar-item${def.id === selectedListId ? " active" : ""}`;

		const titleSpan = document.createElement("span");
		titleSpan.textContent = def.title || "Untitled";
		el.appendChild(titleSpan);

		const kindSpan = document.createElement("span");
		kindSpan.className = "list-sidebar-item-kind";
		kindSpan.textContent = def.kind ?? "";
		el.appendChild(kindSpan);

		if (!isOwnerFrozen) {
			const actions = document.createElement("span");
			actions.className = "list-sidebar-item-actions";

			const delBtn = document.createElement("button");
			delBtn.textContent = "\u2715";
			delBtn.title = "Delete list";
			delBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				sendMutation("list_delete", { id: def.id });
			});
			actions.appendChild(delBtn);
			el.appendChild(actions);
		}

		el.addEventListener("click", () => {
			selectedListId = def.id;
			render();
		});

		sidebarItems.appendChild(el);
	}
};

const renderTemplateItems = () => {
	listItemsContainer.innerHTML = "";
	const bundle = getSelectedBundle();
	if (!bundle?.items) return;

	const sorted = [...bundle.items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	const topLevel = sorted.filter((i) => !i.parent_item_id);

	for (const item of topLevel) {
		listItemsContainer.appendChild(createTemplateItemRow(item, sorted));
	}
};

const createTemplateItemRow = (item, allItems) => {
	const row = document.createElement("div");
	row.className = "list-item-row";

	const icon = document.createElement("span");
	icon.className = "list-item-type-icon";
	icon.textContent = typeIcon(item.type);
	row.appendChild(icon);

	const title = document.createElement("span");
	title.className = "list-item-title";
	title.textContent = item.title || "Untitled";
	row.appendChild(title);

	const meta = document.createElement("span");
	meta.className = "list-item-meta";
	const parts = [];
	if (item.required) parts.push("required");
	if (item.type === "timer" && item.config?.duration_seconds) {
		parts.push(`${Math.round(item.config.duration_seconds / 60)}m`);
	}
	meta.textContent = parts.join(" | ");
	row.appendChild(meta);

	if (!isOwnerFrozen) {
		// Reorder buttons
		const reorder = document.createElement("span");
		reorder.className = "list-item-reorder";
		const upBtn = document.createElement("button");
		upBtn.textContent = "\u25B2";
		upBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_reorder", {
				id: item.id,
				list_id: item.list_id,
				position: Math.max(0, (item.position ?? 0) - 1),
			});
		});
		const downBtn = document.createElement("button");
		downBtn.textContent = "\u25BC";
		downBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_reorder", {
				id: item.id,
				list_id: item.list_id,
				position: (item.position ?? 0) + 1,
			});
		});
		reorder.appendChild(upBtn);
		reorder.appendChild(downBtn);
		row.appendChild(reorder);

		// Actions
		const actions = document.createElement("span");
		actions.className = "list-item-actions";

		const editBtn = document.createElement("button");
		editBtn.textContent = "Edit";
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			openEditItemDialog(item);
		});
		actions.appendChild(editBtn);

		const delBtn = document.createElement("button");
		delBtn.textContent = "\u2715";
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_delete", { id: item.id });
		});
		actions.appendChild(delBtn);

		row.appendChild(actions);
	}

	// Children
	const children = allItems.filter((i) => i.parent_item_id === item.id);
	if (children.length > 0) {
		const childContainer = document.createElement("div");
		childContainer.className = "list-item-children";
		for (const child of children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
			childContainer.appendChild(createTemplateItemRow(child, allItems));
		}
		const wrapper = document.createElement("div");
		wrapper.appendChild(row);
		wrapper.appendChild(childContainer);
		return wrapper;
	}

	return row;
};

const renderRunItems = () => {
	const bundle = getSelectedBundle();
	const run = bundle?.run;
	const runItems = bundle?.run_items;

	if (!run || !runItems) {
		runSection.style.display = "none";
		return;
	}

	runSection.style.display = "flex";

	const isRunReadonly = run.status === "completed" || run.status === "canceled";
	runSection.classList.toggle("list-run-readonly", isRunReadonly);

	// Progress
	const total = run.required_total ?? 0;
	const completed = run.required_completed ?? 0;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	progressFill.style.width = `${pct}%`;
	progressText.textContent = `${completed}/${total}`;

	// Clear timer interval
	if (timerIntervalId) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}

	runItemsContainer.innerHTML = "";
	const sorted = [...runItems].sort(
		(a, b) => (a.snapshot?.position ?? 0) - (b.snapshot?.position ?? 0)
	);

	const topLevel = sorted.filter((ri) => !ri.snapshot?.parent_item_id);

	for (const ri of topLevel) {
		runItemsContainer.appendChild(createRunItemRow(ri, sorted, run.id, isRunReadonly));
	}

	// Start timer tick if any timers are running
	const hasRunning = sorted.some(
		(ri) => ri.snapshot?.type === "timer" && ri.timer_state?.status === "running"
	);
	if (hasRunning) {
		timerIntervalId = setInterval(() => updateTimerDisplays(), 1000);
	}
};

const createRunItemRow = (ri, allRunItems, runId, isRunReadonly) => {
	const snap = ri.snapshot ?? {};
	const row = document.createElement("div");
	row.className = `list-run-item${ri.is_completed ? " completed" : ""}`;
	row.dataset.runItemId = ri.id;
	row.dataset.itemId = snap.item_id ?? "";

	if (snap.type === "checkbox") {
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.className = "list-run-item-checkbox";
		cb.checked = !!ri.is_completed;
		if (!isRunReadonly && snap.item_id) {
			cb.addEventListener("change", () => {
				sendMutation("list_run_item_toggle", {
					run_id: runId,
					item_id: snap.item_id,
				});
			});
		}
		row.appendChild(cb);
	} else {
		const icon = document.createElement("span");
		icon.className = "list-item-type-icon";
		icon.textContent = typeIcon(snap.type);
		row.appendChild(icon);
	}

	const title = document.createElement("span");
	title.className = "list-run-item-title";
	title.textContent = snap.title || "Untitled";
	row.appendChild(title);

	if (snap.type === "timer") {
		const timerState = ri.timer_state ?? {};
		const timerEl = document.createElement("span");
		timerEl.className = "list-run-timer";

		const elapsed = computeTimerElapsed(timerState);
		const duration = timerState.duration_seconds ?? snap.config?.duration_seconds ?? 0;

		const timeDisplay = document.createElement("span");
		timeDisplay.className = "list-run-timer-display";
		timeDisplay.textContent = formatTimerDisplay(elapsed, duration);
		timeDisplay.dataset.runItemId = ri.id;
		timerEl.appendChild(timeDisplay);

		if (!isRunReadonly && snap.item_id && !ri.is_completed) {
			if (timerState.status === "running") {
				const pauseBtn = document.createElement("button");
				pauseBtn.className = "list-run-timer-btn running";
				pauseBtn.textContent = "\u23F8"; // pause
				pauseBtn.addEventListener("click", () => {
					sendMutation("list_run_item_timer_pause", {
						run_id: runId,
						item_id: snap.item_id,
					});
				});
				timerEl.appendChild(pauseBtn);
			} else if (timerState.status !== "completed") {
				const playBtn = document.createElement("button");
				playBtn.className = "list-run-timer-btn";
				playBtn.textContent = "\u25B6"; // play
				playBtn.addEventListener("click", () => {
					sendMutation("list_run_item_timer_start", {
						run_id: runId,
						item_id: snap.item_id,
					});
				});
				timerEl.appendChild(playBtn);
			}

			if (timerState.status !== "completed" && timerState.status !== "idle") {
				const completeBtn = document.createElement("button");
				completeBtn.className = "list-run-timer-btn";
				completeBtn.textContent = "\u2713"; // check
				completeBtn.title = "Complete timer";
				completeBtn.addEventListener("click", () => {
					sendMutation("list_run_item_timer_complete", {
						run_id: runId,
						item_id: snap.item_id,
					});
				});
				timerEl.appendChild(completeBtn);
			}
		}

		row.appendChild(timerEl);
	}

	if (snap.type === "note") {
		const noteState = ri.note_state ?? {};
		const noteInput = document.createElement("textarea");
		noteInput.className = "list-run-note-input";
		noteInput.value = noteState.text ?? "";
		noteInput.placeholder = snap.config?.placeholder ?? "Add a note...";
		if (!isRunReadonly && snap.item_id) {
			let debounceTimer = null;
			noteInput.addEventListener("input", () => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					sendMutation("list_run_item_note_set", {
						run_id: runId,
						item_id: snap.item_id,
						text: noteInput.value,
					});
				}, 500);
			});
		}
		// Note replaces title row with the input
		row.innerHTML = "";
		const icon = document.createElement("span");
		icon.className = "list-item-type-icon";
		icon.textContent = typeIcon("note");
		row.appendChild(icon);

		const noteWrapper = document.createElement("div");
		noteWrapper.style.flex = "1";
		const noteLabel = document.createElement("span");
		noteLabel.className = "list-run-item-title";
		noteLabel.textContent = snap.title || "Note";
		noteLabel.style.marginBottom = "4px";
		noteLabel.style.display = "block";
		noteWrapper.appendChild(noteLabel);
		noteWrapper.appendChild(noteInput);
		row.appendChild(noteWrapper);
	}

	// Children
	const children = allRunItems.filter((r) => r.snapshot?.parent_item_id === snap.item_id);
	if (children.length > 0) {
		const wrapper = document.createElement("div");
		wrapper.appendChild(row);
		const childContainer = document.createElement("div");
		childContainer.className = "list-item-children";
		for (const child of children.sort((a, b) => (a.snapshot?.position ?? 0) - (b.snapshot?.position ?? 0))) {
			childContainer.appendChild(createRunItemRow(child, allRunItems, runId, isRunReadonly));
		}
		wrapper.appendChild(childContainer);
		return wrapper;
	}

	return row;
};

const computeTimerElapsed = (timerState) => {
	let elapsed = timerState.elapsed_seconds ?? 0;
	if (timerState.status === "running" && timerState.last_started_at) {
		const startedAt = new Date(timerState.last_started_at).getTime();
		const nowMs = Date.now();
		elapsed += Math.floor((nowMs - startedAt) / 1000);
	}
	return elapsed;
};

const updateTimerDisplays = () => {
	const bundle = getSelectedBundle();
	if (!bundle?.run_items) return;
	for (const ri of bundle.run_items) {
		if (ri.snapshot?.type !== "timer") continue;
		if (ri.timer_state?.status !== "running") continue;
		const display = document.querySelector(
			`.list-run-timer-display[data-run-item-id="${ri.id}"]`
		);
		if (!display) continue;
		const elapsed = computeTimerElapsed(ri.timer_state);
		const duration = ri.timer_state.duration_seconds ?? ri.snapshot.config?.duration_seconds ?? 0;
		display.textContent = formatTimerDisplay(elapsed, duration);
	}
};

const renderFooter = () => {
	const bundle = getSelectedBundle();
	if (!bundle) {
		footerOwner.textContent = "";
		footerRev.textContent = "";
		footerStatus.textContent = "";
		return;
	}
	const def = bundle.definition;
	footerOwner.textContent = `Owner: ${def?.owner?.kind ?? ""}`;
	footerRev.textContent = `Rev ${def?.rev ?? 0}`;
	footerStatus.textContent = bundle.run ? `Run: ${bundle.run.status}` : "Template only";
};

// ── Dialogs ───────────────────────────────────────────────
addListBtn.addEventListener("click", () => {
	listTitleInput.value = "";
	addListDialog.showModal();
	listTitleInput.focus();
});

cancelListBtn.addEventListener("click", () => addListDialog.close());

createListBtn.addEventListener("click", () => {
	const title = listTitleInput.value.trim();
	if (!title) return;
	const kind = document.querySelector('input[name="listKind"]:checked')?.value ?? "checklist";
	sendMutation("list_create", {
		target,
		position: (listsPayload?.lists?.length ?? 0),
		title,
		kind,
	});
	addListDialog.close();
});

// Item dialog
const openAddItemDialog = () => {
	editingItemId = null;
	itemDialogTitle.textContent = "New Item";
	itemTitleInput.value = "";
	itemDescriptionInput.value = "";
	itemRequiredCheck.checked = true;
	timerDurationInput.value = "25";
	timerConfigSection.style.display = "none";
	document.querySelector('input[name="itemType"][value="checkbox"]').checked = true;
	createItemBtn.textContent = "Create";
	addItemDialog.showModal();
	itemTitleInput.focus();
};

const openEditItemDialog = (item) => {
	editingItemId = item.id;
	itemDialogTitle.textContent = "Edit Item";
	itemTitleInput.value = item.title ?? "";
	itemDescriptionInput.value = item.description ?? "";
	itemRequiredCheck.checked = item.required ?? true;
	const typeRadio = document.querySelector(`input[name="itemType"][value="${item.type}"]`);
	if (typeRadio) typeRadio.checked = true;
	timerConfigSection.style.display = item.type === "timer" ? "block" : "none";
	timerDurationInput.value = item.config?.duration_seconds ? Math.round(item.config.duration_seconds / 60) : "25";
	createItemBtn.textContent = "Save";
	addItemDialog.showModal();
	itemTitleInput.focus();
};

addItemBtn.addEventListener("click", openAddItemDialog);
cancelItemBtn.addEventListener("click", () => addItemDialog.close());

document.querySelectorAll('input[name="itemType"]').forEach((radio) => {
	radio.addEventListener("change", (e) => {
		timerConfigSection.style.display = e.target.value === "timer" ? "block" : "none";
	});
});

createItemBtn.addEventListener("click", () => {
	const title = itemTitleInput.value.trim();
	if (!title) return;
	const itemType = document.querySelector('input[name="itemType"]:checked')?.value ?? "checkbox";
	const required = itemRequiredCheck.checked;
	const description = itemDescriptionInput.value.trim() || null;
	const config = {};
	if (itemType === "timer") {
		const mins = parseInt(timerDurationInput.value) || 25;
		config.duration_seconds = mins * 60;
	}
	if (itemType === "note") {
		// notes cannot be required
	}

	if (editingItemId) {
		sendMutation("list_item_edit", {
			id: editingItemId,
			list_id: selectedListId,
			parent_item_id: null,
			position: 0, // server preserves position on edit
			item_type: itemType,
			title,
			description,
			required: itemType === "note" ? false : required,
			config,
		});
	} else {
		const bundle = getSelectedBundle();
		const itemCount = bundle?.items?.length ?? 0;
		sendMutation("list_item_create", {
			list_id: selectedListId,
			parent_item_id: null,
			position: itemCount,
			item_type: itemType,
			title,
			description,
			required: itemType === "note" ? false : required,
			config,
		});
	}
	addItemDialog.close();
});

// ── IPC ───────────────────────────────────────────────────
ipc.on("data-from-parent", (_, data) => {
	target = data?.target ?? null;
	if (target) {
		headerTarget.textContent = `${target.kind}: ${target.id.substring(0, 8)}...`;
		ipc.send("lists-fetch", { target });
	}
});

ipc.on("lists-data", (_, payload) => {
	listsPayload = payload;
	render();
});

ipc.on("lists-error", (_, error) => {
	const message = error?.message || error?.type || "List operation failed";
	showToast(message);
	// Refetch to restore consistent state
	if (target) {
		ipc.send("lists-fetch", { target });
	}
});

closeBtn.addEventListener("click", () => {
	ipc.send("lists-unsubscribe");
	window.close();
});

window.addEventListener("beforeunload", () => {
	ipc.send("lists-unsubscribe");
	if (timerIntervalId) clearInterval(timerIntervalId);
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		if (addListDialog.open) {
			addListDialog.close();
		} else if (addItemDialog.open) {
			addItemDialog.close();
		} else {
			ipc.send("lists-unsubscribe");
			window.close();
		}
	}
});
```

**Step 2: Verify syntax**

Run: `node -c src/js/listWindow.js`

**Step 3: Commit**

```bash
git add src/js/listWindow.js
git commit -m "feat(lists): add List Window renderer with full CRUD and runtime controls"
```

---

### Task 10: Shared List Summary Module

**Files:**
- Create: `src/js/listSummary.js`

**Step 1: Create the shared module**

```js
const { ipcRenderer } = window.require("electron");

export function renderListSummary({ lists, target }) {
	const container = document.createElement("div");
	container.className = "list-summary";

	if (!lists || lists.length === 0) {
		container.innerHTML = `
			<span class="list-summary-label">Lists</span>
			<span class="list-summary-empty">None</span>
			<button class="list-summary-action">Add</button>
		`;
		container.querySelector(".list-summary-action").addEventListener("click", () => {
			ipcRenderer.send("open-list-window", { target });
		});
		return container;
	}

	// Aggregate progress across all runs
	let totalRequired = 0;
	let totalCompleted = 0;
	let listCount = 0;

	for (const bundle of lists) {
		listCount++;
		if (bundle.run) {
			totalRequired += bundle.run.required_total ?? 0;
			totalCompleted += bundle.run.required_completed ?? 0;
		}
	}

	const hasRuns = lists.some((b) => b.run);
	const pct = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

	let html = `<span class="list-summary-label">${listCount} list${listCount > 1 ? "s" : ""}</span>`;

	if (hasRuns && totalRequired > 0) {
		html += `
			<span class="list-summary-progress-bar">
				<span class="list-summary-progress-fill" style="width:${pct}%"></span>
			</span>
			<span class="list-summary-progress-text">${totalCompleted}/${totalRequired}</span>
		`;
	}

	html += `<button class="list-summary-action">${hasRuns ? "Open" : "Manage"}</button>`;

	container.innerHTML = html;
	container.querySelector(".list-summary-action").addEventListener("click", () => {
		ipcRenderer.send("open-list-window", { target });
	});

	return container;
}

export function createListSummaryStyles() {
	const style = document.createElement("style");
	style.textContent = `
		.list-summary {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 8px;
			background: oklch(0.28 0.04 80);
			border: 1px solid oklch(0.40 0.06 80);
			border-radius: 5px;
			margin-top: 8px;
			font-size: 12px;
		}
		.list-summary-label {
			font-weight: 500;
		}
		.list-summary-empty {
			opacity: 0.5;
			flex: 1;
		}
		.list-summary-progress-bar {
			flex: 1;
			height: 4px;
			background: oklch(0.30 0.04 80);
			border-radius: 2px;
			overflow: hidden;
			max-width: 120px;
		}
		.list-summary-progress-fill {
			display: block;
			height: 100%;
			background: #16a34a;
			border-radius: 2px;
			transition: width 0.3s ease;
		}
		.list-summary-progress-text {
			opacity: 0.7;
			font-variant-numeric: tabular-nums;
			min-width: 28px;
		}
		.list-summary-action {
			background: transparent;
			border: 1px solid oklch(0.50 0.06 80);
			color: inherit;
			padding: 2px 8px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 11px;
		}
		.list-summary-action:hover {
			background: oklch(0.35 0.06 80);
		}
	`;
	return style;
}
```

**Step 2: Commit**

```bash
git add src/js/listSummary.js
git commit -m "feat(lists): add shared list summary module for inline progress display"
```

---

### Task 11: Integrate List Summary into Edit Window

**Files:**
- Modify: `src/html/child.html:52-53` (add container before submit)
- Modify: `src/js/childrenIndex.js:1-3` (imports), `src/js/childrenIndex.js:64-118` (data handler)

**Step 1: Add summary container in HTML**

In `src/html/child.html`, before the submit button (line 47), add:

```html
			<div id="listSummaryContainer" class="list-summary-wrapper"></div>
```

**Step 2: Import and wire in renderer**

In `src/js/childrenIndex.js`, add import at top (line 1):

```js
import { parseString, setupFuzzyFinder } from './helpers.js';
import { renderListSummary, createListSummaryStyles } from './listSummary.js';
```

In the `DOMContentLoaded` handler (after line 57), add:

```js
	document.head.appendChild(createListSummaryStyles());
```

In the `data-from-parent` handler (after line 117), add list fetch logic:

```js
	// Fetch and render list summary
	const listSummaryContainer = document.getElementById("listSummaryContainer");
	const listTarget = { kind: "task", id: ID };
	ipc.send("lists-fetch", { target: listTarget });

	ipc.on("lists-data", (_, payload) => {
		if (payload?.target?.kind === "task" && payload?.target?.id === ID) {
			listSummaryContainer.innerHTML = "";
			listSummaryContainer.appendChild(renderListSummary({
				lists: payload.lists ?? [],
				target: listTarget,
			}));
		}
	});
```

Add cleanup on close — modify the closeBtn handler (line 204):

```js
closeBtn.addEventListener('click', () => {
	ipc.send('lists-unsubscribe');
	ipc.send('close-children-window');
});
```

**Step 3: Commit**

```bash
git add src/html/child.html src/js/childrenIndex.js
git commit -m "feat(lists): integrate list summary into task edit window"
```

---

### Task 12: Integrate List Summary into Notifications Window

**Files:**
- Modify: `src/js/notificationsWindow.js` (add summary rendering per notification)

**Step 1: Add list import**

At the top of `src/js/notificationsWindow.js`, add:

```js
import { renderListSummary, createListSummaryStyles } from './listSummary.js';
```

Add styles in `DOMContentLoaded`:

```js
document.head.appendChild(createListSummaryStyles());
```

**Step 2: Add summary to notification items**

In the function that renders individual notification items, after the notification content, add a check:

```js
// Inside the notification item render, after the existing content:
if (notification.payload?.list_run_ids?.length > 0 || notification.payload?.open_required_list_count > 0) {
	const summaryContainer = document.createElement("div");
	summaryContainer.className = "notification-list-summary";
	const listTarget = { kind: "notification", id: notification.id };

	// Lazy-fetch on first render
	ipc.send("lists-fetch", { target: listTarget });

	ipc.on("lists-data", function handler(_, payload) {
		if (payload?.target?.kind === "notification" && payload?.target?.id === notification.id) {
			summaryContainer.innerHTML = "";
			summaryContainer.appendChild(renderListSummary({
				lists: payload.lists ?? [],
				target: listTarget,
			}));
			ipc.removeListener("lists-data", handler);
		}
	});

	notificationEl.appendChild(summaryContainer);
}
```

Note: The exact insertion point depends on the notification item rendering function in `notificationsWindow.js`. The implementer should read the file and find the `renderNotificationItem` or equivalent function, then add the summary after the notification body.

**Step 3: Commit**

```bash
git add src/js/notificationsWindow.js
git commit -m "feat(lists): integrate list summary into notification items"
```

---

### Task 13: Integrate List Summary into Calendar Detail Overlay

**Files:**
- Modify: `src/js/calendarWindow.js` (add summary in detail overlay)

**Step 1: Add list import**

At the top of `src/js/calendarWindow.js`, add:

```js
import { renderListSummary, createListSummaryStyles } from './listSummary.js';
```

Add styles in initialization:

```js
document.head.appendChild(createListSummaryStyles());
```

**Step 2: Add summary to detail overlay**

In the function that renders the detail overlay (when a calendar event is clicked), add after the existing detail content:

```js
// After rendering detail overlay content:
const occurrenceId = selectedEvent?.occurrence_id ?? selectedEvent?.id;
if (occurrenceId) {
	const listTarget = { kind: "occurrence", id: occurrenceId };
	const summaryContainer = document.createElement("div");
	summaryContainer.className = "calendar-list-summary";
	detailContentArea.appendChild(summaryContainer);

	ipc.send("lists-fetch", { target: listTarget });

	ipc.on("lists-data", function handler(_, payload) {
		if (payload?.target?.kind === "occurrence" && payload?.target?.id === occurrenceId) {
			summaryContainer.innerHTML = "";
			summaryContainer.appendChild(renderListSummary({
				lists: payload.lists ?? [],
				target: listTarget,
			}));
			ipc.removeListener("lists-data", handler);
		}
	});
}
```

Note: The exact insertion point depends on the detail overlay render function in `calendarWindow.js`. The implementer should read the file and find where event details are populated, then add the summary.

**Step 3: Commit**

```bash
git add src/js/calendarWindow.js
git commit -m "feat(lists): integrate list summary into calendar detail overlay"
```

---

### Task 14: Integrate List Summary into Reminder Window

**Files:**
- Modify: `src/js/reminderWindow.js` (add template count for schedule targets)

**Step 1: Add list import**

At the top of `src/js/reminderWindow.js`, add:

```js
import { renderListSummary, createListSummaryStyles } from './listSummary.js';
```

Add styles:

```js
document.head.appendChild(createListSummaryStyles());
```

**Step 2: Add list indicator for existing schedules**

When the reminder window opens for editing an existing schedule (it receives schedule data from parent), add a summary section:

```js
// After receiving schedule data, if editing an existing schedule:
if (scheduleId) {
	const listTarget = { kind: "schedule", id: scheduleId };
	const summaryContainer = document.getElementById("listSummaryContainer") ?? document.createElement("div");
	summaryContainer.id = "listSummaryContainer";
	// Insert before the submit section
	formContainer.insertBefore(summaryContainer, submitSection);

	ipc.send("lists-fetch", { target: listTarget });

	ipc.on("lists-data", function handler(_, payload) {
		if (payload?.target?.kind === "schedule" && payload?.target?.id === scheduleId) {
			summaryContainer.innerHTML = "";
			summaryContainer.appendChild(renderListSummary({
				lists: payload.lists ?? [],
				target: listTarget,
			}));
			ipc.removeListener("lists-data", handler);
		}
	});
}
```

Note: The reminder window currently creates new schedules. If it also supports editing existing ones (check the renderer code), add the summary there. If it only creates new schedules, this integration can be deferred — just add the import and a TODO comment.

**Step 3: Commit**

```bash
git add src/js/reminderWindow.js
git commit -m "feat(lists): integrate list summary into reminder window"
```

---

### Task 15: Handle task_blocked_by_list in Edit Window

**Files:**
- Modify: `src/js/childrenIndex.js` (add error handler)

**Step 1: Add blocked-by-list error handling**

In `src/js/childrenIndex.js`, after the `lists-data` handler, add:

```js
	ipc.on("lists-error", (_, error) => {
		if (error?.type === "task_blocked_by_list") {
			// Show visual indicator that task can't be completed
			const toast = document.createElement("div");
			toast.style.cssText = "position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:#dc2626;color:white;padding:6px 16px;border-radius:5px;font-size:12px;z-index:100;animation:fadeInOut 3s ease forwards;";
			toast.textContent = "Complete required list items first";
			document.body.appendChild(toast);
			setTimeout(() => toast.remove(), 3000);
		}
	});
```

**Step 2: Commit**

```bash
git add src/js/childrenIndex.js
git commit -m "feat(lists): handle task_blocked_by_list error in edit window"
```

---

### Task 16: Smoke Test and Final Verification

**Step 1: Verify all files parse correctly**

Run:
```bash
node -c src/main/controllers/listsController.js && \
node -c src/main/socket/handlers.js && \
node -c src/main/ipc/registerHandlers.js && \
node -c src/main/controllers/windowManager.js && \
node -c src/main/windows/listWindow.js && \
node -c main.js
```

Expected: No syntax errors for any file.

**Step 2: Start the app**

Run: `npm start`

Expected: App launches, no console errors related to lists.

**Step 3: Manual smoke test checklist**

1. Open edit window for any task -> list summary should appear ("None" with "Add" button)
2. Click "Add" -> List Window opens
3. Click "+ Add list" -> dialog appears, enter title, create
4. Click "+ Add item" -> dialog appears, create checkbox/timer/note items
5. Check a checkbox item -> run progress updates
6. Timer start/pause/complete works
7. Note text input works with debounced save
8. Close List Window -> edit window summary should reflect changes
9. Reorder items with up/down arrows
10. Delete items and lists
11. Open notifications -> notifications with list data show summaries
12. Calendar detail -> shows list summary for occurrences

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(lists): complete lists feature with List Window, inline summaries, and real-time sync"
```

---

## Summary of Tasks

| # | Task | New Files | Modified Files |
|---|------|-----------|----------------|
| 1 | ListsController core | `listsController.js` | — |
| 2 | Wire into main.js | — | `main.js` |
| 3 | Socket handlers | — | `handlers.js` |
| 4 | IPC handlers | — | `registerHandlers.js`, `listsController.js` |
| 5 | List Window factory | `listWindow.js` | — |
| 6 | WindowManager registration | — | `windowManager.js`, `main.js`, `registerHandlers.js` |
| 7 | List Window HTML | `list.html` | — |
| 8 | List Window CSS | `list.css` | — |
| 9 | List Window renderer | `listWindow.js` (renderer) | — |
| 10 | Shared summary module | `listSummary.js` | — |
| 11 | Edit window integration | — | `child.html`, `childrenIndex.js` |
| 12 | Notifications integration | — | `notificationsWindow.js` |
| 13 | Calendar integration | — | `calendarWindow.js` |
| 14 | Reminder integration | — | `reminderWindow.js` |
| 15 | Error handling | — | `childrenIndex.js` |
| 16 | Smoke test | — | — |
