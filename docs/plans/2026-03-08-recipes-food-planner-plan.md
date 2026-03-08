# Recipes & Food Planner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Recipes & Food Planner module to Taskbar2, following the Finance module architecture pattern.

**Architecture:** Main-process controller handles WebSocket routing and Go nullable-type normalization. Window factory creates a frameless 1200x800 BrowserWindow. Renderer uses centralized state with pub/sub and section modules (init/render/onEvent/destroy).

**Tech Stack:** Electron (main + renderer), vanilla JS (no framework), CSS variables from variables.css, WebSocket events, HTTP for images.

**Contract:** `docs/frontend_recipes_ws_contract.md`
**Design:** `docs/plans/2026-03-08-recipes-food-planner-design.md`

---

### Task 1: Recipes Controller (Main Process)

**Files:**
- Create: `src/main/controllers/recipesController.js`

**Context:** This is the main-process controller that routes WebSocket events between the server and the recipes renderer window. Follow the exact pattern in `src/main/controllers/financeController.js`. The controller also normalizes Go nullable types (`uuid.NullUUID` → string|null, `sql.NullString` → string|null) before forwarding to the renderer.

**Step 1: Create the controller**

```javascript
// src/main/controllers/recipesController.js

export function createRecipesController({ windowManager, sendEvent }) {
	const RECIPES_SERVER_EVENTS = [
		// Recipes
		"recipe_created", "recipe_data", "recipe_list_data",
		"recipe_updated", "recipe_deleted",
		// Save/bookmark
		"recipe_saved", "recipe_unsaved", "recipe_saved_list_data",
		// Groups
		"recipe_group_created", "recipe_group_list_data",
		"recipe_group_member_joined", "recipe_group_member_left",
		"recipe_group_deleted",
		"recipe_group_recipe_shared", "recipe_group_recipe_unshared",
		// Meals
		"meal_logged", "meal_deleted", "meal_list_data",
		// Planner
		"meal_plan_created", "meal_plan_data",
		"meal_plan_entry_updated", "meal_plan_entry_removed",
		// Suggestions
		"meal_suggestions_data",
	];

	/**
	 * Normalize Go nullable types in-place:
	 * - uuid.NullUUID: { UUID: "...", Valid: true/false } → string | null
	 * - sql.NullString: { String: "...", Valid: true/false } → string | null
	 */
	function normalizeNullable(obj) {
		if (!obj || typeof obj !== "object") return obj;
		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				obj[i] = normalizeNullable(obj[i]);
			}
			return obj;
		}
		for (const key of Object.keys(obj)) {
			const val = obj[key];
			if (val && typeof val === "object" && !Array.isArray(val)) {
				if ("Valid" in val) {
					if ("UUID" in val) {
						obj[key] = val.Valid ? val.UUID : null;
					} else if ("String" in val) {
						obj[key] = val.Valid ? val.String : null;
					} else {
						normalizeNullable(val);
					}
				} else {
					normalizeNullable(val);
				}
			}
		}
		return obj;
	}

	const forwardToRecipesWindow = (event, data) => {
		const win = windowManager.getRecipesWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("recipes-event", { event, data });
		}
	};

	const getSocketEventHandlers = () => {
		const handlers = {};
		for (const eventName of RECIPES_SERVER_EVENTS) {
			handlers[eventName] = ({ data }) => {
				const normalized = normalizeNullable(
					typeof data === "string" ? JSON.parse(data) : data
				);
				forwardToRecipesWindow(eventName, normalized);
			};
		}
		return handlers;
	};

	const handleRendererSend = (eventName, data) => {
		sendEvent?.(eventName, data);
	};

	return {
		getSocketEventHandlers,
		handleRendererSend,
		forwardToRecipesWindow,
	};
}
```

**Step 2: Commit**

```bash
git add src/main/controllers/recipesController.js
git commit -m "feat(recipes): add recipes controller with nullable normalization"
```

---

### Task 2: Window Factory (Main Process)

**Files:**
- Create: `src/main/windows/recipesWindow.js`

**Context:** Follow the exact pattern in `src/main/windows/financeWindow.js`. Frameless window, 1200x800, centered on target display.

**Step 1: Create the window factory**

```javascript
// src/main/windows/recipesWindow.js

import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export function createRecipesWindow({ screenIndex, onClose } = {}) {
	const allDisplays = screen.getAllDisplays();
	const normalizedIndex = Number.isInteger(screenIndex)
		? Math.min(Math.max(screenIndex, 0), allDisplays.length - 1)
		: 0;
	const targetDisplay = allDisplays[normalizedIndex] || screen.getPrimaryDisplay();
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 900,
		minHeight: 550,
		movable: true,
		show: true,
		frame: false,
		resizable: true,
		title: "Recipes",
		backgroundColor: "#121B22",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/recipes.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
```

**Step 2: Commit**

```bash
git add src/main/windows/recipesWindow.js
git commit -m "feat(recipes): add recipes window factory"
```

---

### Task 3: Wire Controller + Window into Main Process

**Files:**
- Modify: `main.js`
- Modify: `src/main/controllers/windowManager.js`
- Modify: `src/main/socket/handlers.js`
- Modify: `src/main/ipc/registerHandlers.js`

**Context:** Wire the recipes controller and window factory into the existing Electron app, following the exact Finance module wiring pattern. This involves 4 files.

**Step 1: Add imports and create controller in `main.js`**

At the top of `main.js`, add the import (near the financeWindow import, around line 22):
```javascript
import { createRecipesWindow as createRecipesBrowserWindow } from "./src/main/windows/recipesWindow.js";
```

Add the import for the controller (near financeController import, around line 38):
```javascript
import { createRecipesController } from "./src/main/controllers/recipesController.js";
```

In the `windowManager = createWindowManager({...})` call (around line 105-124), add:
```javascript
createRecipesWindow: createRecipesBrowserWindow,
```

After the `financeController` creation (around line 238-241), add:
```javascript
const recipesController = createRecipesController({
	windowManager,
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
});
```

In the `createSocketHandlers({...})` call (around line 365-381), add:
```javascript
recipesController,
```

In the `registerIpcHandlers({...})` call (around line 400-428), add:
```javascript
recipesController,
```

In the `handleCloseAppRequest` function (around line 454-466), add before `windowManager.getTaskbarWindow()?.close()`:
```javascript
windowManager.closeRecipesWindow();
```

In the devtools shortcut handler (around line 519), add:
```javascript
windowManager.getRecipesWindow()?.webContents.openDevTools();
```

Add the `openRecipesWindow` helper function (near `openFinanceWindow` around line 744):
```javascript
function openRecipesWindow(options = {}) {
	const displays = screen.getAllDisplays();
	const requestedIndex = Number.isInteger(options.screenIndex)
		? options.screenIndex
		: appState.currentlySelectedScreenIndex ?? 0;
	const maxIndex = Math.max(displays.length - 1, 0);
	const normalizedIndex = Math.min(Math.max(requestedIndex, 0), maxIndex);
	try {
		return windowManager.openRecipesWindow({
			...options,
			screenIndex: normalizedIndex,
		});
	} catch (e) {
		console.error(e);
	}
}
```

In the `showMainMenu` function's `showMainContextMenu({...})` call, add:
```javascript
openRecipesWindow,
```

**Step 2: Add to WindowManager**

In `src/main/controllers/windowManager.js`:

Add `createRecipesWindow` to the function parameters (near `createFinanceWindow` on line 19):
```javascript
createRecipesWindow,
```

Add `recipes: null` to the state object (near `finance: null` on line 37):
```javascript
recipes: null,
```

Add these methods (after `closeFinanceWindow` around line 500-504, before the closing `};`):
```javascript
openRecipesWindow(options = {}) {
	if (state.recipes && !state.recipes.isDestroyed()) {
		state.recipes.focus();
		return state.recipes;
	}
	state.recipes = createRecipesWindow({
		...options,
		onClose: () => {
			state.recipes = null;
			options?.onClose?.();
		},
	});
	return state.recipes;
},

getRecipesWindow() {
	return state.recipes;
},

closeRecipesWindow() {
	if (state.recipes && !state.recipes.isDestroyed()) {
		state.recipes.close();
	}
},
```

**Step 3: Add to socket handlers**

In `src/main/socket/handlers.js`:

Add `recipesController` to the function parameters (near `financeController` on line 12):
```javascript
recipesController,
```

In the `connection_error` handler (around line 197), add after the finance forwarding:
```javascript
recipesController?.forwardToRecipesWindow?.("connection_error", normalized);
```

In the `setUpTasks` function, after the finance reconnect notification (around line 124), add:
```javascript
recipesController?.forwardToRecipesWindow?.("recipes_reconnected", {});
```

In the `eventHandlers` object, at the end (near the finance spread around line 698), add:
```javascript
...(recipesController?.getSocketEventHandlers?.() ?? {}),
```

**Step 4: Add IPC handlers**

In `src/main/ipc/registerHandlers.js`:

Add `recipesController` to the function parameters (near `financeController` on line 28):
```javascript
recipesController,
```

At the end of the function (before the closing `}`), add:
```javascript
// ---- Recipes IPC handlers ----

ipc.on("recipes-send", (_, data) => {
	if (!data?.event) return;
	recipesController?.handleRendererSend?.(data.event, data.data ?? {});
});

ipc.on("open-recipes-window", () => {
	windowManager.openRecipesWindow?.({
		screenIndex: appState.currentlySelectedScreenIndex ?? 0,
	});
});
```

**Step 5: Commit**

```bash
git add main.js src/main/controllers/windowManager.js src/main/socket/handlers.js src/main/ipc/registerHandlers.js
git commit -m "feat(recipes): wire controller and window into main process"
```

---

### Task 4: Image Upload IPC Handlers (Main Process)

**Files:**
- Modify: `src/main/ipc/registerHandlers.js`

**Context:** Image uploads must go through the main process to keep Google credentials out of the renderer. The server expects `X-Google-UID` and `X-Email` headers. The app gets the user info from the `googleapis.js` module (available via the `userInfo` import in main.js). We need to pass these credentials through IPC. The server base URL comes from `APP_STAGE` env var (`ws://localhost:8080` for dev, `wss://pythonws.dinodev.dev` for prod) but HTTP uses `http://` or `https://` respectively.

Check `src/main/config.js` for the server URL configuration. The HTTP base URL should be derived from the WebSocket URL.

**Step 1: Add image IPC handlers**

In `src/main/ipc/registerHandlers.js`, in the recipes IPC section (added in Task 3), add these `ipc.handle` calls:

```javascript
const { net } = require("electron");
const fs = require("fs");
const path = require("path");

// Helper to get HTTP base URL from config
function getHttpBaseUrl() {
	const wsUrl = process.env.APP_STAGE === "production"
		? "wss://pythonws.dinodev.dev"
		: "ws://localhost:8080";
	return wsUrl.replace("wss://", "https://").replace("ws://", "http://");
}

ipc.handle("recipes:upload-image", async (_, { recipeId, filePath, googleUid, email }) => {
	const baseUrl = getHttpBaseUrl();
	const url = `${baseUrl}/api/recipes/${recipeId}/images`;
	const boundary = "----RecipesFormBoundary" + Date.now();
	const fileBuffer = fs.readFileSync(filePath);
	const fileName = path.basename(filePath);
	const ext = path.extname(fileName).toLowerCase();
	const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

	const prefix = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
	);
	const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
	const body = Buffer.concat([prefix, fileBuffer, suffix]);

	const response = await net.fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
			"X-Google-UID": googleUid,
			"X-Email": email,
		},
		body,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Upload failed (${response.status}): ${text}`);
	}
	return response.json();
});

ipc.handle("recipes:replace-image", async (_, { recipeId, imageId, filePath, googleUid, email }) => {
	const baseUrl = getHttpBaseUrl();
	const url = `${baseUrl}/api/recipes/${recipeId}/images/${imageId}`;
	const boundary = "----RecipesFormBoundary" + Date.now();
	const fileBuffer = fs.readFileSync(filePath);
	const fileName = path.basename(filePath);
	const ext = path.extname(fileName).toLowerCase();
	const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

	const prefix = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
	);
	const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
	const body = Buffer.concat([prefix, fileBuffer, suffix]);

	const response = await net.fetch(url, {
		method: "PUT",
		headers: {
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
			"X-Google-UID": googleUid,
			"X-Email": email,
		},
		body,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Replace failed (${response.status}): ${text}`);
	}
	return response.json();
});

ipc.handle("recipes:delete-image", async (_, { recipeId, imageId, googleUid, email }) => {
	const baseUrl = getHttpBaseUrl();
	const url = `${baseUrl}/api/recipes/${recipeId}/images/${imageId}`;

	const response = await net.fetch(url, {
		method: "DELETE",
		headers: {
			"X-Google-UID": googleUid,
			"X-Email": email,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Delete failed (${response.status}): ${text}`);
	}
	return { ok: true };
});
```

**Step 2: Commit**

```bash
git add src/main/ipc/registerHandlers.js
git commit -m "feat(recipes): add image upload/replace/delete IPC handlers"
```

---

### Task 5: Renderer State Store

**Files:**
- Create: `src/js/recipes/recipesState.js`

**Context:** Centralized state with pub/sub, following `src/js/finance/financeState.js`. All state mutations emit events so sections can re-render.

**Step 1: Create the state store**

```javascript
// src/js/recipes/recipesState.js

const state = {
	recipes: new Map(),
	savedRecipes: new Map(),
	groups: new Map(),
	groupMembers: new Map(),    // groupId → Member[]
	meals: [],
	mealsHasMore: true,
	mealsOffset: 0,
	currentPlan: null,
	planEntries: new Map(),     // entryId → MealPlanEntry
	suggestions: [],
	activeGroupId: null,        // null = personal context
};

const listeners = new Map();

export function getState() { return state; }

export function on(key, callback) {
	if (!listeners.has(key)) listeners.set(key, new Set());
	listeners.get(key).add(callback);
	return () => listeners.get(key).delete(callback);
}

export function emit(key) {
	const cbs = listeners.get(key);
	if (cbs) cbs.forEach(cb => cb(state[key]));
}

// ---- Recipes ----

export function setRecipes(list) {
	state.recipes.clear();
	for (const r of list) state.recipes.set(r.id, r);
	emit("recipes");
}

export function upsertRecipe(recipe) {
	state.recipes.set(recipe.id, recipe);
	emit("recipes");
}

export function removeRecipe(id) {
	state.recipes.delete(id);
	emit("recipes");
}

// ---- Saved Recipes ----

export function setSavedRecipes(list) {
	state.savedRecipes.clear();
	for (const r of list) state.savedRecipes.set(r.id, r);
	emit("savedRecipes");
}

export function removeSavedRecipe(id) {
	state.savedRecipes.delete(id);
	emit("savedRecipes");
}

// ---- Groups ----

export function setGroups(list) {
	state.groups.clear();
	for (const g of list) state.groups.set(g.id, g);
	emit("groups");
}

export function upsertGroup(group) {
	state.groups.set(group.id, group);
	emit("groups");
}

export function removeGroup(id) {
	state.groups.delete(id);
	if (state.activeGroupId === id) {
		state.activeGroupId = null;
	}
	emit("groups");
}

// ---- Group Members ----

export function setGroupMembers(groupId, members) {
	state.groupMembers.set(groupId, members);
	emit("groupMembers");
}

export function addGroupMember(groupId, member) {
	const members = state.groupMembers.get(groupId) || [];
	members.push(member);
	state.groupMembers.set(groupId, members);
	emit("groupMembers");
}

export function removeGroupMember(groupId, userId) {
	const members = state.groupMembers.get(groupId) || [];
	state.groupMembers.set(groupId, members.filter(m => m.user_id !== userId));
	emit("groupMembers");
}

// ---- Meals ----

export function setMeals(list, append = false) {
	if (append) {
		state.meals.push(...list);
	} else {
		state.meals = list;
	}
	state.mealsOffset = state.meals.length;
	state.mealsHasMore = list.length >= 50;
	emit("meals");
}

export function addMeal(meal) {
	state.meals.unshift(meal);
	emit("meals");
}

export function removeMeal(id) {
	state.meals = state.meals.filter(m => m.id !== id);
	emit("meals");
}

// ---- Planner ----

export function setPlan(plan, entries) {
	state.currentPlan = plan;
	state.planEntries.clear();
	if (entries) {
		for (const e of entries) state.planEntries.set(e.id, e);
	}
	emit("plan");
}

export function upsertPlanEntry(entry) {
	state.planEntries.set(entry.id, entry);
	emit("plan");
}

export function removePlanEntry(entryId) {
	state.planEntries.delete(entryId);
	emit("plan");
}

// ---- Suggestions ----

export function setSuggestions(list) {
	state.suggestions = list || [];
	emit("suggestions");
}

// ---- Active Group Context ----

export function setActiveGroup(groupId) {
	state.activeGroupId = groupId || null;
	emit("activeGroup");
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/recipesState.js
git commit -m "feat(recipes): add centralized state store with pub/sub"
```

---

### Task 6: Renderer Utilities

**Files:**
- Create: `src/js/recipes/recipesUtils.js`

**Context:** Shared DOM helpers and formatters used by all sections. Reuse the `el()` pattern from `src/js/finance/financeUtils.js`.

**Step 1: Create the utilities**

```javascript
// src/js/recipes/recipesUtils.js

// =========================================
// DOM helper (same as finance)
// =========================================

export function el(tag, attrs, ...children) {
	const elem = document.createElement(tag);
	if (attrs) {
		for (const [key, value] of Object.entries(attrs)) {
			if (value == null) continue;
			if (key === "class" || key === "className") {
				elem.className = value;
			} else if (key === "style" && typeof value === "object") {
				Object.assign(elem.style, value);
			} else if (key.startsWith("on") && typeof value === "function") {
				elem.addEventListener(key.slice(2).toLowerCase(), value);
			} else if (key === "checked" || key === "selected" || key === "disabled" || key === "readOnly") {
				elem[key] = value;
			} else {
				elem.setAttribute(key, value);
			}
		}
	}
	for (const child of children) {
		if (child == null) continue;
		if (typeof child === "string" || typeof child === "number") {
			elem.appendChild(document.createTextNode(String(child)));
		} else if (child instanceof Node) {
			elem.appendChild(child);
		}
	}
	return elem;
}

// =========================================
// Date helpers
// =========================================

const MONTHS_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(rfc3339) {
	const d = new Date(rfc3339);
	return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

export function formatDateShort(rfc3339) {
	const d = new Date(rfc3339);
	return MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
}

export function formatDateISO(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return y + "-" + m + "-" + d;
}

export function dayLabel(dateStr) {
	const d = new Date(dateStr + "T00:00:00");
	return DAYS_SHORT[d.getDay()] + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
}

export function addDays(dateStr, days) {
	const d = new Date(dateStr + "T00:00:00");
	d.setDate(d.getDate() + days);
	return formatDateISO(d);
}

// =========================================
// Image URL helper
// =========================================

export function imageUrl(filePath) {
	const base = (typeof process !== "undefined" && process.env?.APP_STAGE === "production")
		? "https://pythonws.dinodev.dev"
		: "http://localhost:8080";
	return base + "/" + filePath;
}

// =========================================
// Meal type helpers
// =========================================

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export function mealTypeLabel(type) {
	if (!type) return "";
	return type.charAt(0).toUpperCase() + type.slice(1);
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/recipesUtils.js
git commit -m "feat(recipes): add renderer utility helpers"
```

---

### Task 7: HTML Template and CSS Skeleton

**Files:**
- Create: `src/html/recipes.html`
- Create: `src/styles/recipes.css`

**Context:** Follow the Finance HTML/CSS pattern. Frameless window with sidebar nav and content area. Use CSS variables from `variables.css`.

**Step 1: Create the HTML template**

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Recipes</title>
	<link rel="stylesheet" href="../styles/variables.css" />
	<link rel="stylesheet" href="../styles/recipes.css" />
</head>
<body>
	<div class="rcp-app">
		<nav class="rcp-sidebar" id="rcp-sidebar">
			<div class="rcp-sidebar-header">
				<span class="rcp-sidebar-title">Recipes</span>
				<button class="rcp-close-btn" id="rcp-close-btn" title="Close">&times;</button>
			</div>
			<ul class="rcp-nav-list" id="rcp-nav-list">
			</ul>
			<div class="rcp-sidebar-footer" id="rcp-sidebar-footer">
			</div>
		</nav>
		<main class="rcp-content" id="rcp-content">
		</main>
	</div>
	<script type="module" src="../js/recipes/recipesWindow.js"></script>
</body>
</html>
```

**Step 2: Create the CSS**

Create `src/styles/recipes.css` with the following. This mirrors the finance CSS structure using CSS variables from `variables.css`:

```css
/* =========================================
   Layout
   ========================================= */

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
	font-family: "Nunito", system-ui, sans-serif;
	background: var(--color-bg-root);
	color: var(--color-text-primary);
	overflow: hidden;
	height: 100vh;
}

.rcp-app {
	display: flex;
	height: 100vh;
	-webkit-app-region: drag;
}

/* =========================================
   Sidebar
   ========================================= */

.rcp-sidebar {
	width: 200px;
	min-width: 200px;
	background: var(--color-bg-secondary);
	border-right: 1px solid var(--color-border-primary);
	display: flex;
	flex-direction: column;
	-webkit-app-region: drag;
}

.rcp-sidebar-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 14px 12px;
}

.rcp-sidebar-title {
	font-size: 15px;
	font-weight: 700;
	color: var(--color-text-primary);
}

.rcp-close-btn {
	-webkit-app-region: no-drag;
	background: none;
	border: none;
	color: var(--color-text-tertiary);
	font-size: 20px;
	cursor: pointer;
	padding: 2px 6px;
	border-radius: 4px;
	line-height: 1;
}

.rcp-close-btn:hover {
	background: var(--color-bg-tertiary);
	color: var(--color-text-primary);
}

.rcp-nav-list {
	list-style: none;
	flex: 1;
	overflow-y: auto;
	padding: 0 8px;
}

.rcp-nav-item {
	-webkit-app-region: no-drag;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	border-radius: 6px;
	cursor: pointer;
	font-size: 13px;
	color: var(--color-text-secondary);
	transition: background 0.15s ease, color 0.15s ease;
}

.rcp-nav-item:hover {
	background: var(--color-bg-tertiary);
	color: var(--color-text-primary);
}

.rcp-nav-item.active {
	background: var(--color-accent-subtle);
	color: var(--color-accent-primary);
	font-weight: 600;
}

.rcp-nav-icon {
	font-size: 15px;
	width: 20px;
	text-align: center;
	flex-shrink: 0;
}

.rcp-nav-label {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rcp-sidebar-footer {
	padding: 8px;
	border-top: 1px solid var(--color-border-primary);
}

/* =========================================
   Content area
   ========================================= */

.rcp-content {
	flex: 1;
	overflow-y: auto;
	padding: 20px 24px;
	-webkit-app-region: no-drag;
}

/* =========================================
   Shared UI components
   ========================================= */

.rcp-empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 200px;
	color: var(--color-text-tertiary);
	font-size: 14px;
}

.rcp-section-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16px;
}

.rcp-section-title {
	font-size: 18px;
	font-weight: 700;
	color: var(--color-text-primary);
}

.rcp-btn {
	-webkit-app-region: no-drag;
	padding: 6px 14px;
	border-radius: 6px;
	border: 1px solid var(--color-border-primary);
	background: var(--color-bg-secondary);
	color: var(--color-text-primary);
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s ease;
}

.rcp-btn:hover {
	background: var(--color-bg-tertiary);
}

.rcp-btn-primary {
	background: var(--color-accent-primary);
	border-color: var(--color-accent-primary);
	color: var(--color-text-white);
}

.rcp-btn-primary:hover {
	opacity: 0.9;
}

.rcp-btn-danger {
	background: var(--color-status-error);
	border-color: var(--color-status-error);
	color: var(--color-text-white);
}

.rcp-btn-danger:hover {
	opacity: 0.9;
}

.rcp-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.rcp-input {
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid var(--color-border-primary);
	background: var(--color-bg-input, var(--color-bg-secondary));
	color: var(--color-text-primary);
	font-size: 13px;
	font-family: inherit;
}

.rcp-input:focus {
	outline: none;
	border-color: var(--color-border-focus);
}

.rcp-textarea {
	padding: 8px 10px;
	border-radius: 6px;
	border: 1px solid var(--color-border-primary);
	background: var(--color-bg-input, var(--color-bg-secondary));
	color: var(--color-text-primary);
	font-size: 13px;
	font-family: inherit;
	resize: vertical;
	min-height: 80px;
}

.rcp-textarea:focus {
	outline: none;
	border-color: var(--color-border-focus);
}

/* =========================================
   Cards
   ========================================= */

.rcp-card {
	background: var(--color-bg-elevated);
	border: 1px solid var(--color-border-primary);
	border-radius: 8px;
	padding: 12px 14px;
	cursor: pointer;
	transition: background 0.15s ease, border-color 0.15s ease;
}

.rcp-card:hover {
	background: var(--color-bg-tertiary);
	border-color: var(--color-border-secondary);
}

.rcp-card-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--color-text-primary);
	margin-bottom: 4px;
}

.rcp-card-meta {
	font-size: 11px;
	color: var(--color-text-tertiary);
}

.rcp-card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 10px;
}

/* =========================================
   Tags
   ========================================= */

.rcp-tag {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	background: var(--color-accent-subtle);
	color: var(--color-accent-primary);
	border-radius: 10px;
	font-size: 11px;
	font-weight: 600;
}

.rcp-tag-remove {
	margin-left: 4px;
	cursor: pointer;
	opacity: 0.6;
}

.rcp-tag-remove:hover {
	opacity: 1;
}

.rcp-tags-row {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

/* =========================================
   Dialog / overlay
   ========================================= */

.rcp-dialog-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100;
}

.rcp-dialog {
	background: var(--color-bg-root);
	border: 1px solid var(--color-border-primary);
	border-radius: 12px;
	padding: 20px;
	min-width: 400px;
	max-width: 600px;
	max-height: 80vh;
	overflow-y: auto;
	box-shadow: 0 20px 48px rgba(0, 0, 0, 0.15);
}

.rcp-dialog-title {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 14px;
	color: var(--color-text-primary);
}

.rcp-dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 16px;
}

.rcp-form-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
}

.rcp-form-label {
	font-size: 12px;
	font-weight: 600;
	color: var(--color-text-secondary);
}

/* =========================================
   Detail view
   ========================================= */

.rcp-detail {
	max-width: 700px;
}

.rcp-detail-back {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	color: var(--color-text-tertiary);
	cursor: pointer;
	margin-bottom: 12px;
	padding: 4px 0;
}

.rcp-detail-back:hover {
	color: var(--color-accent-primary);
}

.rcp-detail-title {
	font-size: 22px;
	font-weight: 700;
	margin-bottom: 4px;
}

.rcp-detail-meta {
	font-size: 12px;
	color: var(--color-text-tertiary);
	margin-bottom: 16px;
}

.rcp-detail-section {
	margin-bottom: 20px;
}

.rcp-detail-section-title {
	font-size: 14px;
	font-weight: 700;
	color: var(--color-text-secondary);
	margin-bottom: 8px;
}

/* =========================================
   Ingredients list
   ========================================= */

.rcp-ingredients-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.rcp-ingredient-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
	font-size: 13px;
}

.rcp-ingredient-qty {
	color: var(--color-accent-primary);
	font-weight: 600;
	min-width: 60px;
}

.rcp-ingredient-name {
	flex: 1;
}

/* Ingredient editor (for edit mode) */
.rcp-ingredient-editor {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.rcp-ingredient-editor-row {
	display: flex;
	align-items: center;
	gap: 6px;
}

.rcp-ingredient-editor-row .rcp-input {
	flex: 1;
}

.rcp-ingredient-editor-row .rcp-input.qty {
	max-width: 60px;
}

.rcp-ingredient-editor-row .rcp-input.unit {
	max-width: 60px;
}

/* =========================================
   Image gallery
   ========================================= */

.rcp-images {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.rcp-image-thumb {
	width: 120px;
	height: 90px;
	object-fit: cover;
	border-radius: 6px;
	border: 1px solid var(--color-border-primary);
	cursor: pointer;
}

.rcp-image-thumb:hover {
	border-color: var(--color-accent-primary);
}

/* =========================================
   Meal plan grid
   ========================================= */

.rcp-plan-grid {
	display: grid;
	gap: 1px;
	background: var(--color-border-primary);
	border: 1px solid var(--color-border-primary);
	border-radius: 8px;
	overflow: hidden;
}

.rcp-plan-header {
	background: var(--color-bg-secondary);
	padding: 8px 10px;
	font-size: 12px;
	font-weight: 700;
	color: var(--color-text-secondary);
	text-align: center;
}

.rcp-plan-cell {
	background: var(--color-bg-root);
	padding: 6px 8px;
	min-height: 60px;
	font-size: 12px;
	cursor: pointer;
	transition: background 0.12s ease;
}

.rcp-plan-cell:hover {
	background: var(--color-bg-tertiary);
}

.rcp-plan-cell-name {
	font-weight: 600;
	color: var(--color-text-primary);
}

.rcp-plan-cell-empty {
	color: var(--color-text-tertiary);
	font-style: italic;
}

/* =========================================
   Group members
   ========================================= */

.rcp-member-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.rcp-member-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 10px;
	background: var(--color-bg-elevated);
	border-radius: 6px;
	font-size: 13px;
}

.rcp-member-email {
	color: var(--color-text-primary);
}

.rcp-member-role {
	font-size: 11px;
	color: var(--color-text-tertiary);
	font-weight: 600;
}

/* =========================================
   Toast
   ========================================= */

.rcp-toast {
	position: fixed;
	bottom: 20px;
	right: 20px;
	padding: 10px 18px;
	border-radius: 8px;
	font-size: 13px;
	font-weight: 600;
	z-index: 200;
	opacity: 0;
	transform: translateY(10px);
	transition: opacity 0.3s ease, transform 0.3s ease;
	pointer-events: none;
}

.rcp-toast--visible {
	opacity: 1;
	transform: translateY(0);
}

.rcp-toast--info {
	background: var(--color-accent-primary);
	color: var(--color-text-white);
}

.rcp-toast--error {
	background: var(--color-status-error);
	color: var(--color-text-white);
}

.rcp-toast--success {
	background: var(--color-status-success);
	color: var(--color-text-white);
}

/* =========================================
   Suggestion chips
   ========================================= */

.rcp-suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rcp-suggestion-chip {
	padding: 6px 12px;
	border-radius: 16px;
	border: 1px solid var(--color-border-primary);
	background: var(--color-bg-elevated);
	color: var(--color-text-primary);
	font-size: 13px;
	cursor: pointer;
	transition: background 0.12s ease, border-color 0.12s ease;
}

.rcp-suggestion-chip:hover {
	background: var(--color-accent-subtle);
	border-color: var(--color-accent-primary);
}

/* =========================================
   Workspace selector
   ========================================= */

.rcp-workspace-select {
	padding: 6px 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border-primary);
	background: var(--color-bg-elevated);
	color: var(--color-text-primary);
	font-size: 12px;
	cursor: pointer;
	-webkit-app-region: no-drag;
}

.rcp-workspace-select:focus {
	outline: none;
	border-color: var(--color-border-focus);
}
```

**Step 3: Commit**

```bash
git add src/html/recipes.html src/styles/recipes.css
git commit -m "feat(recipes): add HTML template and CSS styles"
```

---

### Task 8: Main Renderer Module (recipesWindow.js)

**Files:**
- Create: `src/js/recipes/recipesWindow.js`

**Context:** This is the main renderer entry point, following `src/js/finance/financeWindow.js`. It wires IPC, initializes sections, renders sidebar, handles event dispatch to state and active section.

**Step 1: Create the main renderer module**

```javascript
// src/js/recipes/recipesWindow.js

const { ipcRenderer } = require("electron");

import * as state from "./recipesState.js";
import * as utils from "./recipesUtils.js";
import * as recipes from "./recipesSection.js";
import * as groups from "./groupsSection.js";
import * as mealLog from "./mealLogSection.js";
import * as planner from "./plannerSection.js";
import * as saved from "./savedSection.js";

// =========================================
// Send helper
// =========================================

export const sendEvent = (event, data = {}) => {
	ipcRenderer.send("recipes-send", { event, data });
};

// =========================================
// Navigation config
// =========================================

const NAV_ITEMS = [
	{ id: "recipes", label: "My Recipes", icon: "\uD83C\uDF73" },
	{ id: "groups", label: "Groups", icon: "\uD83D\uDC65" },
	{ id: "mealLog", label: "Meal Log", icon: "\uD83D\uDCDD" },
	{ id: "planner", label: "Planner", icon: "\uD83D\uDCC5" },
	{ id: "saved", label: "Saved", icon: "\uD83D\uDD16" },
];

// =========================================
// Placeholder section module
// =========================================

function createPlaceholder(name) {
	return {
		init() {},
		render(container) {
			container.innerHTML = `<div class="rcp-empty-state">${name} — coming soon</div>`;
		},
		onEvent() {},
		destroy() {},
	};
}

// Section modules
const sections = {};
for (const item of NAV_ITEMS) {
	sections[item.id] = createPlaceholder(item.label);
}
sections["recipes"] = recipes;
sections["groups"] = groups;
sections["mealLog"] = mealLog;
sections["planner"] = planner;
sections["saved"] = saved;

// =========================================
// State
// =========================================

let activeSection = null;
let activeSectionId = null;

// =========================================
// Toast helper
// =========================================

function showToast(message, type = "info") {
	const toast = utils.el("div", { class: "rcp-toast rcp-toast--" + type }, message);
	document.body.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("rcp-toast--visible"));
	setTimeout(() => {
		toast.classList.remove("rcp-toast--visible");
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

// =========================================
// Sidebar rendering
// =========================================

function renderSidebar() {
	const navList = document.getElementById("rcp-nav-list");
	if (!navList) return;

	for (const item of NAV_ITEMS) {
		const li = utils.el("li", { class: "rcp-nav-item", "data-section": item.id },
			utils.el("span", { class: "rcp-nav-icon" }, item.icon),
			utils.el("span", { class: "rcp-nav-label" }, item.label),
		);
		li.addEventListener("click", () => switchSection(item.id));
		navList.appendChild(li);
	}
}

function renderWorkspaceSelector() {
	const footer = document.getElementById("rcp-sidebar-footer");
	if (!footer) return;

	const updateSelector = () => {
		footer.innerHTML = "";
		const s = state.getState();
		const select = utils.el("select", { class: "rcp-workspace-select" });
		select.appendChild(utils.el("option", { value: "" }, "Personal"));
		for (const [id, group] of s.groups) {
			const opt = utils.el("option", { value: id }, group.name);
			if (id === s.activeGroupId) opt.selected = true;
			select.appendChild(opt);
		}
		select.addEventListener("change", () => {
			state.setActiveGroup(select.value || null);
			// Re-render active section to reload data for new context
			if (activeSectionId) {
				const contentEl = document.getElementById("rcp-content");
				if (contentEl && activeSection) {
					activeSection.destroy();
					contentEl.innerHTML = "";
					activeSection.render(contentEl);
				}
			}
		});
		footer.appendChild(utils.el("div", { class: "rcp-form-label", style: { marginBottom: "4px" } }, "Workspace"));
		footer.appendChild(select);
	};

	state.on("groups", updateSelector);
	state.on("activeGroup", updateSelector);
	updateSelector();
}

function updateNavActive(sectionId) {
	const items = document.querySelectorAll(".rcp-nav-item");
	for (const item of items) {
		item.classList.toggle("active", item.dataset.section === sectionId);
	}
}

// =========================================
// Section switching
// =========================================

function switchSection(sectionId) {
	if (sectionId === activeSectionId) return;

	const contentEl = document.getElementById("rcp-content");
	if (!contentEl) return;

	if (activeSection) {
		activeSection.destroy();
	}

	contentEl.innerHTML = "";
	activeSectionId = sectionId;
	activeSection = sections[sectionId] || createPlaceholder(sectionId);
	activeSection.render(contentEl);
	updateNavActive(sectionId);
}

// =========================================
// Event dispatch — maps server events to state mutations
// =========================================

function handleStateEvent(event, data) {
	switch (event) {
		// Recipes
		case "recipe_list_data":
			state.setRecipes(data);
			break;
		case "recipe_created":
			state.upsertRecipe(data);
			break;
		case "recipe_updated": {
			// Polymorphic: could be metadata, ingredients, tags, or image change
			// The controller tags the type, but we also handle raw payloads
			const existing = state.getState().recipes.get(data.id);
			if (existing && data.title !== undefined) {
				state.upsertRecipe({ ...existing, ...data });
			}
			break;
		}
		case "recipe_deleted":
			state.removeRecipe(data.id);
			break;

		// Saved
		case "recipe_saved_list_data":
			state.setSavedRecipes(data);
			break;
		case "recipe_saved":
			// Will trigger a refetch in the saved section
			break;
		case "recipe_unsaved":
			state.removeSavedRecipe(data.id || data.recipe_id);
			break;

		// Groups
		case "recipe_group_list_data":
			state.setGroups(data);
			break;
		case "recipe_group_created":
			state.upsertGroup(data);
			break;
		case "recipe_group_deleted":
			state.removeGroup(data.id);
			break;
		case "recipe_group_member_joined":
			state.addGroupMember(data.group_id, data);
			break;
		case "recipe_group_member_left":
			state.removeGroupMember(data.group_id, data.user_id);
			break;

		// Meals
		case "meal_list_data":
			state.setMeals(data);
			break;
		case "meal_logged":
			state.addMeal(data);
			break;
		case "meal_deleted":
			state.removeMeal(data.id);
			break;

		// Planner
		case "meal_plan_created":
			state.setPlan(data, []);
			break;
		case "meal_plan_data":
			state.setPlan(data.plan || data, data.entries);
			break;
		case "meal_plan_entry_updated":
			state.upsertPlanEntry(data);
			break;
		case "meal_plan_entry_removed":
			state.removePlanEntry(data.entry_id || data.id);
			break;

		// Suggestions
		case "meal_suggestions_data":
			state.setSuggestions(data);
			break;

		// Errors
		case "connection_error":
			showToast(data.message || "Connection error", "error");
			break;

		case "recipes_reconnected":
			// Re-fetch core data
			sendEvent("recipe_group_list", {});
			if (activeSectionId) {
				const contentEl = document.getElementById("rcp-content");
				if (contentEl && activeSection) {
					activeSection.destroy();
					contentEl.innerHTML = "";
					activeSection.render(contentEl);
				}
			}
			break;
	}
}

// =========================================
// IPC listener
// =========================================

ipcRenderer.on("recipes-event", (_, { event, data }) => {
	handleStateEvent(event, data);
	activeSection?.onEvent?.(event, data);
});

// =========================================
// Close button
// =========================================

document.getElementById("rcp-close-btn").onclick = () => window.close();

// =========================================
// Init
// =========================================

const sharedCtx = { sendEvent, showToast, switchSection, state, utils };
recipes.init(sharedCtx);
groups.init(sharedCtx);
mealLog.init(sharedCtx);
planner.init(sharedCtx);
saved.init(sharedCtx);

renderSidebar();
renderWorkspaceSelector();
switchSection("recipes");

// Initial data fetch
sendEvent("recipe_group_list", {});

// Export for section modules
export { showToast, switchSection, state, utils };
```

**Step 2: Commit**

```bash
git add src/js/recipes/recipesWindow.js
git commit -m "feat(recipes): add main renderer module with event routing"
```

---

### Task 9: Recipes Section (My Recipes)

**Files:**
- Create: `src/js/recipes/recipesSection.js`

**Context:** This is the largest section. It shows a grid of recipe cards, a recipe detail view with ingredients/tags/images, and create/edit dialogs. Handles 11 recipe WebSocket events. Must support owner-only editing.

**Docs to check:**
- Contract sections 4.1–4.11 (recipe events)
- Contract section 3 (schema: Recipe, RecipeIngredient, RecipeImage, RecipeTag)
- HTTP endpoints for images (section 7)

**Step 1: Create the section module**

```javascript
// src/js/recipes/recipesSection.js

let ctx = null;
let container = null;
let unsubs = [];
let viewMode = "list"; // "list" | "detail" | "create" | "edit"
let selectedRecipeId = null;
let recipeDetail = null; // full recipe data from recipe_get (includes ingredients, images, tags)

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;
	viewMode = "list";
	selectedRecipeId = null;
	recipeDetail = null;

	unsubs.push(ctx.state.on("recipes", () => {
		if (viewMode === "list") renderList();
	}));

	renderList();

	// Fetch recipes for current workspace context
	const groupId = ctx.state.getState().activeGroupId;
	const payload = groupId ? { group_id: groupId } : {};
	ctx.sendEvent("recipe_list", payload);
}

export function onEvent(event, data) {
	if (event === "recipe_data") {
		recipeDetail = data;
		if (viewMode === "detail") renderDetail();
	}
	if (event === "recipe_updated") {
		// If we're viewing this recipe, refresh it
		if (viewMode === "detail" && selectedRecipeId) {
			ctx.sendEvent("recipe_get", { id: selectedRecipeId });
		}
	}
	if (event === "recipe_created" && viewMode === "list") {
		renderList();
	}
	if (event === "recipe_deleted") {
		if (viewMode === "detail" && selectedRecipeId === data.id) {
			viewMode = "list";
			selectedRecipeId = null;
			renderList();
		}
	}
}

export function destroy() {
	for (const u of unsubs) u();
	unsubs = [];
	container = null;
	recipeDetail = null;
}

// =========================================
// List view
// =========================================

function renderList() {
	if (!container) return;
	const { el } = ctx.utils;
	const s = ctx.state.getState();

	container.innerHTML = "";

	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "My Recipes"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => showCreateDialog() }, "+ New Recipe"),
	);
	container.appendChild(header);

	const recipes = [...s.recipes.values()];
	if (recipes.length === 0) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "No recipes yet. Create one to get started!"));
		return;
	}

	const grid = el("div", { class: "rcp-card-grid" });
	for (const recipe of recipes) {
		const card = el("div", { class: "rcp-card", onClick: () => openDetail(recipe.id) },
			el("div", { class: "rcp-card-title" }, recipe.title),
			el("div", { class: "rcp-card-meta" }, ctx.utils.formatDate(recipe.created_at)),
		);
		grid.appendChild(card);
	}
	container.appendChild(grid);
}

// =========================================
// Detail view
// =========================================

function openDetail(id) {
	selectedRecipeId = id;
	viewMode = "detail";
	recipeDetail = null;
	ctx.sendEvent("recipe_get", { id });
	renderDetail();
}

function renderDetail() {
	if (!container) return;
	const { el, imageUrl } = ctx.utils;

	container.innerHTML = "";

	const back = el("div", { class: "rcp-detail-back", onClick: () => { viewMode = "list"; renderList(); } }, "\u2190 Back to recipes");
	container.appendChild(back);

	if (!recipeDetail) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "Loading..."));
		return;
	}

	const recipe = recipeDetail.recipe;
	const ingredients = recipeDetail.ingredients || [];
	const images = recipeDetail.images || [];
	const tags = recipeDetail.tags || [];
	const isOwner = recipe.user_id === getCurrentUserId();

	const detail = el("div", { class: "rcp-detail" });

	// Title + actions
	const titleRow = el("div", { class: "rcp-section-header" },
		el("h1", { class: "rcp-detail-title" }, recipe.title),
	);
	if (isOwner) {
		titleRow.appendChild(el("div", { style: { display: "flex", gap: "6px" } },
			el("button", { class: "rcp-btn", onClick: () => showEditDialog(recipe) }, "Edit"),
			el("button", { class: "rcp-btn rcp-btn-danger", onClick: () => deleteRecipe(recipe.id) }, "Delete"),
		));
	} else {
		titleRow.appendChild(
			el("button", { class: "rcp-btn", onClick: () => saveRecipe(recipe.id) }, "Save to My Recipes")
		);
	}
	detail.appendChild(titleRow);

	detail.appendChild(el("div", { class: "rcp-detail-meta" }, "Created " + ctx.utils.formatDate(recipe.created_at)));

	// Tags
	if (tags.length > 0) {
		const tagsSection = el("div", { class: "rcp-detail-section" });
		tagsSection.appendChild(el("div", { class: "rcp-tags-row" },
			...tags.map(t => el("span", { class: "rcp-tag" }, t.tag))
		));
		detail.appendChild(tagsSection);
	}

	// Images
	if (images.length > 0) {
		const imgSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Photos"),
			el("div", { class: "rcp-images" },
				...images.sort((a, b) => a.position - b.position).map(img =>
					el("img", { class: "rcp-image-thumb", src: imageUrl(img.file_path), alt: "Recipe image" })
				),
			),
		);
		if (isOwner) {
			const uploadBtn = el("button", { class: "rcp-btn", style: { marginTop: "8px" }, onClick: () => uploadImage(recipe.id) }, "Upload Image");
			imgSection.appendChild(uploadBtn);
		}
		detail.appendChild(imgSection);
	} else if (isOwner) {
		const imgSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Photos"),
			el("button", { class: "rcp-btn", onClick: () => uploadImage(recipe.id) }, "Upload Image"),
		);
		detail.appendChild(imgSection);
	}

	// Ingredients
	const ingSection = el("div", { class: "rcp-detail-section" },
		el("h3", { class: "rcp-detail-section-title" }, "Ingredients"),
	);
	if (ingredients.length > 0) {
		const list = el("div", { class: "rcp-ingredients-list" });
		for (const ing of ingredients.sort((a, b) => a.position - b.position)) {
			const qty = ing.quantity ? (ing.quantity + (ing.unit ? " " + ing.unit : "")) : "";
			list.appendChild(el("div", { class: "rcp-ingredient-row" },
				el("span", { class: "rcp-ingredient-qty" }, qty),
				el("span", { class: "rcp-ingredient-name" }, ing.name),
			));
		}
		ingSection.appendChild(list);
	} else {
		ingSection.appendChild(el("div", { class: "rcp-empty-state", style: { height: "40px" } }, "No ingredients added"));
	}
	if (isOwner) {
		ingSection.appendChild(el("button", {
			class: "rcp-btn", style: { marginTop: "8px" },
			onClick: () => showIngredientsEditor(recipe.id, ingredients),
		}, "Edit Ingredients"));
	}
	detail.appendChild(ingSection);

	// Instructions
	if (recipe.instructions) {
		const instrSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Instructions"),
		);
		const pre = el("div", { style: { whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: "1.6" } });
		pre.textContent = recipe.instructions;
		instrSection.appendChild(pre);
		detail.appendChild(instrSection);
	}

	// Tags editor (owner only)
	if (isOwner) {
		const tagsEditorSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Manage Tags"),
		);
		const tagsRow = el("div", { class: "rcp-tags-row", style: { marginBottom: "6px" } });
		for (const t of tags) {
			tagsRow.appendChild(el("span", { class: "rcp-tag" },
				t.tag,
				el("span", { class: "rcp-tag-remove", onClick: () => removeTag(recipe.id, t, tags) }, " \u00d7"),
			));
		}
		tagsEditorSection.appendChild(tagsRow);
		const tagInput = el("input", { class: "rcp-input", placeholder: "Add tag...", style: { maxWidth: "200px" } });
		tagInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && tagInput.value.trim()) {
				const newTag = tagInput.value.trim();
				const newTags = [...tags.map(t => t.tag), newTag];
				ctx.sendEvent("recipe_tags_update", { id: recipe.id, tags: newTags, last_modified_at: Date.now() });
				tagInput.value = "";
			}
		});
		tagsEditorSection.appendChild(tagInput);
		detail.appendChild(tagsEditorSection);
	}

	container.appendChild(detail);
}

// =========================================
// Create / Edit dialogs
// =========================================

function showCreateDialog() {
	if (!container) return;
	const { el } = ctx.utils;

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "New Recipe"));

	const titleInput = el("input", { class: "rcp-input", placeholder: "Recipe title", style: { width: "100%", marginBottom: "10px" } });
	const instrInput = el("textarea", { class: "rcp-textarea", placeholder: "Instructions (optional)", style: { width: "100%" } });

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Title"), titleInput));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Instructions"), instrInput));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const title = titleInput.value.trim();
			if (!title) { ctx.showToast("Title is required", "error"); return; }
			ctx.sendEvent("recipe_create", {
				title,
				instructions: instrInput.value.trim(),
				last_modified_at: Date.now(),
			});
			overlay.remove();
		}}, "Create"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
	titleInput.focus();
}

function showEditDialog(recipe) {
	if (!container) return;
	const { el } = ctx.utils;

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "Edit Recipe"));

	const titleInput = el("input", { class: "rcp-input", value: recipe.title, style: { width: "100%", marginBottom: "10px" } });
	const instrInput = el("textarea", { class: "rcp-textarea", style: { width: "100%" } });
	instrInput.value = recipe.instructions || "";

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Title"), titleInput));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Instructions"), instrInput));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const title = titleInput.value.trim();
			if (!title) { ctx.showToast("Title is required", "error"); return; }
			ctx.sendEvent("recipe_update", {
				id: recipe.id,
				title,
				instructions: instrInput.value.trim(),
				last_modified_at: Date.now(),
			});
			overlay.remove();
		}}, "Save"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
	titleInput.focus();
}

// =========================================
// Ingredients editor
// =========================================

function showIngredientsEditor(recipeId, currentIngredients) {
	const { el } = ctx.utils;

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog", style: { minWidth: "500px" } });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "Edit Ingredients"));

	let ingredients = currentIngredients.map(i => ({ name: i.name, quantity: i.quantity || "", unit: i.unit || "" }));

	const listEl = el("div", { class: "rcp-ingredient-editor" });

	function renderRows() {
		listEl.innerHTML = "";
		ingredients.forEach((ing, idx) => {
			const row = el("div", { class: "rcp-ingredient-editor-row" },
				el("input", { class: "rcp-input", placeholder: "Name", value: ing.name, onChange: (e) => { ingredients[idx].name = e.target.value; } }),
				el("input", { class: "rcp-input qty", placeholder: "Qty", value: ing.quantity, onChange: (e) => { ingredients[idx].quantity = e.target.value; } }),
				el("input", { class: "rcp-input unit", placeholder: "Unit", value: ing.unit, onChange: (e) => { ingredients[idx].unit = e.target.value; } }),
				el("button", { class: "rcp-btn rcp-btn-danger", style: { padding: "4px 8px" }, onClick: () => {
					ingredients.splice(idx, 1);
					renderRows();
				}}, "\u00d7"),
			);
			listEl.appendChild(row);
		});
	}
	renderRows();

	dialog.appendChild(listEl);
	dialog.appendChild(el("button", { class: "rcp-btn", style: { marginTop: "8px" }, onClick: () => {
		ingredients.push({ name: "", quantity: "", unit: "" });
		renderRows();
	}}, "+ Add Ingredient"));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const valid = ingredients.filter(i => i.name.trim());
			ctx.sendEvent("recipe_ingredients_update", {
				id: recipeId,
				ingredients: valid.map((i, pos) => ({
					name: i.name.trim(),
					quantity: i.quantity || null,
					unit: i.unit || null,
					position: pos,
				})),
				last_modified_at: Date.now(),
			});
			overlay.remove();
		}}, "Save"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
}

// =========================================
// Actions
// =========================================

function deleteRecipe(id) {
	if (confirm("Delete this recipe?")) {
		ctx.sendEvent("recipe_delete", { id });
		viewMode = "list";
		selectedRecipeId = null;
		renderList();
	}
}

function saveRecipe(id) {
	ctx.sendEvent("recipe_save", { recipe_id: id });
	ctx.showToast("Recipe saved!", "success");
}

function removeTag(recipeId, tagToRemove, currentTags) {
	const newTags = currentTags.filter(t => t.id !== tagToRemove.id).map(t => t.tag);
	ctx.sendEvent("recipe_tags_update", { id: recipeId, tags: newTags, last_modified_at: Date.now() });
}

function uploadImage(recipeId) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/jpeg,image/png";
	input.onchange = async () => {
		const file = input.files?.[0];
		if (!file) return;
		try {
			const { ipcRenderer } = require("electron");
			await ipcRenderer.invoke("recipes:upload-image", {
				recipeId,
				filePath: file.path,
				googleUid: "", // Will be set by main process from userInfo
				email: "",
			});
			ctx.showToast("Image uploaded", "success");
			// Refresh detail
			ctx.sendEvent("recipe_get", { id: recipeId });
		} catch (err) {
			ctx.showToast("Upload failed: " + err.message, "error");
		}
	};
	input.click();
}

function getCurrentUserId() {
	// The server user ID is passed via IPC or stored — we'll get it from the main process
	try {
		const { ipcRenderer } = require("electron");
		return ipcRenderer.sendSync("get-server-user-id");
	} catch {
		return null;
	}
}
```

**Note:** The `getCurrentUserId()` function uses a sync IPC call. In Task 3 we need to ensure this handler exists. Add to `registerHandlers.js`:
```javascript
ipc.on("get-server-user-id", (event) => {
	event.returnValue = appState.serverUserId ?? null;
});
```

**Step 2: Commit**

```bash
git add src/js/recipes/recipesSection.js
git commit -m "feat(recipes): add My Recipes section with CRUD, ingredients, tags, images"
```

---

### Task 10: Groups Section

**Files:**
- Create: `src/js/recipes/groupsSection.js`

**Context:** Manages recipe groups: create, list, add/remove members by email, share/unshare recipes, delete. Shows group list and group detail with members + shared recipes. Handles 7 group WebSocket events.

**Docs to check:** Contract sections 5.1–5.7

**Step 1: Create the section module**

```javascript
// src/js/recipes/groupsSection.js

let ctx = null;
let container = null;
let unsubs = [];
let viewMode = "list"; // "list" | "detail"
let selectedGroupId = null;

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;
	viewMode = "list";
	selectedGroupId = null;

	unsubs.push(ctx.state.on("groups", () => {
		if (viewMode === "list") renderList();
	}));
	unsubs.push(ctx.state.on("groupMembers", () => {
		if (viewMode === "detail") renderDetail();
	}));

	renderList();
	ctx.sendEvent("recipe_group_list", {});
}

export function onEvent(event, data) {
	if (event === "recipe_group_created") {
		if (viewMode === "list") renderList();
	}
	if (event === "recipe_group_deleted") {
		if (viewMode === "detail" && selectedGroupId === data.id) {
			viewMode = "list";
			selectedGroupId = null;
			renderList();
		}
	}
	if (event === "recipe_group_member_joined" || event === "recipe_group_member_left") {
		if (viewMode === "detail" && selectedGroupId === data.group_id) {
			renderDetail();
		}
	}
	if (event === "recipe_group_recipe_shared" || event === "recipe_group_recipe_unshared") {
		if (viewMode === "detail" && selectedGroupId === data.group_id) {
			// Refetch group recipes
			ctx.sendEvent("recipe_list", { group_id: selectedGroupId });
		}
	}
}

export function destroy() {
	for (const u of unsubs) u();
	unsubs = [];
	container = null;
}

function renderList() {
	if (!container) return;
	const { el } = ctx.utils;
	const s = ctx.state.getState();

	container.innerHTML = "";

	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Groups"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => showCreateGroupDialog() }, "+ New Group"),
	);
	container.appendChild(header);

	const groups = [...s.groups.values()];
	if (groups.length === 0) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "No groups yet. Create one to share recipes!"));
		return;
	}

	const grid = el("div", { class: "rcp-card-grid" });
	for (const group of groups) {
		const card = el("div", { class: "rcp-card", onClick: () => openGroupDetail(group.id) },
			el("div", { class: "rcp-card-title" }, group.name),
			el("div", { class: "rcp-card-meta" }, "Created " + ctx.utils.formatDate(group.created_at)),
		);
		grid.appendChild(card);
	}
	container.appendChild(grid);
}

function openGroupDetail(id) {
	selectedGroupId = id;
	viewMode = "detail";
	renderDetail();
}

function renderDetail() {
	if (!container) return;
	const { el } = ctx.utils;
	const s = ctx.state.getState();
	const group = s.groups.get(selectedGroupId);
	if (!group) { viewMode = "list"; renderList(); return; }

	const isOwner = group.created_by === getCurrentUserId();
	const members = s.groupMembers.get(selectedGroupId) || [];

	container.innerHTML = "";

	container.appendChild(el("div", { class: "rcp-detail-back", onClick: () => { viewMode = "list"; renderList(); } }, "\u2190 Back to groups"));

	const titleRow = el("div", { class: "rcp-section-header" },
		el("h1", { class: "rcp-detail-title" }, group.name),
	);
	if (isOwner) {
		titleRow.appendChild(el("button", { class: "rcp-btn rcp-btn-danger", onClick: () => deleteGroup(group.id) }, "Delete Group"));
	} else {
		titleRow.appendChild(el("button", { class: "rcp-btn", onClick: () => leaveGroup(group.id) }, "Leave Group"));
	}
	container.appendChild(titleRow);

	// Members section
	const membersSection = el("div", { class: "rcp-detail-section" },
		el("h3", { class: "rcp-detail-section-title" }, "Members"),
	);

	const memberList = el("div", { class: "rcp-member-list" });
	for (const m of members) {
		const row = el("div", { class: "rcp-member-row" },
			el("span", { class: "rcp-member-email" }, m.email || m.first_name || m.user_id),
			el("span", { class: "rcp-member-role" }, m.role),
		);
		if (isOwner && m.role !== "owner") {
			row.appendChild(el("button", {
				class: "rcp-btn rcp-btn-danger", style: { padding: "2px 8px", fontSize: "11px" },
				onClick: () => removeMember(group.id, m.user_id),
			}, "Remove"));
		}
		memberList.appendChild(row);
	}
	membersSection.appendChild(memberList);

	if (isOwner) {
		const emailInput = el("input", { class: "rcp-input", placeholder: "Add member by email...", style: { marginTop: "8px", width: "250px" } });
		emailInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && emailInput.value.trim()) {
				ctx.sendEvent("recipe_group_member_add", { group_id: group.id, email: emailInput.value.trim() });
				emailInput.value = "";
			}
		});
		membersSection.appendChild(emailInput);
	}
	container.appendChild(membersSection);

	// Share recipe section (owner only)
	if (isOwner) {
		const shareSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Share a Recipe"),
		);
		const myRecipes = [...s.recipes.values()];
		if (myRecipes.length > 0) {
			const select = el("select", { class: "rcp-workspace-select", style: { width: "250px" } });
			select.appendChild(el("option", { value: "" }, "Select a recipe..."));
			for (const r of myRecipes) {
				select.appendChild(el("option", { value: r.id }, r.title));
			}
			const shareBtn = el("button", { class: "rcp-btn rcp-btn-primary", style: { marginLeft: "8px" }, onClick: () => {
				if (select.value) {
					ctx.sendEvent("recipe_group_share_recipe", { group_id: group.id, recipe_id: select.value });
					ctx.showToast("Recipe shared!", "success");
				}
			}}, "Share");
			shareSection.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, select, shareBtn));
		} else {
			shareSection.appendChild(el("div", { class: "rcp-card-meta" }, "Create some recipes first to share them."));
		}
		container.appendChild(shareSection);
	}
}

function showCreateGroupDialog() {
	const { el } = ctx.utils;

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "New Group"));

	const nameInput = el("input", { class: "rcp-input", placeholder: "Group name", style: { width: "100%", marginBottom: "10px" } });

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Name"), nameInput));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const name = nameInput.value.trim();
			if (!name) { ctx.showToast("Name is required", "error"); return; }
			ctx.sendEvent("recipe_group_create", { name, last_modified_at: Date.now() });
			overlay.remove();
		}}, "Create"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
	nameInput.focus();
}

function deleteGroup(id) {
	if (confirm("Delete this group? Members will keep copies of saved recipes.")) {
		ctx.sendEvent("recipe_group_delete", { id });
	}
}

function leaveGroup(groupId) {
	if (confirm("Leave this group?")) {
		const userId = getCurrentUserId();
		ctx.sendEvent("recipe_group_member_remove", { group_id: groupId, user_id: userId });
		viewMode = "list";
		renderList();
	}
}

function removeMember(groupId, userId) {
	ctx.sendEvent("recipe_group_member_remove", { group_id: groupId, user_id: userId });
}

function getCurrentUserId() {
	try {
		const { ipcRenderer } = require("electron");
		return ipcRenderer.sendSync("get-server-user-id");
	} catch {
		return null;
	}
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/groupsSection.js
git commit -m "feat(recipes): add Groups section with member management and sharing"
```

---

### Task 11: Meal Log Section

**Files:**
- Create: `src/js/recipes/mealLogSection.js`

**Context:** Log meals, browse history with pagination. Links to recipes optionally. Handles `meal_log`, `meal_delete`, `meal_list` events.

**Docs to check:** Contract sections 6.1–6.3

**Step 1: Create the section module**

```javascript
// src/js/recipes/mealLogSection.js

let ctx = null;
let container = null;
let unsubs = [];

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;

	unsubs.push(ctx.state.on("meals", () => renderContent()));

	renderContent();

	const groupId = ctx.state.getState().activeGroupId;
	const payload = { limit: 50 };
	if (groupId) payload.group_id = groupId;
	ctx.sendEvent("meal_list", payload);
}

export function onEvent(event, data) {
	if (event === "meal_logged" || event === "meal_deleted" || event === "meal_list_data") {
		renderContent();
	}
}

export function destroy() {
	for (const u of unsubs) u();
	unsubs = [];
	container = null;
}

function renderContent() {
	if (!container) return;
	const { el, MEAL_TYPES, mealTypeLabel, formatDate } = ctx.utils;
	const s = ctx.state.getState();

	container.innerHTML = "";

	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Meal Log"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => showLogMealDialog() }, "+ Log Meal"),
	);
	container.appendChild(header);

	const meals = s.meals;
	if (meals.length === 0) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "No meals logged yet."));
		return;
	}

	const list = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
	for (const meal of meals) {
		const row = el("div", { class: "rcp-card", style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "default" } },
			el("div", null,
				el("div", { class: "rcp-card-title" }, meal.name),
				el("div", { class: "rcp-card-meta" },
					(meal.meal_type ? mealTypeLabel(meal.meal_type) + " \u2022 " : "") + formatDate(meal.eaten_at || meal.created_at)
				),
			),
			el("button", {
				class: "rcp-btn rcp-btn-danger", style: { padding: "4px 8px", fontSize: "11px" },
				onClick: () => {
					ctx.sendEvent("meal_delete", { id: meal.id });
				},
			}, "Delete"),
		);
		list.appendChild(row);
	}
	container.appendChild(list);

	// Load more
	if (s.mealsHasMore) {
		container.appendChild(el("button", {
			class: "rcp-btn", style: { marginTop: "12px", alignSelf: "center" },
			onClick: () => {
				const groupId = s.activeGroupId;
				const payload = { limit: 50, offset: s.mealsOffset };
				if (groupId) payload.group_id = groupId;
				ctx.sendEvent("meal_list", payload);
			},
		}, "Load More"));
	}
}

function showLogMealDialog() {
	const { el, MEAL_TYPES, mealTypeLabel } = ctx.utils;
	const s = ctx.state.getState();

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "Log a Meal"));

	const nameInput = el("input", { class: "rcp-input", placeholder: "What did you eat?", style: { width: "100%" } });

	const typeSelect = el("select", { class: "rcp-workspace-select", style: { width: "100%" } });
	typeSelect.appendChild(el("option", { value: "" }, "No type"));
	for (const t of MEAL_TYPES) {
		typeSelect.appendChild(el("option", { value: t }, mealTypeLabel(t)));
	}

	// Optional recipe link
	const recipeSelect = el("select", { class: "rcp-workspace-select", style: { width: "100%" } });
	recipeSelect.appendChild(el("option", { value: "" }, "No recipe link"));
	for (const [id, r] of s.recipes) {
		recipeSelect.appendChild(el("option", { value: id }, r.title));
	}

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Meal name"), nameInput));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Type"), typeSelect));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Link to recipe"), recipeSelect));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const name = nameInput.value.trim();
			if (!name) { ctx.showToast("Meal name is required", "error"); return; }
			const payload = { name, last_modified_at: Date.now() };
			if (typeSelect.value) payload.meal_type = typeSelect.value;
			if (recipeSelect.value) payload.recipe_id = recipeSelect.value;
			const groupId = s.activeGroupId;
			if (groupId) payload.group_id = groupId;
			ctx.sendEvent("meal_log", payload);
			overlay.remove();
		}}, "Log"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
	nameInput.focus();
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/mealLogSection.js
git commit -m "feat(recipes): add Meal Log section with logging and history"
```

---

### Task 12: Planner Section

**Files:**
- Create: `src/js/recipes/plannerSection.js`

**Context:** Create/view meal plans with a grid (days x meal types). Fill slots manually or via suggestions. Tag-based suggestion filtering. Handles `meal_plan_*` and `meal_suggestions_*` events.

**Docs to check:** Contract sections 6.4–6.9

**Step 1: Create the section module**

```javascript
// src/js/recipes/plannerSection.js

let ctx = null;
let container = null;
let unsubs = [];

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;

	unsubs.push(ctx.state.on("plan", () => renderContent()));
	unsubs.push(ctx.state.on("suggestions", () => renderContent()));

	renderContent();

	// Try to fetch existing plan
	const s = ctx.state.getState();
	if (s.currentPlan) {
		ctx.sendEvent("meal_plan_get", { id: s.currentPlan.id });
	}
}

export function onEvent(event, data) {
	if (event === "meal_plan_data" || event === "meal_plan_created" ||
		event === "meal_plan_entry_updated" || event === "meal_plan_entry_removed" ||
		event === "meal_suggestions_data") {
		renderContent();
	}
}

export function destroy() {
	for (const u of unsubs) u();
	unsubs = [];
	container = null;
}

function renderContent() {
	if (!container) return;
	const { el, MEAL_TYPES, mealTypeLabel, dayLabel, formatDateISO, addDays } = ctx.utils;
	const s = ctx.state.getState();
	const plan = s.currentPlan;

	container.innerHTML = "";

	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Meal Planner"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => showCreatePlanDialog() }, "+ New Plan"),
	);
	container.appendChild(header);

	if (!plan) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "No active plan. Create one to start planning!"));
		return;
	}

	// Plan info
	container.appendChild(el("div", { class: "rcp-detail-meta" },
		"Plan: " + plan.start_date + " to " + plan.end_date
	));

	// Build grid
	const startDate = plan.start_date.split("T")[0];
	const endDate = plan.end_date.split("T")[0];
	const days = [];
	let current = startDate;
	while (current <= endDate) {
		days.push(current);
		current = addDays(current, 1);
	}

	const entries = [...s.planEntries.values()];

	// Grid: columns = meal types, rows = days
	const cols = MEAL_TYPES.length + 1; // day label + meal types
	const grid = el("div", {
		class: "rcp-plan-grid",
		style: { gridTemplateColumns: `120px repeat(${MEAL_TYPES.length}, 1fr)` },
	});

	// Header row
	grid.appendChild(el("div", { class: "rcp-plan-header" }, "Day"));
	for (const t of MEAL_TYPES) {
		grid.appendChild(el("div", { class: "rcp-plan-header" }, mealTypeLabel(t)));
	}

	// Data rows
	for (const day of days) {
		grid.appendChild(el("div", { class: "rcp-plan-header" }, dayLabel(day)));
		for (const mealType of MEAL_TYPES) {
			const entry = entries.find(e => {
				const entryDate = (e.date || "").split("T")[0];
				return entryDate === day && e.meal_type === mealType;
			});
			const cell = el("div", { class: "rcp-plan-cell" });
			if (entry) {
				cell.appendChild(el("div", { class: "rcp-plan-cell-name" }, entry.name));
				cell.addEventListener("click", () => {
					if (confirm("Remove " + entry.name + "?")) {
						ctx.sendEvent("meal_plan_entry_remove", { plan_id: plan.id, entry_id: entry.id });
					}
				});
			} else {
				cell.appendChild(el("div", { class: "rcp-plan-cell-empty" }, "+"));
				cell.addEventListener("click", () => showFillSlotDialog(plan.id, day, mealType));
			}
			grid.appendChild(cell);
		}
	}
	container.appendChild(grid);

	// Suggestions panel
	const sugPanel = el("div", { class: "rcp-detail-section", style: { marginTop: "20px" } },
		el("h3", { class: "rcp-detail-section-title" }, "Suggestions"),
	);

	const tagInput = el("input", { class: "rcp-input", placeholder: "Filter by tag (optional)", style: { width: "200px", marginRight: "8px" } });
	const suggestBtn = el("button", { class: "rcp-btn", onClick: () => {
		const payload = { count: 10 };
		if (tagInput.value.trim()) payload.tag = tagInput.value.trim();
		const groupId = s.activeGroupId;
		if (groupId) payload.group_id = groupId;
		ctx.sendEvent("meal_suggestions_get", payload);
	}}, "Get Suggestions");
	sugPanel.appendChild(el("div", { style: { display: "flex", alignItems: "center", marginBottom: "10px" } }, tagInput, suggestBtn));

	if (s.suggestions.length > 0) {
		const chips = el("div", { class: "rcp-suggestions" });
		for (const sug of s.suggestions) {
			chips.appendChild(el("div", { class: "rcp-suggestion-chip" }, sug.name));
		}
		sugPanel.appendChild(chips);
	}
	container.appendChild(sugPanel);
}

function showCreatePlanDialog() {
	const { el, formatDateISO } = ctx.utils;
	const s = ctx.state.getState();

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "New Meal Plan"));

	const today = formatDateISO(new Date());
	const startInput = el("input", { class: "rcp-input", type: "date", value: today, style: { width: "100%" } });
	const daysInput = el("input", { class: "rcp-input", type: "number", value: "7", min: "1", max: "30", style: { width: "100%" } });

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Start date"), startInput));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Days (1-30)"), daysInput));

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const payload = {
				start_date: startInput.value,
				num_days: parseInt(daysInput.value, 10) || 7,
				last_modified_at: Date.now(),
			};
			const groupId = s.activeGroupId;
			if (groupId) payload.group_id = groupId;
			ctx.sendEvent("meal_plan_create", payload);
			overlay.remove();
		}}, "Create"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
}

function showFillSlotDialog(planId, date, mealType) {
	const { el, mealTypeLabel } = ctx.utils;
	const s = ctx.state.getState();

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-title" }, "Add " + mealTypeLabel(mealType) + " for " + date));

	const nameInput = el("input", { class: "rcp-input", placeholder: "Meal name", style: { width: "100%" } });
	const recipeSelect = el("select", { class: "rcp-workspace-select", style: { width: "100%" } });
	recipeSelect.appendChild(el("option", { value: "" }, "No recipe link"));
	for (const [id, r] of s.recipes) {
		recipeSelect.appendChild(el("option", { value: id }, r.title));
	}

	// Auto-fill name when recipe selected
	recipeSelect.addEventListener("change", () => {
		if (recipeSelect.value) {
			const recipe = s.recipes.get(recipeSelect.value);
			if (recipe && !nameInput.value.trim()) {
				nameInput.value = recipe.title;
			}
		}
	});

	// Suggestion button
	const suggestBtn = el("button", { class: "rcp-btn", style: { marginTop: "8px" }, onClick: () => {
		ctx.sendEvent("meal_plan_suggest_slot", { plan_id: planId, date, meal_type: mealType, count: 5 });
	}}, "Suggest");

	// Show suggestions if available
	const sugArea = el("div", { class: "rcp-suggestions", style: { marginTop: "8px" } });
	for (const sug of s.suggestions) {
		sugArea.appendChild(el("div", {
			class: "rcp-suggestion-chip",
			onClick: () => {
				nameInput.value = sug.name;
				if (sug.recipe_id) recipeSelect.value = sug.recipe_id;
			},
		}, sug.name));
	}

	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Meal name"), nameInput));
	dialog.appendChild(el("div", { class: "rcp-form-group" }, el("label", { class: "rcp-form-label" }, "Link to recipe"), recipeSelect));
	dialog.appendChild(suggestBtn);
	dialog.appendChild(sugArea);

	const actions = el("div", { class: "rcp-dialog-actions" },
		el("button", { class: "rcp-btn", onClick: () => overlay.remove() }, "Cancel"),
		el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
			const name = nameInput.value.trim();
			if (!name) { ctx.showToast("Meal name is required", "error"); return; }
			const payload = {
				plan_id: planId,
				date,
				meal_type: mealType,
				name,
				last_modified_at: Date.now(),
			};
			if (recipeSelect.value) payload.recipe_id = recipeSelect.value;
			ctx.sendEvent("meal_plan_entry_set", payload);
			overlay.remove();
		}}, "Add"),
	);
	dialog.appendChild(actions);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
	document.body.appendChild(overlay);
	nameInput.focus();
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/plannerSection.js
git commit -m "feat(recipes): add Planner section with grid, entries, and suggestions"
```

---

### Task 13: Saved Section

**Files:**
- Create: `src/js/recipes/savedSection.js`

**Context:** Shows saved/bookmarked recipes (personal copies). Handles `recipe_saved_list`, `recipe_unsave` events. Simplest section.

**Docs to check:** Contract sections 4.9–4.11

**Step 1: Create the section module**

```javascript
// src/js/recipes/savedSection.js

let ctx = null;
let container = null;
let unsubs = [];

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;

	unsubs.push(ctx.state.on("savedRecipes", () => renderContent()));

	renderContent();
	ctx.sendEvent("recipe_saved_list", {});
}

export function onEvent(event, data) {
	if (event === "recipe_saved_list_data" || event === "recipe_saved" || event === "recipe_unsaved") {
		renderContent();
	}
	if (event === "recipe_saved" && data?.copied) {
		ctx.showToast("Recipe saved to your collection!", "success");
		ctx.sendEvent("recipe_saved_list", {});
	}
	if (event === "recipe_saved" && data?.already_saved) {
		ctx.showToast("Recipe already saved", "info");
	}
}

export function destroy() {
	for (const u of unsubs) u();
	unsubs = [];
	container = null;
}

function renderContent() {
	if (!container) return;
	const { el, formatDate } = ctx.utils;
	const s = ctx.state.getState();

	container.innerHTML = "";

	container.appendChild(el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Saved Recipes"),
	));

	const saved = [...s.savedRecipes.values()];
	if (saved.length === 0) {
		container.appendChild(el("div", { class: "rcp-empty-state" }, "No saved recipes. Save recipes from shared groups!"));
		return;
	}

	const grid = el("div", { class: "rcp-card-grid" });
	for (const recipe of saved) {
		const card = el("div", { class: "rcp-card" },
			el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
				el("div", null,
					el("div", { class: "rcp-card-title" }, recipe.title),
					el("div", { class: "rcp-card-meta" }, formatDate(recipe.created_at)),
				),
				el("button", {
					class: "rcp-btn", style: { padding: "4px 8px", fontSize: "11px" },
					onClick: (e) => {
						e.stopPropagation();
						ctx.sendEvent("recipe_unsave", { recipe_id: recipe.id });
					},
				}, "Unsave"),
			),
		);
		card.addEventListener("click", () => {
			// Switch to recipes section and view this recipe
			ctx.switchSection("recipes");
		});
		grid.appendChild(card);
	}
	container.appendChild(grid);
}
```

**Step 2: Commit**

```bash
git add src/js/recipes/savedSection.js
git commit -m "feat(recipes): add Saved section for bookmarked recipes"
```

---

### Task 14: Add Menu Entry and Context Menu Integration

**Files:**
- Modify: `src/main/menus/index.js` (or wherever `showMainContextMenu` builds the menu)

**Context:** Add "Recipes" to the main context menu so users can open the recipes window. Follow the same pattern as Finance.

**Step 1: Find and update the main context menu**

Look at how `openFinanceWindow` is used in the context menu and add `openRecipesWindow` in the same way. Add a "Recipes" menu item adjacent to the "Finance" item.

**Step 2: Commit**

```bash
git add src/main/menus/index.js
git commit -m "feat(recipes): add Recipes menu entry to main context menu"
```

---

### Task 15: Add `get-server-user-id` Sync IPC Handler

**Files:**
- Modify: `src/main/ipc/registerHandlers.js`

**Context:** The renderer sections use `ipcRenderer.sendSync("get-server-user-id")` to check ownership. This must be a synchronous IPC handler.

**Step 1: Add the handler**

In `registerHandlers.js`, add:

```javascript
ipc.on("get-server-user-id", (event) => {
	event.returnValue = appState.serverUserId ?? null;
});
```

Place it near the other recipes IPC handlers added in Task 3.

**Step 2: Commit**

```bash
git add src/main/ipc/registerHandlers.js
git commit -m "feat(recipes): add sync IPC handler for server user ID"
```

---

### Task 16: Verify and Test

**Step 1: Run the app**

```bash
npm start
```

**Step 2: Manual verification checklist**

- [ ] Recipes window opens from context menu
- [ ] Sidebar navigation switches between all 5 sections
- [ ] Workspace selector shows personal + groups
- [ ] Create a recipe → appears in list
- [ ] Open recipe detail → shows ingredients, tags, images sections
- [ ] Edit recipe title/instructions (owner only)
- [ ] Add/remove ingredients
- [ ] Add/remove tags
- [ ] Upload image
- [ ] Delete recipe
- [ ] Create a group → appears in group list
- [ ] Add member by email
- [ ] Share a recipe to group
- [ ] Switch workspace to group → see group recipes
- [ ] Log a meal
- [ ] Create a meal plan → grid appears
- [ ] Fill plan slots manually
- [ ] Get meal suggestions
- [ ] Save a recipe from group context
- [ ] View saved recipes
- [ ] Unsave a recipe
- [ ] Error toasts appear on connection errors
- [ ] Window close button works
- [ ] Reconnect after WebSocket drop refetches data

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(recipes): address issues found during testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Recipes Controller | `src/main/controllers/recipesController.js` |
| 2 | Window Factory | `src/main/windows/recipesWindow.js` |
| 3 | Wire into Main Process | `main.js`, windowManager, handlers, IPC |
| 4 | Image Upload IPC | `registerHandlers.js` |
| 5 | State Store | `src/js/recipes/recipesState.js` |
| 6 | Utilities | `src/js/recipes/recipesUtils.js` |
| 7 | HTML + CSS | `src/html/recipes.html`, `src/styles/recipes.css` |
| 8 | Main Renderer Module | `src/js/recipes/recipesWindow.js` |
| 9 | Recipes Section | `src/js/recipes/recipesSection.js` |
| 10 | Groups Section | `src/js/recipes/groupsSection.js` |
| 11 | Meal Log Section | `src/js/recipes/mealLogSection.js` |
| 12 | Planner Section | `src/js/recipes/plannerSection.js` |
| 13 | Saved Section | `src/js/recipes/savedSection.js` |
| 14 | Menu Entry | `src/main/menus/index.js` |
| 15 | User ID IPC | `registerHandlers.js` |
| 16 | Verify & Test | Manual testing |

**Total: 27/27 WebSocket events, 4/4 HTTP endpoints, all data structures, all special behaviors covered.**
