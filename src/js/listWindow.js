const { ipcRenderer } = window.require("electron");
const ipc = ipcRenderer;

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

let target = null;
let listsPayload = null; // Full ListsTargetPayload
let selectedListId = null;
let isOwnerFrozen = false;
let editingItemId = null; // non-null when editing an existing item
let timerIntervalId = null;
let noteDebounceTimers = new Map();
let focusPanel = "run"; // "sidebar" | "run"
let focusIndex = -1;

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

// Dialogs
const addListDialog = document.getElementById("addListDialog");
const listTitleInput = document.getElementById("listTitleInput");
const addListSubmit = document.getElementById("addListSubmit");
const addListCancel = document.getElementById("addListCancel");

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

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------

let toastTimeout = null;
const showToast = (message, duration = 3000) => {
	if (toastTimeout) clearTimeout(toastTimeout);
	errorToast.textContent = message;
	errorToast.classList.add("visible");
	toastTimeout = setTimeout(() => {
		errorToast.classList.remove("visible");
	}, duration);
};

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

const render = () => {
	const lists = listsPayload?.lists ?? [];
	const hasLists = lists.length > 0;

	// Update header
	if (target) {
		headerTarget.textContent = `${target.kind}: ${target.id.substring(0, 8)}...`;
	}

	// Toggle readonly
	const body = document.body;
	if (isOwnerFrozen) {
		body.classList.add("list-readonly");
	} else {
		body.classList.remove("list-readonly");
	}

	renderSidebar(lists);

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
	const sorted = sortByPosition(lists.map((b) => b.definition).filter(Boolean));
	sidebarItems.innerHTML = "";

	for (const def of sorted) {
		const item = document.createElement("div");
		item.className = "list-sidebar-item" + (def.id === selectedListId ? " active" : "");
		item.setAttribute("tabindex", "0");
		item.setAttribute("data-sidebar-id", def.id);

		const titleSpan = document.createElement("span");
		titleSpan.className = "list-sidebar-item-title";
		titleSpan.textContent = def.title || "(untitled)";
		item.appendChild(titleSpan);

		const actionsDiv = document.createElement("div");
		actionsDiv.className = "list-sidebar-item-actions";

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "list-sidebar-item-action delete";
		deleteBtn.textContent = "\u2715";
		deleteBtn.title = "Delete list";
		deleteBtn.setAttribute("tabindex", "-1");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			sendMutation("list_delete", { id: def.id });
		});
		actionsDiv.appendChild(deleteBtn);
		item.appendChild(actionsDiv);

		item.addEventListener("click", () => {
			selectedListId = def.id;
			render();
		});

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
		el.className = "list-run-item" + (isChild ? " child" : "") + (ri.is_completed ? " completed" : "");
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
	checkbox.checked = !!ri.is_completed;
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
	content.appendChild(title);
	if (snap.description) {
		const desc = document.createElement("span");
		desc.className = "list-run-item-description";
		desc.textContent = snap.description;
		content.appendChild(desc);
	}
	el.appendChild(content);
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

const submitItemDialog = () => {
	const title = itemTitleInput.value.trim();
	if (!title) {
		itemTitleInput.focus();
		return;
	}

	const type = itemDialog.querySelector('input[name="itemType"]:checked')?.value ?? "checkbox";
	const required = type === "note" ? false : itemRequiredInput.checked;
	const description = itemDescriptionInput.value.trim() || null;
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

	// Determine if owner is frozen based on target kind context
	// The server enforces this; the UI hints are best-effort
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

	// Refetch
	if (target) {
		ipc.send("lists-fetch", { target });
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

// Type radio change in item dialog
itemDialog.querySelectorAll('input[name="itemType"]').forEach((radio) => {
	radio.addEventListener("change", (e) => {
		updateItemDialogVisibility(e.target.value);
	});
});

// Prevent dialog cancel from closing on backdrop click
addListDialog.addEventListener("cancel", (e) => e.preventDefault());
itemDialog.addEventListener("cancel", (e) => e.preventDefault());

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
	const inDialog = addListDialog.open || itemDialog.open;
	const inInput = document.activeElement?.tagName === "INPUT" ||
		document.activeElement?.tagName === "TEXTAREA";

	// Dialog handling
	if (e.key === "Escape") {
		if (addListDialog.open) {
			closeAddListDialog();
		} else if (itemDialog.open) {
			closeItemDialog();
		} else {
			window.close();
		}
		return;
	}

	if (e.key === "Enter" && !e.shiftKey) {
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
	}
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
});
