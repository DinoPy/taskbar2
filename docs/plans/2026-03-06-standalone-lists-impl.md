# Standalone Lists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add standalone lists — personal lists that exist without a parent task/schedule/occurrence — with full CRUD, runtime interaction, attach-to-target flow, and a `lists` command to open the standalone home.

**Architecture:** Reuse the existing `listWindow.js` with an `isStandalone` mode flag. Fix `surfaceKey()` in `listsController.js` to handle the `standalone_home` target (no `id` field). Add `standalone_list_attached` socket handler, a `get-attach-targets` IPC handler, and an attach picker overlay in the list window.

**Tech Stack:** Electron (main + renderer), vanilla JS DOM manipulation, WebSocket events, CSS

**Contract reference:** `docs/frontend_standalone_lists_ws_contract.md`

---

### Task 1: Fix `surfaceKey()` for standalone_home

The `surfaceKey()` function returns `null` when `target.id` is missing, which breaks the entire pipeline for `standalone_home` targets.

**Files:**
- Modify: `src/main/controllers/listsController.js:9-12`

**Step 1: Fix surfaceKey**

Change line 9-12 from:
```javascript
const surfaceKey = (target) => {
	if (!target?.kind || !target?.id) return null;
	return `${target.kind}:${target.id}`;
};
```

To:
```javascript
const surfaceKey = (target) => {
	if (!target?.kind) return null;
	if (target.kind === "standalone_home") return "standalone_home";
	if (!target.id) return null;
	return `${target.kind}:${target.id}`;
};
```

**Step 2: Fix the `lists-fetch` IPC guard**

The IPC handler at `src/main/ipc/registerHandlers.js:844` has `if (!target?.kind || !target?.id) return;` which rejects standalone_home targets. Change it:

```javascript
ipc.on("lists-fetch", (event, data) => {
    const target = data?.target;
    if (!target?.kind) return;
    if (target.kind !== "standalone_home" && !target.id) return;
    // ... rest unchanged
});
```

**Step 3: Fix `openListWindow` in windowManager**

At `src/main/controllers/windowManager.js:386`, the key uses `target.id` which is undefined for standalone_home. Fix:

```javascript
openListWindow({ target, props, onClose }) {
    const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
    const existing = state.listWindows.get(key);
    if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }
    const win = createListWindow({
        props: { target, ...props },
        onClose: () => { state.listWindows.delete(key); onClose?.(); },
    });
    state.listWindows.set(key, win);
    return win;
},
```

Also fix `getListWindow` and `closeListWindow` similarly (lines ~397-409):

```javascript
getListWindow(target) {
    const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
    const win = state.listWindows.get(key);
    if (win && !win.isDestroyed()) return win;
    state.listWindows.delete(key);
    return null;
},

closeListWindow(target) {
    const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
    const win = state.listWindows.get(key);
    if (win && !win.isDestroyed()) win.close();
},
```

**Step 4: Commit**

```bash
git add src/main/controllers/listsController.js src/main/ipc/registerHandlers.js src/main/controllers/windowManager.js
git commit -m "fix: handle standalone_home target in surfaceKey, IPC guard, and windowManager"
```

---

### Task 2: Add `lists` command to task switch

**Files:**
- Modify: `src/js/newIndex.js`

**Step 1: Add parseCommand case**

After the `llc` and `ll<n>` cases (~line 920), add:

```javascript
// Standalone lists home: lists
if (trimmed === 'lists') {
    return { type: 'open_lists_home' };
}
```

**Step 2: Add executeCommand case**

After the `list` case block (~line 1103), add:

```javascript
case 'open_lists_home':
    ipc.send("open-list-window", { target: { kind: "standalone_home" } });
    return { success: true, message: "Opening standalone lists" };
```

**Step 3: Add getCommandSuggestions entries**

In the empty-input block (~line 1118), add to the returned array:
```javascript
{ command: 'lists', description: 'open standalone lists' },
```

In the partial-match section, add before the `allCommands` array (~line 1157):
```javascript
if ('lists'.startsWith(trimmed) && trimmed.startsWith('l') && !trimmed.startsWith('ll')) {
    suggestions.push({ command: 'lists', description: 'open standalone lists' });
}
```

Also add to the `allCommands` array:
```javascript
{ command: 'lists', description: 'open standalone lists', pattern: /^lists$/ },
```

**Step 4: Update input placeholder**

Find the placeholder text that mentions `llc, ll1` and add `lists`:

Search for the placeholder string and append `, lists` to it.

**Step 5: Commit**

```bash
git add src/js/newIndex.js
git commit -m "feat: add lists command to task switch for standalone lists home"
```

---

### Task 3: Standalone mode in listWindow.js renderer

**Files:**
- Modify: `src/js/listWindow.js`

**Step 1: Add isStandalone state**

At the top state section (~line 8), add:
```javascript
let isStandalone = false;
```

**Step 2: Detect standalone mode on init**

In the `data-from-parent` handler (~line 747), detect standalone:
```javascript
ipc.on("data-from-parent", (_, data) => {
    if (!data?.target) return;
    target = data.target;
    isStandalone = target.kind === "standalone_home";

    // Standalone lists are never frozen
    isOwnerFrozen = isStandalone ? false : false;

    ipc.send("lists-fetch", { target });
});
```

**Step 3: Update header rendering for standalone mode**

In the `render()` function (~line 129), change the header target text:
```javascript
if (target) {
    if (isStandalone) {
        headerTarget.textContent = "";
        document.querySelector(".list-header-title").textContent = "Standalone Lists";
    } else {
        headerTarget.textContent = `${target.kind}: ${target.id.substring(0, 8)}...`;
    }
}
```

**Step 4: Update footer rendering for standalone mode**

In `renderFooter()` (~line 578), add standalone branch:
```javascript
const renderFooter = (bundle) => {
    if (isStandalone) {
        const listCount = listsPayload?.lists?.length ?? 0;
        footerOwner.textContent = `${listCount} list${listCount !== 1 ? "s" : ""}`;
        footerRev.textContent = bundle ? `rev ${bundle.definition.rev}` : "";
        footerStatus.textContent = bundle?.run ? bundle.run.status : "";
        return;
    }
    // ... existing code unchanged
};
```

**Step 5: Commit**

```bash
git add src/js/listWindow.js
git commit -m "feat: add standalone mode flag and UI adjustments to listWindow"
```

---

### Task 4: Delete confirmation for standalone lists

**Files:**
- Modify: `src/html/list.html`
- Modify: `src/styles/list.css`
- Modify: `src/js/listWindow.js`

**Step 1: Add delete confirmation dialog to HTML**

In `src/html/list.html`, after the item dialog (after line 127), add:

```html
<!-- Delete confirmation dialog -->
<dialog class="list-dialog" id="deleteConfirmDialog">
    <h3 class="list-dialog-title">Delete List</h3>
    <p class="list-dialog-message" id="deleteConfirmMessage">Are you sure? This cannot be undone.</p>
    <div class="list-dialog-actions">
        <button class="list-dialog-btn list-dialog-btn-danger" id="deleteConfirmSubmit">Delete</button>
        <button class="list-dialog-btn list-dialog-btn-cancel" id="deleteConfirmCancel">Cancel</button>
    </div>
</dialog>
```

**Step 2: Add danger button style to CSS**

In `src/styles/list.css`, after the existing `.list-dialog-btn-cancel` styles, add:

```css
.list-dialog-btn-danger {
	background: oklch(0.45 0.15 25);
	color: #fff;
}
.list-dialog-btn-danger:hover {
	background: oklch(0.50 0.18 25);
}

.list-dialog-message {
	color: var(--text-secondary, #b0b4c0);
	font-size: 13px;
	margin: 0 0 16px 0;
	line-height: 1.4;
}
```

**Step 3: Wire up delete confirmation in JS**

In `src/js/listWindow.js`, add DOM refs after the existing dialog refs (~line 60):

```javascript
const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");
const deleteConfirmMessage = document.getElementById("deleteConfirmMessage");
const deleteConfirmSubmit = document.getElementById("deleteConfirmSubmit");
const deleteConfirmCancel = document.getElementById("deleteConfirmCancel");
let pendingDeleteListId = null;
```

Add the dialog functions:

```javascript
const openDeleteConfirmDialog = (listId, title) => {
    pendingDeleteListId = listId;
    deleteConfirmMessage.textContent = `Delete "${title || "(untitled)"}"? This cannot be undone.`;
    deleteConfirmDialog.showModal();
};

const closeDeleteConfirmDialog = () => {
    pendingDeleteListId = null;
    deleteConfirmDialog.close();
};

const confirmDelete = () => {
    if (!pendingDeleteListId) return;
    sendMutation("list_delete", { id: pendingDeleteListId });
    closeDeleteConfirmDialog();
};
```

Add event listeners:
```javascript
deleteConfirmSubmit.addEventListener("click", confirmDelete);
deleteConfirmCancel.addEventListener("click", closeDeleteConfirmDialog);
```

**Step 4: Update sidebar delete button to use confirmation in standalone mode**

In `renderSidebar()` (~line 195), change the delete button click handler:

```javascript
deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isStandalone) {
        openDeleteConfirmDialog(def.id, def.title);
    } else {
        sendMutation("list_delete", { id: def.id });
    }
});
```

**Step 5: Handle Escape and Enter for delete dialog**

In the keyboard handler, add delete dialog handling before other dialog checks:

In the `Escape` handler, add:
```javascript
if (deleteConfirmDialog.open) { closeDeleteConfirmDialog(); return; }
```

In the `Enter` handler, add:
```javascript
if (deleteConfirmDialog.open) { confirmDelete(); return; }
```

**Step 6: Commit**

```bash
git add src/html/list.html src/styles/list.css src/js/listWindow.js
git commit -m "feat: add delete confirmation dialog for standalone lists"
```

---

### Task 5: Add `standalone_list_attached` socket handler

**Files:**
- Modify: `src/main/socket/handlers.js`
- Modify: `src/main/controllers/listsController.js`

**Step 1: Add handler in socket/handlers.js**

After the `list_run_updated` handler (~line 573), add:

```javascript
standalone_list_attached: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleStandaloneListAttached?.(payload);
},
```

**Step 2: Add `handleStandaloneListAttached` in listsController**

After `handleRunUpdated` (~line 236), add:

```javascript
const handleStandaloneListAttached = (payload) => {
    // The attach response just confirms source/destination.
    // The destination surface will be updated by the separate list_created broadcast.
    // Nothing to do for the standalone_home surface since source stays unchanged.
    log(`[ListsController] standalone_list_attached: source=${payload?.source?.list_id}, dest=${payload?.destination?.target?.kind}:${payload?.destination?.target?.id}`);
};
```

Add it to the returned controller object.

**Step 3: Add `standalone_list_attach` error type to error routing**

In `src/main/socket/handlers.js`, in the `connection_error` handler (~line 184), the `listErrorTypes` Set already includes the generic types that would cover attach errors (`invalid_list_target`, `not_found`, `unauthorized`, `list_owner_locked`, `invalid_data`). No change needed here.

**Step 4: Commit**

```bash
git add src/main/socket/handlers.js src/main/controllers/listsController.js
git commit -m "feat: add standalone_list_attached socket handler"
```

---

### Task 6: Add `get-attach-targets` IPC handler

The attach picker needs to know valid targets (active tasks, schedules, active occurrences). The main process has access to task and schedule data.

**Files:**
- Modify: `src/main/ipc/registerHandlers.js`

**Step 1: Add IPC handler**

After the `open-list-window` handler (~line 879), add:

```javascript
ipc.handle("get-attach-targets", () => {
    const targets = [];

    // Active tasks from appState
    const taskList = appState?.tasks ?? appState?.taskList ?? [];
    for (const t of (Array.isArray(taskList) ? taskList : Object.values(taskList))) {
        if (t?.id && t?.title) {
            targets.push({ kind: "task", id: t.id, label: t.title });
        }
    }

    // Schedules from appState if available
    const schedules = appState?.schedules ?? [];
    for (const s of (Array.isArray(schedules) ? schedules : Object.values(schedules))) {
        if (s?.id && s?.title) {
            targets.push({ kind: "schedule", id: s.id, label: s.title });
        }
    }

    return targets;
});
```

Note: Check how `appState` stores tasks. Look at what data is available. The renderer's `tasks` object is in newIndex.js but the main process has its own state. Examine `appState` usage to find the right property names. If tasks are not stored on `appState`, we may need to get them from the taskbar window via IPC.

**Step 2: Alternative approach if appState doesn't have task list**

If tasks aren't on `appState`, use `tasksController` which likely has a method to get current tasks. Check the available controller methods and use whichever provides the active task list.

**Step 3: Commit**

```bash
git add src/main/ipc/registerHandlers.js
git commit -m "feat: add get-attach-targets IPC handler"
```

---

### Task 7: Attach picker overlay in list window

**Files:**
- Modify: `src/html/list.html`
- Modify: `src/styles/list.css`
- Modify: `src/js/listWindow.js`

**Step 1: Add attach picker HTML**

In `src/html/list.html`, after the delete confirmation dialog, add:

```html
<!-- Attach picker overlay -->
<div class="list-attach-overlay hidden" id="attachOverlay">
    <div class="list-attach-picker">
        <div class="list-attach-header">
            <h3 class="list-attach-title">Attach to...</h3>
            <button class="list-attach-close" id="attachCloseBtn">&times;</button>
        </div>
        <input class="list-attach-input" id="attachInput" type="text" placeholder="Type to filter tasks and schedules..." autocomplete="off" />
        <div class="list-attach-results" id="attachResults"></div>
        <div class="list-attach-empty" id="attachEmpty">No matching targets</div>
    </div>
</div>
```

**Step 2: Add attach picker CSS**

In `src/styles/list.css`, add:

```css
/* Attach picker overlay */
.list-attach-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 60px;
	z-index: 200;
}
.list-attach-overlay.hidden {
	display: none;
}
.list-attach-picker {
	background: #1e2028;
	border: 1px solid #2a2d38;
	border-radius: 8px;
	width: 400px;
	max-height: 360px;
	display: flex;
	flex-direction: column;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.list-attach-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 10px 14px;
	border-bottom: 1px solid #2a2d38;
}
.list-attach-title {
	font-size: 14px;
	font-weight: 600;
	color: #e8e8e8;
	margin: 0;
}
.list-attach-close {
	background: none;
	border: none;
	color: #6b7080;
	font-size: 18px;
	cursor: pointer;
	padding: 0 4px;
}
.list-attach-close:hover {
	color: #e8e8e8;
}
.list-attach-input {
	margin: 10px 14px;
	padding: 8px 10px;
	background: #1a1c22;
	border: 1px solid #2a2d38;
	border-radius: 4px;
	color: #e8e8e8;
	font-size: 13px;
	outline: none;
}
.list-attach-input:focus {
	border-color: oklch(0.55 0.20 80);
}
.list-attach-results {
	flex: 1;
	overflow-y: auto;
	padding: 4px 0;
	max-height: 240px;
}
.list-attach-result-item {
	padding: 8px 14px;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: #e8e8e8;
}
.list-attach-result-item:hover,
.list-attach-result-item.focused {
	background: #2a2d38;
}
.list-attach-result-kind {
	font-size: 11px;
	color: #6b7080;
	text-transform: uppercase;
	min-width: 56px;
}
.list-attach-result-label {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.list-attach-empty {
	padding: 16px 14px;
	text-align: center;
	color: #6b7080;
	font-size: 13px;
}
.list-attach-empty.hidden {
	display: none;
}
```

**Step 3: Add attach picker JS**

In `src/js/listWindow.js`, add DOM refs:

```javascript
const attachOverlay = document.getElementById("attachOverlay");
const attachInput = document.getElementById("attachInput");
const attachResults = document.getElementById("attachResults");
const attachEmpty = document.getElementById("attachEmpty");
const attachCloseBtn = document.getElementById("attachCloseBtn");
let attachTargets = [];        // all available targets from main process
let attachFiltered = [];       // current filtered list
let attachFocusIndex = -1;     // arrow key navigation
let attachListId = null;       // which list we're attaching
```

Add the attach picker functions:

```javascript
const openAttachPicker = async (listId) => {
    attachListId = listId;
    attachFocusIndex = -1;
    attachInput.value = "";

    // Fetch targets from main process
    try {
        attachTargets = await ipc.invoke("get-attach-targets");
    } catch {
        attachTargets = [];
    }

    attachOverlay.classList.remove("hidden");
    attachInput.focus();
    filterAttachTargets("");
};

const closeAttachPicker = () => {
    attachOverlay.classList.add("hidden");
    attachListId = null;
    attachTargets = [];
    attachFiltered = [];
    attachFocusIndex = -1;
};

const filterAttachTargets = (query) => {
    const q = query.toLowerCase().trim();
    attachFiltered = q
        ? attachTargets.filter((t) => t.label.toLowerCase().includes(q) || t.kind.toLowerCase().includes(q))
        : [...attachTargets];

    renderAttachResults();
};

const renderAttachResults = () => {
    attachResults.innerHTML = "";
    attachEmpty.classList.toggle("hidden", attachFiltered.length > 0);

    for (let i = 0; i < attachFiltered.length; i++) {
        const t = attachFiltered[i];
        const el = document.createElement("div");
        el.className = "list-attach-result-item" + (i === attachFocusIndex ? " focused" : "");
        el.innerHTML = `<span class="list-attach-result-kind">${t.kind}</span><span class="list-attach-result-label">${escapeHtml(t.label)}</span>`;
        el.addEventListener("click", () => confirmAttach(t));
        attachResults.appendChild(el);
    }
};

const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
};

const confirmAttach = (targetRef) => {
    if (!attachListId) return;
    sendMutation("standalone_list_attach", {
        list_id: attachListId,
        target: { kind: targetRef.kind, id: targetRef.id },
        position: 0,
    });
    closeAttachPicker();
    showToast(`Attaching to ${targetRef.kind}: ${targetRef.label}`, 2000);
};
```

Add event listeners:

```javascript
attachCloseBtn.addEventListener("click", closeAttachPicker);
attachInput.addEventListener("input", (e) => {
    attachFocusIndex = -1;
    filterAttachTargets(e.target.value);
});
attachInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (attachFiltered.length > 0) {
            attachFocusIndex = Math.min(attachFocusIndex + 1, attachFiltered.length - 1);
            renderAttachResults();
        }
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (attachFiltered.length > 0) {
            attachFocusIndex = Math.max(attachFocusIndex - 1, 0);
            renderAttachResults();
        }
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (attachFocusIndex >= 0 && attachFocusIndex < attachFiltered.length) {
            confirmAttach(attachFiltered[attachFocusIndex]);
        }
    } else if (e.key === "Escape") {
        e.preventDefault();
        closeAttachPicker();
    }
});
```

**Step 4: Add Escape handler for overlay**

In the main keyboard handler's Escape branch, add before other checks:
```javascript
if (!attachOverlay.classList.contains("hidden")) { closeAttachPicker(); return; }
```

**Step 5: Commit**

```bash
git add src/html/list.html src/styles/list.css src/js/listWindow.js
git commit -m "feat: add attach picker overlay for standalone lists"
```

---

### Task 8: Add "Attach to..." button to sidebar items in standalone mode

**Files:**
- Modify: `src/js/listWindow.js`
- Modify: `src/styles/list.css`

**Step 1: Add attach button in renderSidebar**

In `renderSidebar()`, inside the sidebar item actions div creation (~line 188-199), add an attach button before the delete button, but only in standalone mode:

```javascript
if (isStandalone) {
    const attachBtn = document.createElement("button");
    attachBtn.className = "list-sidebar-item-action attach";
    attachBtn.textContent = "\u{1F517}"; // link emoji or use "⤴"
    attachBtn.title = "Attach to task or schedule";
    attachBtn.setAttribute("tabindex", "-1");
    attachBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAttachPicker(def.id);
    });
    actionsDiv.appendChild(attachBtn);
}
```

**Step 2: Add CSS for attach button**

```css
.list-sidebar-item-action.attach {
	font-size: 12px;
}
```

**Step 3: Commit**

```bash
git add src/js/listWindow.js src/styles/list.css
git commit -m "feat: add attach button to standalone list sidebar items"
```

---

### Task 9: Handle `standalone_list_attached` success toast in renderer

**Files:**
- Modify: `src/js/listWindow.js`

**Step 1: Listen for attach success in renderer**

Add an IPC listener for a custom event from main that indicates attach succeeded. Since the `standalone_list_attached` broadcast goes through the listsController and eventually pushes to subscribers, we need to forward this to the renderer.

In `src/main/controllers/listsController.js`, update `handleStandaloneListAttached`:

```javascript
const handleStandaloneListAttached = (payload) => {
    log(`[ListsController] standalone_list_attached: source=${payload?.source?.list_id}, dest=${payload?.destination?.target?.kind}:${payload?.destination?.target?.id}`);
    // Notify standalone_home subscribers about the successful attach
    const key = "standalone_home";
    const subs = surfaceSubscribers.get(key);
    if (subs) {
        for (const [, ref] of subs) {
            try {
                ref._pushFn("lists-attach-success", payload);
            } catch (err) {
                log(`[ListsController] attach notify error: ${err}`);
            }
        }
    }
};
```

In `src/js/listWindow.js`, add IPC handler:

```javascript
ipc.on("lists-attach-success", (_, payload) => {
    const dest = payload?.destination;
    if (dest?.target) {
        showToast(`List attached to ${dest.target.kind} successfully`, 3000);
    }
});
```

**Step 2: Commit**

```bash
git add src/main/controllers/listsController.js src/js/listWindow.js
git commit -m "feat: show success toast on standalone list attach"
```

---

### Task 10: Handle reconnect for standalone surface

**Files:**
- Modify: `src/js/listWindow.js`

**Step 1: Listen for socket reconnect and refetch**

The contract says: "after a reconnect, the frontend must re-issue `lists_fetch(target=standalone_home)` if the standalone lists surface is visible."

The main process `listsController.refetchAllActive()` already re-fetches all active surfaces on reconnect (called from `connected` handler). Since the standalone surface remains subscribed while the window is open, this should work automatically.

Verify by checking `refetchAllActive()` in listsController — it iterates `surfaces` and re-sends `lists_fetch` for each. Since `standalone_home` uses surfaceKey `"standalone_home"`, we need to reconstruct the target from the key.

In `src/main/controllers/listsController.js`, check `refetchAllActive()`:

```javascript
const refetchAllActive = () => {
    for (const [key] of surfaces) {
        // Reconstruct target from key
        if (key === "standalone_home") {
            sendEvent?.("lists_fetch", { target: { kind: "standalone_home" } });
        } else {
            const [kind, id] = key.split(":");
            if (kind && id) {
                sendEvent?.("lists_fetch", { target: { kind, id } });
            }
        }
    }
};
```

Check if the existing `refetchAllActive()` already handles this or needs the fix. If it splits the key by `:` and requires both `kind` and `id`, it will fail for `"standalone_home"`. Fix it if needed.

**Step 2: Commit**

```bash
git add src/main/controllers/listsController.js
git commit -m "fix: handle standalone_home in refetchAllActive reconnect"
```

---

### Task 11: Update help panel with standalone-specific shortcuts

**Files:**
- Modify: `src/html/list.html`
- Modify: `src/js/listWindow.js`

**Step 1: Add standalone shortcuts to help panel**

In the help panel HTML Actions section, add a note about standalone-specific keys. Since the help panel is shared, we can conditionally show standalone items via JS, or just include them statically since they're harmless in attached mode.

Add to the Actions section in `src/html/list.html`:

```html
<dt><kbd>x</kbd></dt><dd>Delete selected list</dd>
```

**Step 2: Add 'x' keyboard shortcut for delete**

In the keyboard handler in `listWindow.js`, add:

```javascript
if (e.key === "x" && isStandalone && selectedListId && !dialogOpen) {
    const bundle = getSelectedBundle();
    openDeleteConfirmDialog(selectedListId, bundle?.definition?.title);
    return;
}
```

Where `dialogOpen` checks if any dialog is open:
```javascript
const dialogOpen = addListDialog.open || itemDialog.open || deleteConfirmDialog.open || !attachOverlay.classList.contains("hidden");
```

**Step 3: Commit**

```bash
git add src/html/list.html src/js/listWindow.js
git commit -m "feat: add x shortcut for delete in standalone mode"
```

---

### Task 12: Final integration test and cleanup

**Step 1: Manual test checklist**

Verify these flows work:
1. Type `lists` in task switch → standalone list window opens
2. Create a standalone list via "+ Add List"
3. Add items (checkbox, timer, note) to the list
4. Toggle checkboxes, start/pause timers, write notes
5. Delete a list → confirmation dialog appears → confirm → list removed
6. Click "Attach to..." → picker opens → type to filter → select target → toast confirms
7. Close and reopen → type `lists` again → same window focuses (reuse)
8. Attached list window still works normally (no regression)
9. `llc` and `ll1` commands still work for task-attached lists
10. Help panel (`?`) shows correctly

**Step 2: Check for any regressions**

Verify that:
- `surfaceKey()` still returns correct keys for task/schedule/occurrence targets
- `lists-fetch` IPC handler still works for attached list targets
- `openListWindow` still works for attached list windows
- `refetchAllActive` handles both standalone and attached surfaces

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: standalone lists integration cleanup"
```
