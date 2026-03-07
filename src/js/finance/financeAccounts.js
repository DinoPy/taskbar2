import { sendEvent, showToast, switchSection, state, utils } from "./financeWindow.js";

const { el, formatCurrency, displayToCents, centsToDisplay } = utils;

let unsubs = [];
let container = null;
let editingId = null;
let formVisible = false;

const ACCOUNT_TYPES = [
	{ value: "checking", label: "Checking" },
	{ value: "savings", label: "Savings" },
	{ value: "credit_card", label: "Credit Card" },
	{ value: "cash", label: "Cash" },
	{ value: "deposit", label: "Deposit" },
	{ value: "loan", label: "Loan" },
	{ value: "investment", label: "Investment" },
];

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;
	unsubs.push(state.on("accounts", () => renderContent()));

	const s = state.getState();
	if (s.accounts.size === 0) {
		sendEvent("fin_accounts_fetch", {});
	}
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_account_created") {
		showToast("Account created", "info");
		formVisible = false;
		editingId = null;
		renderContent();
	}
	if (event === "fin_account_updated") {
		showToast("Account updated", "info");
		formVisible = false;
		editingId = null;
		renderContent();
	}
	if (event === "fin_account_deleted") {
		showToast("Account deleted", "info");
	}
	if (event === "fin_account_archived") {
		showToast("Account archived", "info");
	}
}

// =========================================
// Destroy
// =========================================

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	editingId = null;
	formVisible = false;
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	// Header
	const header = el("div", { class: "fin-section-header" },
		el("h2", {}, "Accounts"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				editingId = null;
				formVisible = !formVisible;
				renderContent();
			} }, formVisible && !editingId ? "Cancel" : "+ Add Account"),
		),
	);
	container.appendChild(header);

	// Form panel
	if (formVisible) {
		const editing = editingId ? state.getState().accounts.get(editingId) : null;
		container.appendChild(buildForm(editing));
	}

	// Account cards grid
	const accounts = getSortedAccounts();
	if (accounts.length === 0 && !formVisible) {
		container.appendChild(el("div", { class: "fin-empty-state" }, "No accounts. Add your first account."));
		return;
	}

	const grid = el("div", { class: "fin-card-grid" });
	for (const a of accounts) {
		grid.appendChild(buildAccountCard(a));
	}
	container.appendChild(grid);
}

// =========================================
// Get sorted accounts
// =========================================

function getSortedAccounts() {
	const accounts = [...state.getState().accounts.values()];
	accounts.sort((a, b) => {
		if (a.is_archived && !b.is_archived) return 1;
		if (!a.is_archived && b.is_archived) return -1;
		return (a.position || 0) - (b.position || 0);
	});
	return accounts;
}

// =========================================
// Account card
// =========================================

function buildAccountCard(a) {
	const typeLabel = ACCOUNT_TYPES.find(t => t.value === a.account_type)?.label || a.account_type || "";
	const balance = Number(a.balance || 0);

	const card = el("div", { class: "fin-card", "data-id": a.id, draggable: "true" },
		el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", marginBottom: "var(--spacing-sm)" } },
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-account-color-dot", style: { backgroundColor: a.color || "var(--color-accent-primary)" } }),
				el("span", { style: { fontWeight: "var(--font-weight-semibold)" } }, a.name || "Unnamed"),
			),
			el("div", { class: "fin-flex-row fin-gap-sm" },
				a.is_archived ? el("span", { class: "fin-badge" }, "Archived") : null,
				el("span", { class: "fin-badge" }, typeLabel),
			),
		),
		el("div", { class: "fin-text-mono", style: { fontSize: "var(--font-size-xl)", marginBottom: "var(--spacing-sm)" } },
			formatCurrency(balance, a.currency || "RON"),
		),
		el("div", { class: "fin-flex-row fin-gap-sm", style: { justifyContent: "flex-end" } },
			el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				editingId = a.id;
				formVisible = true;
				renderContent();
			} }, "Edit"),
			el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				sendEvent("fin_account_archive", { id: a.id, is_archived: !a.is_archived });
			} }, a.is_archived ? "Unarchive" : "Archive"),
			el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: (e) => {
				handleDelete(a, e.currentTarget);
			} }, "Delete"),
		),
	);

	// Drag events
	card.addEventListener("dragstart", (e) => {
		e.dataTransfer.setData("text/plain", a.id);
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
		if (draggedId && draggedId !== a.id) {
			handleReorder(draggedId, a.id);
		}
	});

	return card;
}

// =========================================
// Delete with inline confirmation
// =========================================

function handleDelete(account, btnEl) {
	if (btnEl.dataset.confirming) {
		sendEvent("fin_account_delete", { id: account.id });
		return;
	}
	btnEl.dataset.confirming = "true";
	btnEl.textContent = "Confirm?";
	btnEl.classList.add("fin-btn-danger");
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
	const accounts = getSortedAccounts().filter(a => !a.is_archived);
	const ids = accounts.map(a => a.id);
	const fromIdx = ids.indexOf(draggedId);
	const toIdx = ids.indexOf(targetId);
	if (fromIdx < 0 || toIdx < 0) return;

	ids.splice(fromIdx, 1);
	ids.splice(toIdx, 0, draggedId);

	const positions = ids.map((id, i) => ({ id, position: i }));
	sendEvent("fin_account_reorder", { positions });
}

// =========================================
// Form
// =========================================

function buildForm(editing) {
	const panel = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	const title = el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } },
		editing ? "Edit Account" : "New Account",
	);
	panel.appendChild(title);

	const form = el("div", { class: "fin-form" });

	// Name
	const nameInput = el("input", { class: "fin-input", type: "text", placeholder: "Account name" });
	if (editing) nameInput.value = editing.name || "";
	form.appendChild(formRow("Name", nameInput));

	// Account type
	const typeSelect = el("select", { class: "fin-select" });
	for (const t of ACCOUNT_TYPES) {
		const opt = el("option", { value: t.value }, t.label);
		if (editing && editing.account_type === t.value) opt.selected = true;
		typeSelect.appendChild(opt);
	}
	form.appendChild(formRow("Type", typeSelect));

	// Currency
	const currInput = el("input", { class: "fin-input", type: "text", placeholder: "RON" });
	currInput.value = editing ? (editing.currency || "RON") : "RON";
	form.appendChild(formRow("Currency", currInput));

	// Initial balance
	const balInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00" });
	if (editing) balInput.value = centsToDisplay(Number(editing.balance || 0));
	form.appendChild(formRow("Balance", balInput));

	// Icon
	const iconInput = el("input", { class: "fin-input", type: "text", placeholder: "Icon (optional)" });
	if (editing) iconInput.value = editing.icon || "";
	form.appendChild(formRow("Icon", iconInput));

	// Color
	const colorInput = el("input", { class: "fin-input", type: "color" });
	colorInput.value = editing?.color || "#22c55e";
	form.appendChild(formRow("Color", colorInput));

	// Notes
	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes (optional)" });
	if (editing) notesInput.value = editing.notes || "";
	form.appendChild(formRow("Notes", notesInput));

	// Buttons
	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			const payload = {
				name: nameInput.value.trim(),
				account_type: typeSelect.value,
				currency: currInput.value.trim() || "RON",
				initial_balance: displayToCents(balInput.value),
				icon: iconInput.value.trim(),
				color: colorInput.value,
				notes: notesInput.value.trim(),
			};
			if (!payload.name) {
				showToast("Name is required", "error");
				return;
			}
			if (editing) {
				payload.id = editing.id;
				payload.last_modified_at = editing.last_modified_at;
				sendEvent("fin_account_edit", payload);
			} else {
				sendEvent("fin_account_create", payload);
			}
		} }, editing ? "Save" : "Create"),
		el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
			formVisible = false;
			editingId = null;
			renderContent();
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
