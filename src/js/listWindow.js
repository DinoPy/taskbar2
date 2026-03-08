const { ipcRenderer } = window.require("electron");
const ipc = ipcRenderer;

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

let target = null;
let isStandalone = false;
let currentUserId = null;
let listsPayload = null; // Full ListsTargetPayload
let selectedListId = null;
let isOwnerFrozen = false;
let editingItemId = null; // non-null when editing an existing item
let timerIntervalId = null;
let noteDebounceTimers = new Map();
let focusPanel = "run"; // "sidebar" | "run"
let focusIndex = -1;
let searchText = "";
let statusFilter = "active";
let searchDebounceTimer = null;
let shareListId = null;
let currentShares = [];

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------

const closeBtn = document.getElementById("closeBtn");
const headerTarget = document.getElementById("headerTarget");
const sidebarItems = document.getElementById("sidebarItems");
const addListBtn = document.getElementById("addListBtn");
const listMain = document.getElementById("listMain");
const emptyState = document.getElementById("emptyState");
const templateSection = document.getElementById("templateSection");
const templateTitle = document.getElementById("templateTitle");
const templateKind = document.getElementById("templateKind");
const templateItems = document.getElementById("templateItems");
const addItemBtn = document.getElementById("addItemBtn");
const runSection = document.getElementById("runSection");
const runStatus = document.getElementById("runStatus");
const runProgressFill = document.getElementById("runProgressFill");
const runProgressText = document.getElementById("runProgressText");
const runItemsEl = document.getElementById("runItems");
const footerOwner = document.getElementById("footerOwner");
const footerRev = document.getElementById("footerRev");
const footerStatus = document.getElementById("footerStatus");
const errorToast = document.getElementById("errorToast");
const helpPanel = document.getElementById("helpPanel");
const helpCloseBtn = document.getElementById("helpCloseBtn");
const sidebarFilter = document.getElementById("sidebarFilter");
const sidebarSearch = document.getElementById("sidebarSearch");
const sidebarStatusFilter = document.getElementById("sidebarStatusFilter");

// Dialogs
const addListDialog = document.getElementById("addListDialog");
const listTitleInput = document.getElementById("listTitleInput");
const addListSubmit = document.getElementById("addListSubmit");
const addListCancel = document.getElementById("addListCancel");
const listIconInput = document.getElementById("listIconInput");
const listColorInput = document.getElementById("listColorInput");
const listTagsInput = document.getElementById("listTagsInput");

const itemDialog = document.getElementById("itemDialog");
const itemDialogTitle = document.getElementById("itemDialogTitle");
const itemTitleInput = document.getElementById("itemTitleInput");
const timerDurationGroup = document.getElementById("timerDurationGroup");
const timerDurationInput = document.getElementById("timerDurationInput");
const requiredGroup = document.getElementById("requiredGroup");
const itemRequiredInput = document.getElementById("itemRequiredInput");
const itemDescriptionInput = document.getElementById("itemDescriptionInput");
const itemDialogSubmit = document.getElementById("itemDialogSubmit");
const itemDialogCancel = document.getElementById("itemDialogCancel");
const itemQuantityInput = document.getElementById("itemQuantityInput");
const itemUnitInput = document.getElementById("itemUnitInput");

const shareDialog = document.getElementById("shareDialog");
const shareEmailInput = document.getElementById("shareEmailInput");
const shareInviteBtn = document.getElementById("shareInviteBtn");
const shareList = document.getElementById("shareList");
const shareCloseBtn = document.getElementById("shareCloseBtn");

const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");
const deleteConfirmMessage = document.getElementById("deleteConfirmMessage");
const deleteConfirmSubmit = document.getElementById("deleteConfirmSubmit");
const deleteConfirmCancel = document.getElementById("deleteConfirmCancel");
let pendingDeleteListId = null;

const attachOverlay = document.getElementById("attachOverlay");
const attachInput = document.getElementById("attachInput");
const attachResults = document.getElementById("attachResults");
const attachEmpty = document.getElementById("attachEmpty");
const attachCloseBtn = document.getElementById("attachCloseBtn");
let attachTargets = [];
let attachFiltered = [];
let attachFocusIndex = -1;
let attachListId = null;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const TYPE_ICONS = {
	checkbox: "\u2610",
	timer: "\u23F1",
	note: "\u270E",
};

const formatDuration = (totalSeconds) => {
	const hrs = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	const secs = Math.floor(totalSeconds % 60);
	if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
	return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

const getSelectedBundle = () => {
	if (!listsPayload?.lists || !selectedListId) return null;
	return listsPayload.lists.find((b) => b.definition?.id === selectedListId) ?? null;
};

const isListOwner = (def) => {
	if (!isStandalone || !currentUserId) return true; // Non-standalone or no user — assume owner
	if (!def?.owner?.user_id) return true; // No owner info — assume owner
	return def.owner.user_id === currentUserId;
};

const isRunReadonly = (bundle) => {
	if (!bundle?.run) return true;
	const status = bundle.run.status;
	return status === "completed" || status === "canceled" || status === "archived";
};

const sortByPosition = (arr) => {
	return [...arr].sort((a, b) => {
		const posA = a.position ?? a.snapshot?.position ?? 0;
		const posB = b.position ?? b.snapshot?.position ?? 0;
		if (posA !== posB) return posA - posB;
		const tA = a.created_at ?? "";
		const tB = b.created_at ?? "";
		return tA < tB ? -1 : tA > tB ? 1 : 0;
	});
};

const sendMutation = (event, data) => {
	ipc.send("lists-mutation", { event, data });
};

const refetchLists = () => {
	if (!isStandalone) return;
	const payload = { target };
	if (searchText) payload.search_text = searchText;
	if (statusFilter) payload.status_filter = statusFilter;
	ipc.send("lists-fetch", payload);
};

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------

let toastTimeout = null;
const showToast = (message, duration = 3000, type = "error") => {
	if (toastTimeout) clearTimeout(toastTimeout);
	errorToast.textContent = message;
	errorToast.classList.remove("visible", "success");
	if (type === "success") errorToast.classList.add("success");
	errorToast.classList.add("visible");
	toastTimeout = setTimeout(() => {
		errorToast.classList.remove("visible", "success");
	}, duration);
};

// ---------------------------------------------------------------
// Context Menu
// ---------------------------------------------------------------

let contextMenuEl = null;

const showContextMenu = (e, def) => {
	e.preventDefault();
	closeContextMenu();

	const menu = document.createElement("div");
	menu.className = "list-context-menu";
	menu.style.left = e.clientX + "px";
	menu.style.top = e.clientY + "px";

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

	if (!isStandalone) return;

	const owner = isListOwner(def);

	if (owner) {
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
	} else {
		// Shared user can only leave
		addMenuItem("Leave list", () => {
			sendMutation("list_share_remove", {
				list_id: def.id,
				user_id: currentUserId,
			});
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

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

const render = () => {
	const lists = listsPayload?.lists ?? [];
	const hasLists = lists.length > 0;

	// Update header
	if (target) {
		if (isStandalone) {
			headerTarget.textContent = "";
			document.querySelector(".list-header-title").textContent = "Standalone Lists";
		} else {
			headerTarget.textContent = `${target.kind}: ${target.id.substring(0, 8)}...`;
		}
	}

	// Toggle readonly
	const body = document.body;
	if (isOwnerFrozen) {
		body.classList.add("list-readonly");
	} else {
		body.classList.remove("list-readonly");
	}

	renderSidebar(lists);

	if (sidebarFilter) {
		sidebarFilter.classList.toggle("hidden", !isStandalone);
	}

	if (!hasLists) {
		emptyState.classList.remove("hidden");
		templateSection.classList.add("hidden");
		runSection.classList.add("hidden");
		footerOwner.textContent = "";
		footerRev.textContent = "";
		footerStatus.textContent = "";
		return;
	}

	emptyState.classList.add("hidden");

	// Auto-select first list if none selected
	if (!selectedListId || !lists.find((b) => b.definition?.id === selectedListId)) {
		selectedListId = lists[0]?.definition?.id ?? null;
	}

	const bundle = getSelectedBundle();
	if (!bundle) {
		templateSection.classList.add("hidden");
		runSection.classList.add("hidden");
		return;
	}

	renderTemplateItems(bundle);
	renderRunItems(bundle);
	renderFooter(bundle);
};

const renderSidebar = (lists) => {
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
	sidebarItems.innerHTML = "";

	for (const def of sorted) {
		const item = document.createElement("div");
		item.className = "list-sidebar-item" + (def.id === selectedListId ? " active" : "");
		item.setAttribute("tabindex", "0");
		item.setAttribute("data-sidebar-id", def.id);

		// Color dot
		const colorDot = document.createElement("span");
		colorDot.className = "list-sidebar-color-dot";
		colorDot.style.backgroundColor = def.color || "#4A90D9";
		item.appendChild(colorDot);

		const titleSpan = document.createElement("span");
		titleSpan.className = "list-sidebar-item-title";
		titleSpan.textContent = def.title || "(untitled)";
		item.appendChild(titleSpan);

		if (def.is_pinned) {
			const pinIcon = document.createElement("span");
			pinIcon.className = "list-sidebar-pin-icon";
			pinIcon.textContent = "\uD83D\uDCCC";
			pinIcon.title = "Pinned";
			item.appendChild(pinIcon);
		}

		// Status styling
		if (def.status === "completed") item.classList.add("status-completed");
		if (def.status === "archived") item.classList.add("status-archived");

		const owner = isListOwner(def);

		// Shared indicator for non-owned lists
		if (!owner) {
			const sharedIcon = document.createElement("span");
			sharedIcon.className = "list-sidebar-shared-icon";
			sharedIcon.textContent = "\u{1F465}";
			sharedIcon.title = "Shared with you";
			item.appendChild(sharedIcon);
		}

		const actionsDiv = document.createElement("div");
		actionsDiv.className = "list-sidebar-item-actions";

		if (isStandalone && owner) {
			const attachBtn = document.createElement("button");
			attachBtn.className = "list-sidebar-item-action attach";
			attachBtn.textContent = "\u21B1";
			attachBtn.title = "Attach to task or schedule";
			attachBtn.setAttribute("tabindex", "-1");
			attachBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				openAttachPicker(def.id);
			});
			actionsDiv.appendChild(attachBtn);
		}

		if (owner) {
			const deleteBtn = document.createElement("button");
			deleteBtn.className = "list-sidebar-item-action delete";
			deleteBtn.textContent = "\u2715";
			deleteBtn.title = "Delete list";
			deleteBtn.setAttribute("tabindex", "-1");
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				if (isStandalone) {
					openDeleteConfirmDialog(def.id, def.title);
				} else {
					sendMutation("list_delete", { id: def.id });
				}
			});
			actionsDiv.appendChild(deleteBtn);
		}
		item.appendChild(actionsDiv);

		item.addEventListener("click", () => {
			selectedListId = def.id;
			render();
		});

		item.addEventListener("contextmenu", (e) => showContextMenu(e, def));

		sidebarItems.appendChild(item);
	}
};

const renderTemplateItems = (bundle) => {
	const def = bundle.definition;
	const items = bundle.items ?? [];
	const hasRun = !!bundle.run;

	templateSection.classList.remove("hidden");
	templateTitle.textContent = def.title || "(untitled)";
	templateKind.textContent = def.kind || "";

	// Add share button for standalone lists (owner only)
	const existingShareBtn = templateSection.querySelector(".list-share-btn");
	if (existingShareBtn) existingShareBtn.remove();
	if (isStandalone && def && isListOwner(def)) {
		const shareBtn = document.createElement("button");
		shareBtn.className = "list-share-btn";
		shareBtn.textContent = "Share";
		shareBtn.addEventListener("click", () => openShareDialog(def.id));
		templateSection.querySelector(".list-template-header")?.appendChild(shareBtn);
	}

	// If there's a run, we show template items as reference but focus on run
	const sorted = sortByPosition(items);
	templateItems.innerHTML = "";

	// Separate root and children
	const roots = sorted.filter((i) => !i.parent_item_id);
	const childMap = new Map();
	for (const item of sorted) {
		if (item.parent_item_id) {
			if (!childMap.has(item.parent_item_id)) childMap.set(item.parent_item_id, []);
			childMap.get(item.parent_item_id).push(item);
		}
	}

	const renderItem = (item, isChild = false) => {
		const row = document.createElement("div");
		row.className = "list-item-row" + (isChild ? " child" : "");

		const icon = document.createElement("span");
		icon.className = "list-item-icon";
		icon.textContent = TYPE_ICONS[item.type] ?? "";
		row.appendChild(icon);

		const title = document.createElement("span");
		title.className = "list-item-title";
		title.textContent = item.title || "(untitled)";
		if (item.quantity || item.unit) {
			const qtySpan = document.createElement("span");
			qtySpan.className = "list-item-quantity";
			qtySpan.textContent = ` — ${item.quantity || ""}${item.unit ? " " + item.unit : ""}`;
			title.appendChild(qtySpan);
		}
		row.appendChild(title);

		const meta = document.createElement("span");
		meta.className = "list-item-meta";

		if (item.required) {
			const badge = document.createElement("span");
			badge.className = "list-item-badge required";
			badge.textContent = "required";
			meta.appendChild(badge);
		}

		if (item.type === "timer" && item.config?.duration_seconds) {
			const badge = document.createElement("span");
			badge.className = "list-item-badge duration";
			badge.textContent = formatDuration(item.config.duration_seconds);
			meta.appendChild(badge);
		}
		row.appendChild(meta);

		const actions = document.createElement("div");
		actions.className = "list-item-actions";

		// Move up
		const upBtn = document.createElement("button");
		upBtn.className = "list-item-action";
		upBtn.textContent = "\u2191";
		upBtn.title = "Move up";
		upBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_reorder", {
				id: item.id,
				list_id: def.id,
				position: Math.max(0, (item.position ?? 0) - 1),
			});
		});
		actions.appendChild(upBtn);

		// Move down
		const downBtn = document.createElement("button");
		downBtn.className = "list-item-action";
		downBtn.textContent = "\u2193";
		downBtn.title = "Move down";
		downBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_reorder", {
				id: item.id,
				list_id: def.id,
				position: (item.position ?? 0) + 1,
			});
		});
		actions.appendChild(downBtn);

		// Edit
		const editBtn = document.createElement("button");
		editBtn.className = "list-item-action";
		editBtn.textContent = "\u270E";
		editBtn.title = "Edit item";
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			openItemDialog(item);
		});
		actions.appendChild(editBtn);

		// Delete
		const delBtn = document.createElement("button");
		delBtn.className = "list-item-action delete";
		delBtn.textContent = "\u2715";
		delBtn.title = "Delete item";
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_item_delete", { id: item.id });
		});
		actions.appendChild(delBtn);

		row.appendChild(actions);
		templateItems.appendChild(row);
	};

	for (const root of roots) {
		renderItem(root, false);
		const children = childMap.get(root.id);
		if (children) {
			for (const child of children) {
				renderItem(child, true);
			}
		}
	}
};

const renderRunItems = (bundle) => {
	if (!bundle.run || !bundle.run_items) {
		runSection.classList.add("hidden");
		return;
	}

	runSection.classList.remove("hidden");
	const run = bundle.run;
	const readonly = isRunReadonly(bundle);

	// Readonly class
	if (readonly) {
		runSection.classList.add("list-run-readonly");
	} else {
		runSection.classList.remove("list-run-readonly");
	}

	// Status
	runStatus.textContent = run.status;
	runStatus.className = "list-run-status " + (run.status ?? "");

	// Progress
	const total = run.required_total ?? 0;
	const completed = run.required_completed ?? 0;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	runProgressFill.style.width = `${pct}%`;
	runProgressText.textContent = total > 0 ? `${completed}/${total} (${pct}%)` : "No required items";

	// Render run items
	const sorted = sortByPosition(
		bundle.run_items.map((ri) => ({
			...ri,
			position: ri.snapshot?.position ?? 0,
		}))
	);

	runItemsEl.innerHTML = "";

	// Separate root and children
	const roots = sorted.filter((ri) => !ri.snapshot?.parent_item_id);
	const childMap = new Map();
	for (const ri of sorted) {
		if (ri.snapshot?.parent_item_id) {
			const pid = ri.snapshot.parent_item_id;
			if (!childMap.has(pid)) childMap.set(pid, []);
			childMap.get(pid).push(ri);
		}
	}

	const renderRunItem = (ri, isChild = false) => {
		const snap = ri.snapshot ?? {};
		const el = document.createElement("div");
		el.className = "list-run-item" + (isChild ? " child" : "") + (ri.status === "completed" ? " completed" : "") + (ri.status === "cancelled" ? " cancelled" : "");
		el.setAttribute("tabindex", "0");
		el.setAttribute("data-run-item-id-row", ri.id);
		if (snap.item_id) el.setAttribute("data-item-id", snap.item_id);
		if (snap.type) el.setAttribute("data-item-type", snap.type);

		if (snap.type === "checkbox") {
			renderCheckboxRunItem(el, ri, snap, run, readonly);
		} else if (snap.type === "timer") {
			renderTimerRunItem(el, ri, snap, run, readonly);
		} else if (snap.type === "note") {
			renderNoteRunItem(el, ri, snap, run, readonly);
		}

		runItemsEl.appendChild(el);
	};

	for (const root of roots) {
		renderRunItem(root, false);
		const itemId = root.snapshot?.item_id ?? root.id;
		const children = childMap.get(itemId);
		if (children) {
			for (const child of children) {
				renderRunItem(child, true);
			}
		}
	}
};

const renderCheckboxRunItem = (el, ri, snap, run, readonly) => {
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.className = "list-run-item-checkbox";
	checkbox.checked = ri.status === "completed";
	if (ri.status === "cancelled") {
		checkbox.disabled = true;
	}
	if (!readonly && snap.item_id) {
		checkbox.addEventListener("change", () => {
			sendMutation("list_run_item_toggle", {
				run_id: run.id,
				item_id: snap.item_id,
			});
		});
	}
	el.appendChild(checkbox);

	const content = document.createElement("div");
	content.className = "list-run-item-content";
	const title = document.createElement("span");
	title.className = "list-run-item-title";
	title.textContent = snap.title || "(untitled)";
	if (snap.quantity || snap.unit) {
		const qtySpan = document.createElement("span");
		qtySpan.className = "list-item-quantity";
		qtySpan.textContent = ` — ${snap.quantity || ""}${snap.unit ? " " + snap.unit : ""}`;
		title.appendChild(qtySpan);
	}
	content.appendChild(title);
	if (snap.description) {
		const desc = document.createElement("span");
		desc.className = "list-run-item-description";
		desc.textContent = snap.description;
		content.appendChild(desc);
	}
	el.appendChild(content);

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
};

const renderTimerRunItem = (el, ri, snap, run, readonly) => {
	const icon = document.createElement("span");
	icon.className = "list-item-icon";
	icon.textContent = TYPE_ICONS.timer;
	el.appendChild(icon);

	const content = document.createElement("div");
	content.className = "list-run-item-content";

	const title = document.createElement("span");
	title.className = "list-run-item-title";
	title.textContent = snap.title || "(untitled)";
	if (snap.quantity || snap.unit) {
		const qtySpan = document.createElement("span");
		qtySpan.className = "list-item-quantity";
		qtySpan.textContent = ` — ${snap.quantity || ""}${snap.unit ? " " + snap.unit : ""}`;
		title.appendChild(qtySpan);
	}
	content.appendChild(title);

	const timerRow = document.createElement("div");
	timerRow.className = "list-run-item-timer";

	const ts = ri.timer_state ?? {};
	const elapsed = computeTimerElapsed(ts);
	const duration = ts.duration_seconds ?? snap.config?.duration_seconds ?? 0;

	const display = document.createElement("span");
	display.className = "list-run-item-timer-display";
	display.setAttribute("data-run-item-id", ri.id);
	display.textContent = `${formatDuration(elapsed)} / ${formatDuration(duration)}`;
	timerRow.appendChild(display);

	if (!readonly && snap.item_id && ts.status !== "completed") {
		if (ts.status === "running") {
			const pauseBtn = document.createElement("button");
			pauseBtn.className = "list-run-item-timer-btn running";
			pauseBtn.textContent = "Pause";
			pauseBtn.addEventListener("click", () => {
				sendMutation("list_run_item_timer_pause", {
					run_id: run.id,
					item_id: snap.item_id,
				});
			});
			timerRow.appendChild(pauseBtn);
		} else {
			const playBtn = document.createElement("button");
			playBtn.className = "list-run-item-timer-btn";
			playBtn.textContent = "Start";
			playBtn.addEventListener("click", () => {
				sendMutation("list_run_item_timer_start", {
					run_id: run.id,
					item_id: snap.item_id,
				});
			});
			timerRow.appendChild(playBtn);
		}

		const completeBtn = document.createElement("button");
		completeBtn.className = "list-run-item-timer-btn complete-btn";
		completeBtn.textContent = "Complete";
		completeBtn.addEventListener("click", () => {
			sendMutation("list_run_item_timer_complete", {
				run_id: run.id,
				item_id: snap.item_id,
			});
		});
		timerRow.appendChild(completeBtn);
	}

	if (ts.status === "completed") {
		const badge = document.createElement("span");
		badge.className = "list-item-badge";
		badge.textContent = "done";
		timerRow.appendChild(badge);
	}

	content.appendChild(timerRow);
	el.appendChild(content);
};

const renderNoteRunItem = (el, ri, snap, run, readonly) => {
	const icon = document.createElement("span");
	icon.className = "list-item-icon";
	icon.textContent = TYPE_ICONS.note;
	el.appendChild(icon);

	const content = document.createElement("div");
	content.className = "list-run-item-content";

	const title = document.createElement("span");
	title.className = "list-run-item-title";
	title.textContent = snap.title || "(untitled)";
	if (snap.quantity || snap.unit) {
		const qtySpan = document.createElement("span");
		qtySpan.className = "list-item-quantity";
		qtySpan.textContent = ` — ${snap.quantity || ""}${snap.unit ? " " + snap.unit : ""}`;
		title.appendChild(qtySpan);
	}
	content.appendChild(title);

	const textarea = document.createElement("textarea");
	textarea.className = "list-run-item-note-textarea";
	textarea.rows = 2;
	textarea.placeholder = snap.config?.placeholder || "Add a note...";
	textarea.value = ri.note_state?.text ?? "";

	if (!readonly && snap.item_id) {
		textarea.addEventListener("input", () => {
			// Debounce 500ms
			const key = ri.id;
			if (noteDebounceTimers.has(key)) clearTimeout(noteDebounceTimers.get(key));
			noteDebounceTimers.set(
				key,
				setTimeout(() => {
					sendMutation("list_run_item_note_set", {
						run_id: run.id,
						item_id: snap.item_id,
						text: textarea.value,
					});
					noteDebounceTimers.delete(key);
				}, 500)
			);
		});
	}

	content.appendChild(textarea);
	el.appendChild(content);
};

const computeTimerElapsed = (ts) => {
	if (!ts || typeof ts !== "object") return 0;
	let elapsed = ts.elapsed_seconds ?? 0;
	if (ts.status === "running" && ts.last_started_at) {
		const started = new Date(ts.last_started_at).getTime();
		if (!isNaN(started)) {
			const extra = (Date.now() - started) / 1000;
			elapsed += Math.max(0, extra);
		}
	}
	return elapsed;
};

const renderFooter = (bundle) => {
	if (isStandalone) {
		const listCount = listsPayload?.lists?.length ?? 0;
		footerOwner.textContent = `${listCount} list${listCount !== 1 ? "s" : ""}`;
		footerRev.textContent = bundle ? `rev ${bundle.definition.rev}` : "";
		footerStatus.textContent = bundle?.run ? bundle.run.status : "";
		return;
	}
	const def = bundle.definition;
	const run = bundle.run;

	footerOwner.textContent = def.owner ? `${def.owner.kind}` : "";
	footerRev.textContent = `rev ${def.rev ?? 0}`;
	footerStatus.textContent = run ? `run: ${run.status}` : "no run";
};

// ---------------------------------------------------------------
// Timer ticking
// ---------------------------------------------------------------

const startTimerTick = () => {
	if (timerIntervalId) return;
	timerIntervalId = setInterval(() => {
		const bundle = getSelectedBundle();
		if (!bundle?.run_items) return;

		for (const ri of bundle.run_items) {
			const ts = ri.timer_state;
			if (!ts || ts.status !== "running") continue;

			const display = document.querySelector(`[data-run-item-id="${ri.id}"]`);
			if (!display) continue;

			const elapsed = computeTimerElapsed(ts);
			const duration = ts.duration_seconds ?? ri.snapshot?.config?.duration_seconds ?? 0;
			display.textContent = `${formatDuration(elapsed)} / ${formatDuration(duration)}`;
		}
	}, 1000);
};

// ---------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------

const openAddListDialog = () => {
	listTitleInput.value = "";
	listIconInput.value = "";
	listColorInput.value = "#4A90D9";
	listTagsInput.value = "";
	const checklist = addListDialog.querySelector('input[name="listKind"][value="checklist"]');
	if (checklist) checklist.checked = true;
	addListDialog.showModal();
	listTitleInput.focus();
};

const closeAddListDialog = () => {
	addListDialog.close();
};

const submitAddList = () => {
	const title = listTitleInput.value.trim();
	if (!title) {
		listTitleInput.focus();
		return;
	}
	const kind = addListDialog.querySelector('input[name="listKind"]:checked')?.value ?? "checklist";
	const lists = listsPayload?.lists ?? [];
	const maxPos = lists.reduce((max, b) => Math.max(max, b.definition?.position ?? 0), -1);

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
	closeAddListDialog();
};

const openItemDialog = (existingItem = null) => {
	editingItemId = existingItem?.id ?? null;
	itemDialogTitle.textContent = existingItem ? "Edit Item" : "New Item";
	itemDialogSubmit.textContent = existingItem ? "Save" : "Create";

	itemTitleInput.value = existingItem?.title ?? "";
	itemDescriptionInput.value = existingItem?.description ?? "";
	timerDurationInput.value = existingItem?.config?.duration_seconds ?? "";
	itemRequiredInput.checked = existingItem ? !!existingItem.required : true;
	itemQuantityInput.value = existingItem?.quantity ?? "";
	itemUnitInput.value = existingItem?.unit ?? "";

	const typeValue = existingItem?.type ?? "checkbox";
	const radio = itemDialog.querySelector(`input[name="itemType"][value="${typeValue}"]`);
	if (radio) radio.checked = true;

	updateItemDialogVisibility(typeValue);

	itemDialog.showModal();
	itemTitleInput.focus();
};

const closeItemDialog = () => {
	editingItemId = null;
	itemDialog.close();
};

const updateItemDialogVisibility = (type) => {
	if (type === "timer") {
		timerDurationGroup.classList.add("visible");
	} else {
		timerDurationGroup.classList.remove("visible");
	}

	// Note items are forced to required=false
	if (type === "note") {
		itemRequiredInput.checked = false;
		itemRequiredInput.disabled = true;
	} else {
		itemRequiredInput.disabled = false;
	}
};

// ---------------------------------------------------------------
// Delete confirmation dialog (standalone mode)
// ---------------------------------------------------------------

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

// ---------------------------------------------------------------
// Share dialog
// ---------------------------------------------------------------

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

// ---------------------------------------------------------------
// Attach picker (standalone mode)
// ---------------------------------------------------------------

const escapeHtml = (str) => {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
};

const openAttachPicker = async (listId) => {
	attachListId = listId;
	attachFocusIndex = -1;
	attachInput.value = "";

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

const confirmAttach = (targetRef) => {
	if (!attachListId) return;
	sendMutation("standalone_list_attach", {
		list_id: attachListId,
		target: { kind: targetRef.kind, id: targetRef.id },
		position: 0,
	});
	closeAttachPicker();
	showToast(`Attaching to ${targetRef.kind}: ${targetRef.label}`, 2000, "success");
};

const submitItemDialog = () => {
	const title = itemTitleInput.value.trim();
	if (!title) {
		itemTitleInput.focus();
		return;
	}

	const type = itemDialog.querySelector('input[name="itemType"]:checked')?.value ?? "checkbox";
	const required = type === "note" ? false : itemRequiredInput.checked;
	const description = itemDescriptionInput.value.trim() || null;
	const quantity = itemQuantityInput.value.trim() || null;
	const unit = itemUnitInput.value.trim() || "";
	let config = {};
	if (type === "timer") {
		const dur = parseInt(timerDurationInput.value, 10);
		if (!dur || dur <= 0) {
			timerDurationInput.focus();
			return;
		}
		config = { duration_seconds: dur };
	}

	if (editingItemId) {
		// Find existing item for its current properties
		const bundle = getSelectedBundle();
		const existingItem = bundle?.items?.find((i) => i.id === editingItemId);

		sendMutation("list_item_edit", {
			id: editingItemId,
			list_id: selectedListId,
			parent_item_id: existingItem?.parent_item_id ?? null,
			position: existingItem?.position ?? 0,
			item_type: type,
			title,
			description,
			required,
			config,
			quantity,
			unit,
		});
	} else {
		const bundle = getSelectedBundle();
		const items = bundle?.items ?? [];
		const maxPos = items.reduce((max, i) => Math.max(max, i.position ?? 0), -1);

		sendMutation("list_item_create", {
			list_id: selectedListId,
			parent_item_id: null,
			position: maxPos + 1,
			item_type: type,
			title,
			description,
			required,
			config,
			quantity,
			unit,
		});
	}

	closeItemDialog();
};

// ---------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------

ipc.on("data-from-parent", (_, data) => {
	if (!data?.target) return;
	target = data.target;
	isStandalone = target.kind === "standalone_home";
	currentUserId = data.currentUserId ?? null;

	// Standalone lists are never frozen
	isOwnerFrozen = false;

	ipc.send("lists-fetch", { target });
});

ipc.on("lists-data", (_, payload) => {
	if (!payload) return;
	listsPayload = payload;

	// Update frozen state from payload context
	// If the target is a task/occurrence with completed/canceled run, mark frozen
	const lists = payload?.lists ?? [];
	if (target?.kind === "schedule") {
		isOwnerFrozen = false; // schedules manage templates
	}

	render();
	startTimerTick();
});

ipc.on("lists-error", (_, errorPayload) => {
	const msg = errorPayload?.message || errorPayload?.type || "An error occurred";
	showToast(msg);

	// Refetch (preserving search/filter state for standalone)
	if (target) {
		if (isStandalone) {
			refetchLists();
		} else {
			ipc.send("lists-fetch", { target });
		}
	}
});

ipc.on("lists-attach-success", (_, payload) => {
	const dest = payload?.destination;
	if (dest?.target) {
		showToast(`List attached to ${dest.target.kind} successfully`, 3000, "success");
	}
});

ipc.on("lists-shares-list", (_, data) => {
	if (!shareDialog.open) return;
	currentShares = Array.isArray(data) ? data : [];
	renderShareList();
});

ipc.on("lists-share-created", (_, data) => {
	if (data?.list_share && shareDialog.open && data.list_share.list_id === shareListId) {
		// Avoid duplicates on replay/reconnect
		if (!currentShares.some(s => s.shared_with_user_id === data.list_share.shared_with_user_id)) {
			currentShares.push(data.list_share);
		}
		renderShareList();
		showToast("List shared successfully", 2000, "success");
	}
});

ipc.on("lists-share-removed", (_, data) => {
	if (shareDialog.open && data?.list_id === shareListId) {
		currentShares = currentShares.filter(s => s.shared_with_user_id !== data.user_id);
		renderShareList();
	}
});

// ---------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------

closeBtn.addEventListener("click", () => {
	window.close();
});

addListBtn.addEventListener("click", () => {
	openAddListDialog();
});

addListSubmit.addEventListener("click", () => {
	submitAddList();
});

addListCancel.addEventListener("click", () => {
	closeAddListDialog();
});

addItemBtn.addEventListener("click", () => {
	if (!selectedListId) return;
	openItemDialog();
});

itemDialogSubmit.addEventListener("click", () => {
	submitItemDialog();
});

itemDialogCancel.addEventListener("click", () => {
	closeItemDialog();
});

deleteConfirmSubmit.addEventListener("click", confirmDelete);
deleteConfirmCancel.addEventListener("click", closeDeleteConfirmDialog);

shareInviteBtn.addEventListener("click", submitShareInvite);
shareCloseBtn.addEventListener("click", closeShareDialog);
shareEmailInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") submitShareInvite();
});

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

// Type radio change in item dialog
itemDialog.querySelectorAll('input[name="itemType"]').forEach((radio) => {
	radio.addEventListener("change", (e) => {
		updateItemDialogVisibility(e.target.value);
	});
});

// Prevent dialog cancel from closing on backdrop click
addListDialog.addEventListener("cancel", (e) => e.preventDefault());
itemDialog.addEventListener("cancel", (e) => e.preventDefault());
deleteConfirmDialog.addEventListener("cancel", (e) => e.preventDefault());
shareDialog.addEventListener("cancel", (e) => e.preventDefault());

// ---------------------------------------------------------------
// Keyboard Navigation
// ---------------------------------------------------------------

const getFocusableItems = (panel) => {
	if (panel === "sidebar") {
		return [...sidebarItems.querySelectorAll(".list-sidebar-item[tabindex]")];
	}
	return [...runItemsEl.querySelectorAll(".list-run-item[tabindex]")];
};

const focusItem = (panel, index) => {
	const items = getFocusableItems(panel);
	if (items.length === 0) return;
	focusPanel = panel;
	focusIndex = Math.max(0, Math.min(index, items.length - 1));
	items[focusIndex]?.focus();
};

const activateFocusedRunItem = (el) => {
	if (!el) return;
	const type = el.getAttribute("data-item-type");
	if (type === "checkbox") {
		const cb = el.querySelector(".list-run-item-checkbox");
		if (cb && !cb.disabled) {
			cb.checked = !cb.checked;
			cb.dispatchEvent(new Event("change"));
		}
	} else if (type === "timer") {
		// Click the first visible action button (Start/Pause)
		const btn = el.querySelector(".list-run-item-timer-btn:not(.complete-btn)");
		if (btn) btn.click();
	} else if (type === "note") {
		const textarea = el.querySelector(".list-run-item-note-textarea");
		if (textarea) textarea.focus();
	}
};

document.addEventListener("keydown", (e) => {
	const inDialog = addListDialog.open || itemDialog.open || deleteConfirmDialog.open || (shareDialog && shareDialog.open) || !attachOverlay.classList.contains("hidden");
	const inInput = document.activeElement?.tagName === "INPUT" ||
		document.activeElement?.tagName === "TEXTAREA";

	// Dialog handling
	if (e.key === "Escape") {
		if (!attachOverlay.classList.contains("hidden")) { closeAttachPicker(); return; }
		if (shareDialog && shareDialog.open) { closeShareDialog(); return; }
		if (deleteConfirmDialog.open) { closeDeleteConfirmDialog(); return; }
		if (helpPanel.classList.contains("visible")) {
			helpPanel.classList.remove("visible");
		} else if (addListDialog.open) {
			closeAddListDialog();
		} else if (itemDialog.open) {
			closeItemDialog();
		} else {
			window.close();
		}
		return;
	}

	if (e.key === "Enter" && !e.shiftKey) {
		if (deleteConfirmDialog.open) { confirmDelete(); return; }
		if (addListDialog.open) {
			e.preventDefault();
			submitAddList();
			return;
		}
		if (itemDialog.open && document.activeElement !== itemDescriptionInput) {
			e.preventDefault();
			submitItemDialog();
			return;
		}
	}

	if (inDialog || inInput) return;

	// Arrow navigation
	if (e.key === "ArrowDown" || e.key === "j") {
		e.preventDefault();
		const items = getFocusableItems(focusPanel);
		if (items.length === 0) return;
		focusItem(focusPanel, focusIndex + 1);
	} else if (e.key === "ArrowUp" || e.key === "k") {
		e.preventDefault();
		focusItem(focusPanel, focusIndex - 1);
	} else if (e.key === "ArrowLeft" || e.key === "h") {
		e.preventDefault();
		focusItem("sidebar", 0);
	} else if (e.key === "ArrowRight" || e.key === "l") {
		e.preventDefault();
		focusItem("run", 0);
	} else if (e.key === "Tab") {
		e.preventDefault();
		const nextPanel = focusPanel === "sidebar" ? "run" : "sidebar";
		focusItem(nextPanel, 0);
	} else if (e.key === " " || (e.key === "Enter" && !inDialog)) {
		// Activate focused run item (toggle checkbox, start/pause timer)
		e.preventDefault();
		if (focusPanel === "sidebar") {
			const items = getFocusableItems("sidebar");
			const el = items[focusIndex];
			if (el) {
				const id = el.getAttribute("data-sidebar-id");
				if (id) {
					selectedListId = id;
					render();
					// Refocus sidebar after re-render
					requestAnimationFrame(() => focusItem("sidebar", focusIndex));
				}
			}
		} else {
			const items = getFocusableItems("run");
			activateFocusedRunItem(items[focusIndex]);
		}
	} else if (e.key === "n") {
		// New list
		openAddListDialog();
	} else if (e.key === "a") {
		// Add item
		if (selectedListId) openItemDialog();
	} else if (e.key === "x" && isStandalone && selectedListId) {
		const bundle = getSelectedBundle();
		openDeleteConfirmDialog(selectedListId, bundle?.definition?.title);
	} else if (e.key === "?") {
		helpPanel.classList.toggle("visible");
	}
});

helpCloseBtn.addEventListener("click", () => {
	helpPanel.classList.remove("visible");
});

// ---------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------

window.addEventListener("beforeunload", () => {
	ipc.send("lists-unsubscribe");
	if (timerIntervalId) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}
	for (const [, timer] of noteDebounceTimers) {
		clearTimeout(timer);
	}
	noteDebounceTimers.clear();
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = null;
	}
});
