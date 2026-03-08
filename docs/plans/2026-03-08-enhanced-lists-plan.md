# Enhanced Standalone Lists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance standalone lists with organization (pinning, tags, status, search), sharing/collaboration, richer item fields (quantity/unit), list duplication, and item cancellation.

**Architecture:** All changes build on the existing two-layer architecture (list definition + list run). The renderer (`listWindow.js`), controller (`listsController.js`), and socket/IPC handlers are extended. No new windows or processes.

**Tech Stack:** Electron (main + renderer), vanilla JS DOM manipulation, CSS, WebSocket events via IPC bridge.

**Contract:** `docs/frontend_enhanced_lists_ws_contract.md`

---

### Task 1: Wire new server events in socket handlers

Add handlers for the 5 new server→client events so the controller can receive them.

**Files:**
- Modify: `src/main/socket/handlers.js:496-592`

**Step 1: Add new event handlers after `standalone_list_attached` (line 592)**

Add these handlers following the exact same pattern as existing list handlers (parse JSON if string, forward to controller):

```javascript
list_share_created: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleShareCreated?.(payload);
},
list_share_removed: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleShareRemoved?.(payload);
},
list_shares_list: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleSharesList?.(payload);
},
list_run_item_assigned: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleRunItemAssigned?.(payload);
},
list_run_item_unassigned: ({ data }) => {
    let payload = data;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload) return;
    listsController?.handleRunItemUnassigned?.(payload);
},
```

Also add `list_share_created` and `list_share_removed` to the error handler section around line 195-208 so these error types are forwarded properly.

**Step 2: Commit**

```bash
git add src/main/socket/handlers.js
git commit -m "feat(lists): wire new server events for sharing and assignments"
```

---

### Task 2: Extend lists controller with new handler stubs

Add handler methods to the controller so socket events have somewhere to land. For now they just forward to subscribers (the renderer windows). Sharing events need special handling because they can affect the standalone_home surface.

**Files:**
- Modify: `src/main/controllers/listsController.js`

**Step 1: Add handler methods**

After the existing `handleStandaloneListAttached` method (~line 244), add:

```javascript
handleShareCreated(payload) {
    // Share created — refetch standalone_home to pick up newly shared list
    const key = "standalone_home";
    const surface = surfaces.get(key);
    if (surface) {
        // Broadcast to all standalone_home subscribers
        pushToSubscribers(key, surface);
    }
    // Also refetch so invitee sees the new list
    refetchAllActive();
    // Forward to all subscribers for toast/UI
    for (const [wKey, subscribers] of surfaceSubscribers) {
        for (const [, winRef] of subscribers) {
            winRef?.webContents?.send?.("lists-share-created", payload);
        }
    }
},

handleShareRemoved(payload) {
    // Share removed — refetch standalone_home
    refetchAllActive();
    // Forward to subscribers
    for (const [, subscribers] of surfaceSubscribers) {
        for (const [, winRef] of subscribers) {
            winRef?.webContents?.send?.("lists-share-removed", payload);
        }
    }
},

handleSharesList(payload) {
    // Forward shares list to all standalone subscribers
    for (const [, subscribers] of surfaceSubscribers) {
        for (const [, winRef] of subscribers) {
            winRef?.webContents?.send?.("lists-shares-list", payload);
        }
    }
},

handleRunItemAssigned(payload) {
    // Forward to subscribers — UI will update the run item display
    for (const [, subscribers] of surfaceSubscribers) {
        for (const [, winRef] of subscribers) {
            winRef?.webContents?.send?.("lists-run-item-assigned", payload);
        }
    }
},

handleRunItemUnassigned(payload) {
    for (const [, subscribers] of surfaceSubscribers) {
        for (const [, winRef] of subscribers) {
            winRef?.webContents?.send?.("lists-run-item-unassigned", payload);
        }
    }
},
```

**Step 2: Expose new methods in the returned object** at the bottom of `createListsController`.

**Step 3: Commit**

```bash
git add src/main/controllers/listsController.js
git commit -m "feat(lists): add controller handlers for sharing and assignment events"
```

---

### Task 3: Migrate `is_completed` to `status` in renderer

This is the critical data model migration. Replace all `ri.is_completed` checks with `ri.status === "completed"` in the renderer.

**Files:**
- Modify: `src/js/listWindow.js:429,462`

**Step 1: Update run item CSS class (line 429)**

Change:
```javascript
el.className = "list-run-item" + (isChild ? " child" : "") + (ri.is_completed ? " completed" : "");
```
To:
```javascript
el.className = "list-run-item" + (isChild ? " child" : "") + (ri.status === "completed" ? " completed" : "") + (ri.status === "cancelled" ? " cancelled" : "");
```

**Step 2: Update checkbox checked state (line 462)**

Change:
```javascript
checkbox.checked = !!ri.is_completed;
```
To:
```javascript
checkbox.checked = ri.status === "completed";
```

**Step 3: Commit**

```bash
git add src/js/listWindow.js
git commit -m "fix(lists): migrate is_completed to status field for run items"
```

---

### Task 4: Add cancelled item styling and cancel/restore UI

Add the visual treatment for cancelled items (strikethrough, dimmed) and cancel/restore buttons.

**Files:**
- Modify: `src/styles/list.css`
- Modify: `src/js/listWindow.js`

**Step 1: Add CSS for cancelled state**

In `list.css`, after the `.list-run-item.completed` rule (~line 505):

```css
.list-run-item.cancelled {
    opacity: 0.5;
}

.list-run-item.cancelled .list-run-item-title {
    text-decoration: line-through;
    color: var(--color-text-tertiary);
}

.list-run-item-cancel-btn,
.list-run-item-restore-btn {
    background: none;
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-tertiary);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
    flex-shrink: 0;
}

.list-run-item:hover .list-run-item-cancel-btn,
.list-run-item:hover .list-run-item-restore-btn {
    opacity: 1;
}

.list-run-item-cancel-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-urgency-high);
}

.list-run-item-restore-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-accent-primary);
}
```

**Step 2: Add cancel/restore buttons to checkbox run items**

In `listWindow.js`, in `renderCheckboxRunItem` (after line 485, before `el.appendChild(content)`):

```javascript
if (!readonly && snap.item_id) {
    if (ri.status === "cancelled") {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "list-run-item-restore-btn";
        restoreBtn.textContent = "Restore";
        restoreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sendMutation("list_run_item_restore", {
                run_id: run.id,
                item_id: snap.item_id,
                last_modified_at: Date.now(),
            });
        });
        el.appendChild(restoreBtn);
    } else if (ri.status === "pending") {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "list-run-item-cancel-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sendMutation("list_run_item_cancel", {
                run_id: run.id,
                item_id: snap.item_id,
                last_modified_at: Date.now(),
            });
        });
        el.appendChild(cancelBtn);
    }
}
```

Also disable the checkbox for cancelled items — add after `checkbox.checked = ri.status === "completed"`:

```javascript
if (ri.status === "cancelled") {
    checkbox.disabled = true;
}
```

**Step 3: Commit**

```bash
git add src/styles/list.css src/js/listWindow.js
git commit -m "feat(lists): add cancel/restore UI for run items with strikethrough styling"
```

---

### Task 5: Add quantity/unit to item dialog and display

Add quantity and unit fields to the item create/edit dialog, and display them inline after the title in both template and run views.

**Files:**
- Modify: `src/html/list.html:97-127`
- Modify: `src/js/listWindow.js`

**Step 1: Add quantity/unit fields to item dialog HTML**

In `list.html`, after the description textarea (line 122), before the dialog actions div (line 123):

```html
<div class="list-dialog-quantity-row">
    <div class="list-dialog-quantity-field">
        <label class="list-dialog-label" for="itemQuantityInput">Quantity</label>
        <input class="list-dialog-input" id="itemQuantityInput" type="text" placeholder="e.g. 2" />
    </div>
    <div class="list-dialog-quantity-field">
        <label class="list-dialog-label" for="itemUnitInput">Unit</label>
        <input class="list-dialog-input" id="itemUnitInput" type="text" placeholder="e.g. kg, L, pcs" />
    </div>
</div>
```

**Step 2: Add CSS for quantity row**

In `list.css`:

```css
.list-dialog-quantity-row {
    display: flex;
    gap: var(--spacing-sm);
}

.list-dialog-quantity-field {
    flex: 1;
}
```

**Step 3: Wire quantity/unit in JS**

In `listWindow.js`, add DOM refs near line 60:
```javascript
const itemQuantityInput = document.getElementById("itemQuantityInput");
const itemUnitInput = document.getElementById("itemUnitInput");
```

In `openItemDialog` (~line 694), add:
```javascript
itemQuantityInput.value = existingItem?.quantity ?? "";
itemUnitInput.value = existingItem?.unit ?? "";
```

In `submitItemDialog` (~line 823), add quantity/unit to both create and edit payloads:
```javascript
const quantity = itemQuantityInput.value.trim() || null;
const unit = itemUnitInput.value.trim() || "";
```
Add `quantity` and `unit` to both `list_item_create` and `list_item_edit` payloads.

**Step 4: Display quantity/unit inline in template items**

In `renderTemplateItems`, where the title is rendered (~line 292), after the title text, append quantity/unit:
```javascript
if (item.quantity || item.unit) {
    const qtySpan = document.createElement("span");
    qtySpan.className = "list-item-quantity";
    qtySpan.textContent = ` — ${item.quantity || ""}${item.unit ? " " + item.unit : ""}`;
    titleSpan.appendChild(qtySpan);
}
```

**Step 5: Display quantity/unit in run items**

In `renderCheckboxRunItem`, after setting title text (~line 477):
```javascript
if (snap.quantity || snap.unit) {
    const qtySpan = document.createElement("span");
    qtySpan.className = "list-item-quantity";
    qtySpan.textContent = ` — ${snap.quantity || ""}${snap.unit ? " " + snap.unit : ""}`;
    title.appendChild(qtySpan);
}
```

Add same pattern to `renderTimerRunItem` and `renderNoteRunItem`.

**Step 6: Add CSS for quantity display**

```css
.list-item-quantity {
    color: var(--color-text-tertiary);
    font-weight: 400;
    font-size: 11px;
}
```

**Step 7: Commit**

```bash
git add src/html/list.html src/js/listWindow.js src/styles/list.css
git commit -m "feat(lists): add quantity/unit fields to items with inline display"
```

---

### Task 6: Add search and status filter to standalone sidebar

Add always-visible search input and status dropdown above the sidebar list. Wire them to send filtered `lists_fetch` requests.

**Files:**
- Modify: `src/html/list.html:28-31`
- Modify: `src/js/listWindow.js`
- Modify: `src/styles/list.css`

**Step 1: Add filter bar HTML**

In `list.html`, after `<aside class="list-sidebar" id="listSidebar">` (line 28), before the sidebarItems div (line 29):

```html
<div class="list-sidebar-filter" id="sidebarFilter">
    <input class="list-sidebar-search" id="sidebarSearch" type="text" placeholder="Search lists..." autocomplete="off" />
    <select class="list-sidebar-status-filter" id="sidebarStatusFilter">
        <option value="active">Active</option>
        <option value="">All</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
    </select>
</div>
```

**Step 2: Add CSS**

```css
.list-sidebar-filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 0 var(--spacing-sm) 0;
}

.list-sidebar-search {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-primary);
    border-radius: 6px;
    color: var(--color-text-primary);
    font-size: 12px;
    padding: 5px 8px;
    font-family: inherit;
    outline: none;
}

.list-sidebar-search:focus {
    border-color: var(--color-accent-primary);
}

.list-sidebar-status-filter {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-primary);
    border-radius: 6px;
    color: var(--color-text-primary);
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
}
```

**Step 3: Wire JS**

In `listWindow.js`, add DOM refs:
```javascript
const sidebarFilter = document.getElementById("sidebarFilter");
const sidebarSearch = document.getElementById("sidebarSearch");
const sidebarStatusFilter = document.getElementById("sidebarStatusFilter");
```

Add filter state:
```javascript
let searchText = "";
let statusFilter = "active";
let searchDebounceTimer = null;
```

Add event listeners (after IPC handlers section):
```javascript
sidebarSearch.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        searchText = sidebarSearch.value.trim();
        refetchLists();
    }, 300);
});

sidebarStatusFilter.addEventListener("change", () => {
    statusFilter = sidebarStatusFilter.value;
    refetchLists();
});
```

Add refetch helper:
```javascript
const refetchLists = () => {
    if (!isStandalone) return;
    const payload = { target };
    if (searchText) payload.search_text = searchText;
    if (statusFilter) payload.status_filter = statusFilter;
    ipc.send("lists-fetch", payload);
};
```

In the `render` function, hide the filter bar for non-standalone:
```javascript
if (sidebarFilter) {
    sidebarFilter.classList.toggle("hidden", !isStandalone);
}
```

**Step 4: Update IPC fetch handler**

In `src/main/ipc/registerHandlers.js`, the `lists-fetch` handler (line 851) should forward `search_text` and `status_filter` in the fetch payload to the server. Modify the `sendEvent` call to include these fields from the incoming data.

**Step 5: Update controller's `fetchForTarget`**

In `listsController.js`, `fetchForTarget` (line 160) needs to forward `search_text` and `status_filter` to the server event `lists_fetch`.

**Step 6: Commit**

```bash
git add src/html/list.html src/js/listWindow.js src/styles/list.css src/main/ipc/registerHandlers.js src/main/controllers/listsController.js
git commit -m "feat(lists): add search and status filter to standalone sidebar"
```

---

### Task 7: Update sidebar rendering with color dots, pin icons, and pinned-first sort

Enhance sidebar items with color dots, pin indicators, and sort pinned lists first.

**Files:**
- Modify: `src/js/listWindow.js:196-250`
- Modify: `src/styles/list.css`

**Step 1: Update sidebar sort order for standalone**

In `renderSidebar`, replace the `sortByPosition` call (line 197):

```javascript
let sorted;
if (isStandalone) {
    // Pinned first, then by updated_at DESC
    sorted = [...lists.map((b) => b.definition).filter(Boolean)].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        const tA = a.updated_at ?? "";
        const tB = b.updated_at ?? "";
        return tB < tA ? -1 : tB > tA ? 1 : 0;
    });
} else {
    sorted = sortByPosition(lists.map((b) => b.definition).filter(Boolean));
}
```

**Step 2: Add color dot and pin icon to sidebar items**

In `renderSidebar`, when building each item, before the titleSpan:

```javascript
// Color dot
const colorDot = document.createElement("span");
colorDot.className = "list-sidebar-color-dot";
colorDot.style.backgroundColor = def.color || "#4A90D9";
item.appendChild(colorDot);
```

After the titleSpan, add pin and share indicators:

```javascript
if (def.is_pinned) {
    const pinIcon = document.createElement("span");
    pinIcon.className = "list-sidebar-pin-icon";
    pinIcon.textContent = "\uD83D\uDCCC"; // 📌
    pinIcon.title = "Pinned";
    item.appendChild(pinIcon);
}
```

Add a status class to the sidebar item for visual dimming:
```javascript
if (def.status === "completed") item.classList.add("status-completed");
if (def.status === "archived") item.classList.add("status-archived");
```

**Step 3: Add CSS**

```css
.list-sidebar-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.list-sidebar-pin-icon {
    font-size: 10px;
    flex-shrink: 0;
    opacity: 0.7;
}

.list-sidebar-item.status-completed {
    opacity: 0.6;
}

.list-sidebar-item.status-archived {
    opacity: 0.4;
}
```

**Step 4: Commit**

```bash
git add src/js/listWindow.js src/styles/list.css
git commit -m "feat(lists): add color dots, pin icons, and pinned-first sort to sidebar"
```

---

### Task 8: Add sidebar context menu (pin, status, duplicate, share, delete)

Add a right-click context menu on sidebar items with all list-level actions.

**Files:**
- Modify: `src/js/listWindow.js`
- Modify: `src/styles/list.css`

**Step 1: Build context menu**

In `listWindow.js`, add a context menu builder function:

```javascript
let contextMenuEl = null;

const showContextMenu = (e, def) => {
    e.preventDefault();
    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "list-context-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";

    const isOwner = !def.owner || def.owner.user_id === undefined; // owner check simplified

    const addMenuItem = (label, onClick) => {
        const item = document.createElement("div");
        item.className = "list-context-menu-item";
        item.textContent = label;
        item.addEventListener("click", () => {
            onClick();
            closeContextMenu();
        });
        menu.appendChild(item);
    };

    if (isStandalone) {
        addMenuItem(def.is_pinned ? "Unpin" : "Pin", () => {
            sendMutation("list_pin", {
                list_id: def.id,
                is_pinned: !def.is_pinned,
                last_modified_at: Date.now(),
            });
        });

        const statusSub = document.createElement("div");
        statusSub.className = "list-context-menu-item has-submenu";
        statusSub.textContent = "Set Status";
        const subMenu = document.createElement("div");
        subMenu.className = "list-context-submenu";
        for (const s of ["active", "completed", "archived"]) {
            const si = document.createElement("div");
            si.className = "list-context-menu-item" + (def.status === s ? " active" : "");
            si.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            si.addEventListener("click", () => {
                sendMutation("list_set_status", {
                    list_id: def.id,
                    status: s,
                    last_modified_at: Date.now(),
                });
                closeContextMenu();
            });
            subMenu.appendChild(si);
        }
        statusSub.appendChild(subMenu);
        menu.appendChild(statusSub);

        addMenuItem("Duplicate", () => {
            const lists = listsPayload?.lists ?? [];
            const maxPos = lists.reduce((max, b) => Math.max(max, b.definition?.position ?? 0), -1);
            sendMutation("list_duplicate", {
                list_id: def.id,
                position: maxPos + 1,
                last_modified_at: Date.now(),
            });
        });

        addMenuItem("Share...", () => {
            openShareDialog(def.id);
        });

        // Separator
        const sep = document.createElement("div");
        sep.className = "list-context-menu-separator";
        menu.appendChild(sep);

        addMenuItem("Delete", () => {
            openDeleteConfirmDialog(def.id, def.title);
        });
    }

    document.body.appendChild(menu);
    contextMenuEl = menu;

    // Adjust position if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + "px";
};

const closeContextMenu = () => {
    if (contextMenuEl) {
        contextMenuEl.remove();
        contextMenuEl = null;
    }
};

document.addEventListener("click", closeContextMenu);
document.addEventListener("contextmenu", (e) => {
    if (!contextMenuEl?.contains(e.target)) closeContextMenu();
});
```

**Step 2: Attach context menu to sidebar items**

In `renderSidebar`, add to each item element:
```javascript
item.addEventListener("contextmenu", (e) => showContextMenu(e, def));
```

**Step 3: Add CSS**

```css
.list-context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: 8px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.list-context-menu-item {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--color-text-primary);
    cursor: pointer;
    position: relative;
}

.list-context-menu-item:hover {
    background: var(--color-bg-hover);
}

.list-context-menu-item.active {
    color: var(--color-accent-primary);
}

.list-context-menu-separator {
    height: 1px;
    background: var(--color-border-primary);
    margin: 4px 0;
}

.list-context-menu-item.has-submenu {
    position: relative;
}

.list-context-submenu {
    display: none;
    position: absolute;
    left: 100%;
    top: -4px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: 8px;
    padding: 4px 0;
    min-width: 120px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.list-context-menu-item.has-submenu:hover .list-context-submenu {
    display: block;
}
```

**Step 4: Commit**

```bash
git add src/js/listWindow.js src/styles/list.css
git commit -m "feat(lists): add right-click context menu with pin, status, duplicate, share, delete"
```

---

### Task 9: Add share dialog

Add the share dialog with email invite input and current shares list with remove buttons.

**Files:**
- Modify: `src/html/list.html`
- Modify: `src/js/listWindow.js`
- Modify: `src/styles/list.css`

**Step 1: Add share dialog HTML**

In `list.html`, after the delete confirm dialog (line 137):

```html
<!-- Share dialog -->
<dialog class="list-dialog list-share-dialog" id="shareDialog">
    <h3 class="list-dialog-title">Share List</h3>
    <div class="list-share-invite-row">
        <input class="list-dialog-input" id="shareEmailInput" type="email" placeholder="Enter email address" />
        <button class="list-dialog-btn list-dialog-btn-submit" id="shareInviteBtn">Invite</button>
    </div>
    <div class="list-share-list" id="shareList">
        <p class="list-share-empty">No shares yet</p>
    </div>
    <div class="list-dialog-actions">
        <button class="list-dialog-btn list-dialog-btn-cancel" id="shareCloseBtn">Close</button>
    </div>
</dialog>
```

**Step 2: Wire JS**

Add DOM refs:
```javascript
const shareDialog = document.getElementById("shareDialog");
const shareEmailInput = document.getElementById("shareEmailInput");
const shareInviteBtn = document.getElementById("shareInviteBtn");
const shareList = document.getElementById("shareList");
const shareCloseBtn = document.getElementById("shareCloseBtn");
let shareListId = null;
let currentShares = [];
```

Add functions:
```javascript
const openShareDialog = (listId) => {
    shareListId = listId;
    currentShares = [];
    shareEmailInput.value = "";
    renderShareList();
    shareDialog.showModal();
    shareEmailInput.focus();
    // Fetch current shares
    sendMutation("list_shares_fetch", { list_id: listId });
};

const closeShareDialog = () => {
    shareListId = null;
    shareDialog.close();
};

const submitShareInvite = () => {
    const email = shareEmailInput.value.trim();
    if (!email) {
        shareEmailInput.focus();
        return;
    }
    sendMutation("list_share_invite", {
        list_id: shareListId,
        email,
    });
    shareEmailInput.value = "";
};

const renderShareList = () => {
    shareList.innerHTML = "";
    if (currentShares.length === 0) {
        shareList.innerHTML = '<p class="list-share-empty">No shares yet</p>';
        return;
    }
    for (const share of currentShares) {
        const row = document.createElement("div");
        row.className = "list-share-row";

        const info = document.createElement("span");
        info.className = "list-share-user";
        info.textContent = share.shared_with_user_id?.substring(0, 8) + "...";
        row.appendChild(info);

        const perm = document.createElement("span");
        perm.className = "list-share-permission";
        perm.textContent = share.permission || "edit";
        row.appendChild(perm);

        const removeBtn = document.createElement("button");
        removeBtn.className = "list-share-remove-btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            sendMutation("list_share_remove", {
                list_id: shareListId,
                user_id: share.shared_with_user_id,
            });
        });
        row.appendChild(removeBtn);

        shareList.appendChild(row);
    }
};
```

Add event listeners:
```javascript
shareInviteBtn.addEventListener("click", submitShareInvite);
shareCloseBtn.addEventListener("click", closeShareDialog);
shareEmailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitShareInvite();
});
```

Add IPC listeners for share responses:
```javascript
ipc.on("lists-shares-list", (_, data) => {
    if (!shareDialog.open) return;
    currentShares = Array.isArray(data) ? data : [];
    renderShareList();
});

ipc.on("lists-share-created", (_, data) => {
    if (data?.list_share && shareDialog.open && data.list_share.list_id === shareListId) {
        currentShares.push(data.list_share);
        renderShareList();
    }
    showToast("List shared successfully", 2000, "success");
});

ipc.on("lists-share-removed", (_, data) => {
    if (shareDialog.open && data?.list_id === shareListId) {
        currentShares = currentShares.filter(s => s.shared_with_user_id !== data.user_id);
        renderShareList();
    }
});
```

**Step 3: Add CSS**

```css
.list-share-invite-row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
}

.list-share-invite-row .list-dialog-input {
    flex: 1;
}

.list-share-list {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: var(--spacing-md);
}

.list-share-empty {
    color: var(--color-text-tertiary);
    font-size: 12px;
    text-align: center;
    margin: var(--spacing-md) 0;
}

.list-share-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.list-share-user {
    flex: 1;
    font-size: 12px;
    color: var(--color-text-primary);
}

.list-share-permission {
    font-size: 10px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
}

.list-share-remove-btn {
    background: none;
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-tertiary);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
}

.list-share-remove-btn:hover {
    color: var(--color-urgency-high);
    border-color: var(--color-urgency-high);
}
```

**Step 4: Add Share button to list header area**

In `renderTemplateItems`, add a share button next to the template title when in standalone mode:

```javascript
if (isStandalone) {
    const shareBtn = document.createElement("button");
    shareBtn.className = "list-share-btn";
    shareBtn.textContent = "Share";
    shareBtn.addEventListener("click", () => openShareDialog(def.id));
    // Insert into the template header
    templateSection.querySelector(".list-template-header")?.appendChild(shareBtn);
}
```

CSS:
```css
.list-share-btn {
    background: none;
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-secondary);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    margin-left: auto;
}

.list-share-btn:hover {
    border-color: var(--color-accent-primary);
    color: var(--color-accent-primary);
}
```

**Step 5: Commit**

```bash
git add src/html/list.html src/js/listWindow.js src/styles/list.css
git commit -m "feat(lists): add share dialog with email invite and share management"
```

---

### Task 10: Update list create dialog with new fields

Add icon, color, and tags fields to the create list dialog.

**Files:**
- Modify: `src/html/list.html:75-95`
- Modify: `src/js/listWindow.js`
- Modify: `src/styles/list.css`

**Step 1: Add fields to HTML**

In the addListDialog, after the kind fieldset (line 90), before the actions div (line 91):

```html
<div class="list-dialog-row">
    <div class="list-dialog-field">
        <label class="list-dialog-label" for="listIconInput">Icon</label>
        <input class="list-dialog-input" id="listIconInput" type="text" placeholder="e.g. cart, star" />
    </div>
    <div class="list-dialog-field">
        <label class="list-dialog-label" for="listColorInput">Color</label>
        <input class="list-dialog-input" id="listColorInput" type="color" value="#4A90D9" />
    </div>
</div>
<label class="list-dialog-label" for="listTagsInput">Tags</label>
<input class="list-dialog-input" id="listTagsInput" type="text" placeholder="Comma-separated tags" />
```

**Step 2: Wire JS**

Add DOM refs:
```javascript
const listIconInput = document.getElementById("listIconInput");
const listColorInput = document.getElementById("listColorInput");
const listTagsInput = document.getElementById("listTagsInput");
```

In `openAddListDialog`, reset new fields:
```javascript
listIconInput.value = "";
listColorInput.value = "#4A90D9";
listTagsInput.value = "";
```

In `submitAddList`, add to the `list_create` payload:
```javascript
sendMutation("list_create", {
    target,
    position: maxPos + 1,
    title,
    kind,
    icon: listIconInput.value.trim() || "list",
    color: listColorInput.value || "#4A90D9",
    tags: listTagsInput.value.split(",").map(t => t.trim()).filter(Boolean),
    last_modified_at: Date.now(),
});
```

**Step 3: Add CSS**

```css
.list-dialog-row {
    display: flex;
    gap: var(--spacing-sm);
}

.list-dialog-field {
    flex: 1;
}
```

**Step 4: Commit**

```bash
git add src/html/list.html src/js/listWindow.js src/styles/list.css
git commit -m "feat(lists): add icon, color, and tags fields to list create dialog"
```

---

### Task 11: Update IPC handlers to forward new events

Ensure the `lists-mutation` IPC handler forwards all the new event types to the server. The current implementation already forwards generically via `sendMutation`, so this should work. But we need to handle the new IPC events from the controller to the renderer.

**Files:**
- Modify: `src/main/ipc/registerHandlers.js`

**Step 1: Register new IPC listener for filter params**

Update the `lists-fetch` handler (line 851) to pass `search_text` and `status_filter` from the renderer:

```javascript
ipc.on("lists-fetch", (event, data) => {
    if (!data?.target) return;
    const { target, search_text, status_filter } = data;
    if (target.kind !== "standalone_home" && !target.id) return;
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow) return;
    listsController.subscribe(target, senderWindow);
    listsController.fetchForTarget(target, senderWindow, { search_text, status_filter });
});
```

**Step 2: Update controller `fetchForTarget` signature**

In `listsController.js`, update `fetchForTarget` to accept and forward filter options:

```javascript
fetchForTarget(target, windowRef, options = {}) {
    const key = surfaceKey(target);
    // ... existing subscribe logic ...
    const payload = { target };
    if (options.search_text) payload.search_text = options.search_text;
    if (options.status_filter) payload.status_filter = options.status_filter;
    sendEvent?.("lists_fetch", payload);
},
```

**Step 3: Commit**

```bash
git add src/main/ipc/registerHandlers.js src/main/controllers/listsController.js
git commit -m "feat(lists): forward search and status filter params through IPC to server"
```

---

### Task 12: Integration testing and edge cases

Manually verify all features work together. Fix any issues found.

**Checklist:**

1. **is_completed → status migration**: Open a list with run items. Verify checkboxes reflect `status === "completed"` correctly. Toggle items.
2. **Cancelled items**: Cancel a pending item — verify strikethrough. Restore it — verify it goes back to pending. Verify cancelled items don't affect progress bar (server-computed).
3. **Quantity/unit**: Create item with quantity "2" and unit "kg". Verify "— 2 kg" appears after title in template and run views. Edit item to remove quantity — verify it disappears.
4. **Search**: Type in search box — verify debounced refetch. Clear search — verify all lists return.
5. **Status filter**: Filter by completed — verify only completed lists show. Switch to All — verify all show.
6. **Pin/unpin**: Right-click → Pin. Verify list moves to top. Verify pin icon shows. Unpin — verify it moves back.
7. **Set status**: Right-click → Set Status → Completed. Verify sidebar styling changes. Verify filter works with new status.
8. **Duplicate**: Right-click → Duplicate. Verify new list appears with "(Copy)" or similar.
9. **Share**: Right-click → Share. Enter email. Verify toast on success. Verify share appears in list. Remove share.
10. **Context menu**: Verify menu positions correctly near edges. Verify clicking outside closes it.
11. **Color dots**: Verify sidebar items show color dots matching list color.
12. **Non-standalone**: Open a task-attached list. Verify filter bar is hidden. Verify context menu doesn't show standalone-only options.

**Step 1: Fix any issues found**

**Step 2: Commit**

```bash
git add -A
git commit -m "fix(lists): integration fixes for enhanced list features"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Wire new socket events | socket/handlers.js |
| 2 | Controller handler stubs | listsController.js |
| 3 | Migrate is_completed → status | listWindow.js |
| 4 | Cancel/restore UI + styling | listWindow.js, list.css |
| 5 | Quantity/unit fields | list.html, listWindow.js, list.css |
| 6 | Search + status filter | list.html, listWindow.js, list.css, IPC |
| 7 | Sidebar color dots + pins + sort | listWindow.js, list.css |
| 8 | Context menu | listWindow.js, list.css |
| 9 | Share dialog | list.html, listWindow.js, list.css |
| 10 | Create dialog new fields | list.html, listWindow.js, list.css |
| 11 | IPC filter forwarding | registerHandlers.js, listsController.js |
| 12 | Integration testing | All |
