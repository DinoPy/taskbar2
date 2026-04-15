import { beginFinanceWrite, sendEvent, showToast, state, utils } from "./financeWindow.js";
import { resolveMultiReference } from "./financeReferenceState.js";

const { el, formatCurrency } = utils;

let unsubs = [];
let container = null;
let editingId = null;
let formVisible = false;
let formDraft = null;

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;
	unsubs.push(state.on("customViews", () => renderContent()));
	unsubs.push(state.on("accounts", () => renderContent()));

	const s = state.getState();
	if (s.customViews.size === 0) {
		sendEvent("fin_custom_views_fetch", {});
	}
	if (s.accounts.size === 0) {
		sendEvent("fin_accounts_fetch", {});
	}
	renderContent();
}

// =========================================
// onEvent — refetch views when balances change
// =========================================

// =========================================
// onEvent
// =========================================

export function onEvent() {}

// =========================================
// Destroy
// =========================================

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	editingId = null;
	formVisible = false;
	formDraft = null;
}

function createViewDraft(editing) {
	return {
		name: editing?.name || "",
		account_ids: Array.isArray(editing?.account_ids) ? [...editing.account_ids] : [],
	};
}

function ensureFormDraft(editing) {
	if (!formDraft) {
		formDraft = createViewDraft(editing);
	}
	return formDraft;
}

function openForm(view = null) {
	editingId = view?.id || null;
	formDraft = createViewDraft(view);
	formVisible = true;
	renderContent();
}

function closeForm() {
	formVisible = false;
	editingId = null;
	formDraft = null;
	renderContent();
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;

	if (formVisible && editingId && !state.getState().customViews.has(editingId)) {
		showToast("This item no longer exists. The list has been refreshed.", "info");
		closeForm();
		return;
	}

	container.innerHTML = "";

	const header = el("div", { class: "fin-section-header" },
		el("h2", {}, "Custom Views"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				if (formVisible && !editingId) closeForm();
				else openForm(null);
			} }, formVisible && !editingId ? "Cancel" : "+ Add View"),
		),
	);
	container.appendChild(header);

	if (formVisible) {
		const editing = editingId ? state.getState().customViews.get(editingId) : null;
		container.appendChild(buildForm(editing));
	}

	const views = getSortedViews();
	if (views.length === 0 && !formVisible) {
		container.appendChild(el("div", { class: "fin-empty-state" }, "No custom views. Create one to group accounts."));
		return;
	}

	const grid = el("div", { class: "fin-card-grid" });
	for (const v of views) {
		grid.appendChild(buildViewCard(v));
	}
	container.appendChild(grid);
}

// =========================================
// Get sorted views
// =========================================

function getSortedViews() {
	return [...state.getState().customViews.values()]
		.sort((a, b) => (a.position || 0) - (b.position || 0));
}

// =========================================
// View card
// =========================================

function buildViewCard(v) {
	const accounts = state.getState().accounts;
	const balance = Number(v.computed_balance ?? 0);

	// Resolve account names
	const accountNames = (v.account_ids || []).map(id => {
		const acct = accounts.get(id);
		return acct ? acct.name : "Unknown";
	});

	// Determine currency from first account (or default)
	const firstAccount = accounts.get((v.account_ids || [])[0]);
	const currency = firstAccount?.currency || "RON";

	const card = el("div", { class: "fin-card", "data-id": v.id, draggable: "true" },
		el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", marginBottom: "var(--spacing-sm)" } },
			el("span", { style: { fontWeight: "var(--font-weight-semibold)" } }, v.name || "Unnamed"),
			el("span", { class: "fin-badge" }, (v.account_ids || []).length + " accounts"),
		),
		el("div", { class: "fin-text-mono", style: { fontSize: "var(--font-size-xl)", marginBottom: "var(--spacing-sm)" } },
			formatCurrency(balance, currency),
		),
		el("div", { style: { fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginBottom: "var(--spacing-sm)" } },
			accountNames.join(", ") || "No accounts selected",
		),
		el("div", { class: "fin-flex-row fin-gap-sm", style: { justifyContent: "flex-end" } },
			el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				openForm(v);
			} }, "Edit"),
			el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: (e) => {
				handleDelete(v, e.currentTarget);
			} }, "Delete"),
		),
	);

	// Drag events
	card.addEventListener("dragstart", (e) => {
		e.dataTransfer.setData("text/plain", v.id);
		card.classList.add("fin-dragging");
	});
	card.addEventListener("dragend", () => {
		card.classList.remove("fin-dragging");
	});
	card.addEventListener("dragover", (e) => {
		e.preventDefault();
		card.classList.add("fin-drag-over");
	});
	card.addEventListener("dragleave", () => {
		card.classList.remove("fin-drag-over");
	});
	card.addEventListener("drop", (e) => {
		e.preventDefault();
		card.classList.remove("fin-drag-over");
		const draggedId = e.dataTransfer.getData("text/plain");
		if (draggedId && draggedId !== v.id) {
			handleReorder(draggedId, v.id);
		}
	});

	return card;
}

// =========================================
// Delete with inline confirmation
// =========================================

function handleDelete(view, btnEl) {
	if (btnEl.dataset.confirming) {
		beginFinanceWrite("fin_custom_view_delete", {
			entityKind: "custom_view",
			entityId: view.id,
			refreshKinds: ["customViews"],
			onSuccess: () => {
				showToast("Custom view deleted", "info");
			},
		});
		sendEvent("fin_custom_view_delete", { id: view.id, last_modified_at: Date.now() });
		return;
	}
	btnEl.dataset.confirming = "true";
	btnEl.textContent = "Confirm?";
	setTimeout(() => {
		if (btnEl.isConnected) {
			delete btnEl.dataset.confirming;
			btnEl.textContent = "Delete";
		}
	}, 3000);
}

// =========================================
// Reorder
// =========================================

function handleReorder(draggedId, targetId) {
	const views = getSortedViews();
	const ids = views.map(v => v.id);
	const fromIdx = ids.indexOf(draggedId);
	const toIdx = ids.indexOf(targetId);
	if (fromIdx < 0 || toIdx < 0) return;

	ids.splice(fromIdx, 1);
	ids.splice(toIdx, 0, draggedId);

	const orders = ids.map((id, i) => ({ id, position: i }));
	beginFinanceWrite("fin_custom_view_reorder", {
		entityKind: "custom_view",
		refreshKinds: ["customViews"],
	});
	sendEvent("fin_custom_view_reorder", { orders, last_modified_at: Date.now() });
}

// =========================================
// Form
// =========================================

function buildForm(editing) {
	const draft = ensureFormDraft(editing);
	const panel = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	const title = el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } },
		editing ? "Edit Custom View" : "New Custom View",
	);
	panel.appendChild(title);

	const form = el("div", { class: "fin-form" });

	// Name
	const nameInput = el("input", { class: "fin-input", type: "text", placeholder: "View name" });
	nameInput.value = draft.name;
	nameInput.addEventListener("input", () => {
		draft.name = nameInput.value;
	});
	form.appendChild(formRow("Name", nameInput));

	// Account picker (multi-select checkboxes)
	const accounts = [...state.getState().accounts.values()]
		.filter(a => !a.is_archived)
		.sort((a, b) => (a.position || 0) - (b.position || 0));
	const activeAccountMap = new Map(accounts.map(account => [account.id, account]));
	const resolvedAccounts = resolveMultiReference(draft.account_ids, activeAccountMap);
	const selectedIds = new Set(draft.account_ids);

	const pickerContainer = el("div", { class: "fin-custom-view-account-picker" });
	for (const acct of accounts) {
		const checked = selectedIds.has(acct.id);
		const cb = el("input", { type: "checkbox", checked, "data-account-id": acct.id });
		cb.addEventListener("change", () => {
			if (cb.checked) selectedIds.add(acct.id);
			else selectedIds.delete(acct.id);
			draft.account_ids = [...selectedIds];
			if (container) renderContent();
		});
		const label = el("label", { class: "fin-custom-view-account-option" },
			cb,
			el("span", { class: "fin-account-color-dot", style: { backgroundColor: acct.color || "var(--color-accent-primary)" } }),
			el("span", {}, acct.name || "Unnamed"),
		);
		pickerContainer.appendChild(label);
	}
	form.appendChild(formRow("Accounts", pickerContainer));
	if (resolvedAccounts.hasStale) {
		form.appendChild(formHint("Some selected accounts are no longer available. Remove them before saving.", "error"));
		for (const staleId of resolvedAccounts.staleIds) {
			form.appendChild(el("div", {
				class: "fin-flex-row fin-gap-sm",
				style: {
					alignItems: "center",
					marginBottom: "var(--spacing-xs)",
					fontSize: "var(--font-size-xs)",
					color: "var(--color-danger, #dc2626)",
				},
			},
				el("span", {}, staleId),
				el("button", {
					class: "fin-btn fin-btn-sm fin-btn-secondary",
					onClick: () => {
						draft.account_ids = draft.account_ids.filter(id => id !== staleId);
						renderContent();
					},
				}, "Remove"),
			));
		}
	}

	// Buttons
	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			const name = draft.name.trim();
			if (!name) {
				showToast("Name is required", "error");
				return;
			}
			if (resolvedAccounts.hasStale) {
				showToast("Remove stale accounts before saving this custom view.", "error");
				return;
			}
			if (resolvedAccounts.validIds.length === 0) {
				showToast("Select at least one account", "error");
				return;
			}
				const payload = {
					name,
					account_ids: [...resolvedAccounts.validIds],
					last_modified_at: Date.now(),
				};
				if (editing) {
					beginFinanceWrite("fin_custom_view_edit", {
						entityKind: "custom_view",
						entityId: editing.id,
						refreshKinds: ["customViews", "accounts"],
						onSuccess: () => {
							showToast("Custom view updated", "info");
							closeForm();
						},
						onNotFound: () => {
							closeForm();
						},
					});
					payload.id = editing.id;
					sendEvent("fin_custom_view_edit", payload);
				} else {
				beginFinanceWrite("fin_custom_view_create", {
					entityKind: "custom_view",
					refreshKinds: ["customViews", "accounts"],
					matches: (eventName, response) => (
						eventName === "fin_custom_view_created" &&
						Number(response?.last_modified_at) === Number(payload.last_modified_at) &&
						response?.name === payload.name &&
						Array.isArray(response?.account_ids) &&
						response.account_ids.length === payload.account_ids.length &&
						[...response.account_ids].sort().every((id, index) => id === [...payload.account_ids].sort()[index])
					),
					onSuccess: () => {
						showToast("Custom view created", "info");
						closeForm();
					},
					onNotFound: () => {
						renderContent();
					},
				});
				payload.position = state.getState().customViews.size;
				sendEvent("fin_custom_view_create", payload);
			}
		} }, editing ? "Save" : "Create"),
		el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
			closeForm();
		} }, "Cancel"),
	);
	form.appendChild(btns);

	panel.appendChild(form);
	return panel;
}

function formRow(label, input) {
	return el("div", { class: "fin-form-row" },
		el("label", {}, label),
		input,
	);
}

function formHint(message, tone = "muted") {
	const color = tone === "error" ? "var(--color-danger, #dc2626)" : "var(--color-text-secondary)";
	return el("div", {
		class: "fin-form-hint",
		style: {
			marginTop: "calc(var(--spacing-xs) * -1)",
			marginBottom: "var(--spacing-sm)",
			fontSize: "var(--font-size-xs)",
			color,
		},
	}, message);
}
