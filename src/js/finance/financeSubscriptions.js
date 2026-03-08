import { sendEvent, showToast, state, utils } from "./financeWindow.js";

const { el, formatCurrency, displayToCents, centsToDisplay, formatDateShort, relativeDays } = utils;

let unsubs = [];
let container = null;
let editingId = null;
let formVisible = false;
let summaryData = null;
let collapsedGroups = new Set();

const FREQ_LABELS = { weekly: "week", monthly: "month", yearly: "year", custom: "interval" };
const STATUS_ORDER = ["active", "paused", "cancelled"];

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;
	unsubs.push(state.on("subscriptions", () => renderContent()));
	unsubs.push(state.on("categories", () => { if (formVisible) renderContent(); }));

	sendEvent("fin_subscriptions_fetch", {});
	sendEvent("fin_subscriptions_summary", {});
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_subscriptions_summary") {
		summaryData = data;
		renderContent();
	}
	if (event === "fin_subscription_confirmed") {
		showToast("Payment confirmed", "info");
	}
	if (event === "fin_subscription_created") {
		showToast("Subscription created", "info");
		formVisible = false;
		editingId = null;
		renderContent();
	}
	if (event === "fin_subscription_updated") {
		showToast("Subscription updated", "info");
		formVisible = false;
		editingId = null;
		renderContent();
	}
	if (event === "fin_subscription_deleted") {
		showToast("Subscription deleted", "info");
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
		el("h2", {}, "Subscriptions"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				editingId = null;
				formVisible = !formVisible;
				renderContent();
			} }, formVisible && !editingId ? "Cancel" : "+ Add Subscription"),
		),
	);
	container.appendChild(header);

	// Summary bar
	if (summaryData && Array.isArray(summaryData)) {
		const bar = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)", padding: "var(--spacing-sm) var(--spacing-md)" } });
		const parts = summaryData.map(s => {
			const amt = formatCurrency(Number(s.total_amount || 0), s.currency || "RON");
			const freq = s.frequency || "monthly";
			return amt + " (" + (s.count || 0) + " " + freq + ")";
		});
		bar.appendChild(el("span", { class: "fin-text-sm", style: { color: "var(--color-text-secondary)" } }, parts.join(" | ") || "No active subscriptions"));
		container.appendChild(bar);
	}

	// Form panel
	if (formVisible) {
		const editing = editingId ? state.getState().subscriptions.get(editingId) : null;
		container.appendChild(buildForm(editing));
	}

	// Group subscriptions by status
	const subs = [...state.getState().subscriptions.values()];
	if (subs.length === 0 && !formVisible) {
		container.appendChild(el("div", { class: "fin-empty-state" }, "No subscriptions yet."));
		return;
	}

	const grouped = {};
	for (const status of STATUS_ORDER) grouped[status] = [];
	for (const sub of subs) {
		const st = sub.status || "active";
		if (!grouped[st]) grouped[st] = [];
		grouped[st].push(sub);
	}

	for (const status of STATUS_ORDER) {
		const items = grouped[status];
		if (items.length === 0) continue;

		const collapsed = collapsedGroups.has(status);
		const groupHeader = el("div", {
			class: "fin-flex-row fin-gap-sm",
			style: { cursor: "pointer", padding: "var(--spacing-sm) 0", userSelect: "none" },
			onClick: () => {
				if (collapsedGroups.has(status)) collapsedGroups.delete(status);
				else collapsedGroups.add(status);
				renderContent();
			},
		},
			el("span", { style: { fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-sm)", textTransform: "capitalize" } },
				(collapsed ? "\u25B6 " : "\u25BC ") + status + " (" + items.length + ")"),
		);
		container.appendChild(groupHeader);

		if (!collapsed) {
			const grid = el("div", { class: "fin-card-grid", style: { marginBottom: "var(--spacing-md)" } });
			for (const sub of items) {
				grid.appendChild(buildSubCard(sub));
			}
			container.appendChild(grid);
		}
	}
}

// =========================================
// Subscription card
// =========================================

function buildSubCard(sub) {
	const amount = Number(sub.amount || 0);
	const freqLabel = FREQ_LABELS[sub.frequency] || sub.frequency || "month";
	const interval = sub.frequency_interval && sub.frequency_interval > 1 ? sub.frequency_interval + " " + freqLabel + "s" : freqLabel;
	const status = sub.status || "active";

	const iconDot = el("span", {
		style: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: "28px",
			height: "28px",
			borderRadius: "50%",
			backgroundColor: sub.color || "var(--color-accent-primary)",
			fontSize: "var(--font-size-sm)",
			flexShrink: "0",
		},
	}, sub.icon || "");

	const nameRow = el("div", { class: "fin-flex-row fin-gap-sm", style: { marginBottom: "var(--spacing-xs)" } },
		iconDot,
		el("span", { style: { fontWeight: "var(--font-weight-semibold)" } }, sub.name || "Unnamed"),
		el("span", { class: "fin-badge " + status }, status),
	);

	const amountRow = el("div", { class: "fin-text-mono", style: { marginBottom: "var(--spacing-xs)" } },
		formatCurrency(amount, sub.currency || "RON") + " / " + interval,
	);

	const dueRow = sub.next_due_date
		? el("div", { class: "fin-text-sm fin-text-muted", style: { marginBottom: "var(--spacing-sm)" } },
			formatDateShort(sub.next_due_date) + " \u2014 " + relativeDays(sub.next_due_date))
		: null;

	// Action buttons
	const actions = el("div", { class: "fin-flex-row fin-gap-sm", style: { flexWrap: "wrap" } });

	if (status === "active") {
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
			sendEvent("fin_subscription_confirm", { id: sub.id });
		} }, "Confirm Payment"));
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
			sendEvent("fin_subscription_pause", { id: sub.id });
		} }, "Pause"));
	}
	if (status === "paused") {
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
			sendEvent("fin_subscription_resume", { id: sub.id });
		} }, "Resume"));
	}
	if (status !== "cancelled") {
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
			sendEvent("fin_subscription_cancel", { id: sub.id });
		} }, "Cancel"));
	}

	actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
		editingId = sub.id;
		formVisible = true;
		renderContent();
	} }, "Edit"));

	actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: (e) => {
		handleDelete(sub, e.currentTarget);
	} }, "Delete"));

	return el("div", { class: "fin-card" }, nameRow, amountRow, dueRow, actions);
}

// =========================================
// Delete with inline confirmation
// =========================================

function handleDelete(sub, btnEl) {
	if (btnEl.dataset.confirming) {
		sendEvent("fin_subscription_delete", { id: sub.id });
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
// Form
// =========================================

function buildForm(editing) {
	const panel = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	panel.appendChild(el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } },
		editing ? "Edit Subscription" : "New Subscription"));

	const form = el("div", { class: "fin-form" });

	const nameInput = el("input", { class: "fin-input", type: "text", placeholder: "Subscription name" });
	if (editing) nameInput.value = editing.name || "";
	form.appendChild(formRow("Name", nameInput));

	const amountInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00" });
	if (editing) amountInput.value = centsToDisplay(Number(editing.amount || 0));
	form.appendChild(formRow("Amount", amountInput));

	const currInput = el("input", { class: "fin-input", type: "text", placeholder: "RON" });
	currInput.value = editing ? (editing.currency || "RON") : "RON";
	form.appendChild(formRow("Currency", currInput));

	const freqSelect = el("select", { class: "fin-select" });
	for (const f of ["weekly", "monthly", "yearly", "custom"]) {
		const opt = el("option", { value: f }, f.charAt(0).toUpperCase() + f.slice(1));
		if (editing && editing.frequency === f) opt.selected = true;
		freqSelect.appendChild(opt);
	}
	form.appendChild(formRow("Frequency", freqSelect));

	const intervalInput = el("input", { class: "fin-input", type: "number", placeholder: "1" });
	intervalInput.value = editing ? (editing.frequency_interval || 1) : 1;
	form.appendChild(formRow("Frequency Interval", intervalInput));

	const dueDateInput = el("input", { class: "fin-input", type: "date" });
	if (editing && editing.next_due_date) {
		dueDateInput.value = editing.next_due_date.slice(0, 10);
	}
	form.appendChild(formRow("Next Due Date", dueDateInput));

	const catSelect = el("select", { class: "fin-select" });
	catSelect.appendChild(el("option", { value: "" }, "-- None --"));
	for (const cat of state.getState().categories) {
		const opt = el("option", { value: cat }, cat);
		if (editing && editing.category === cat) opt.selected = true;
		catSelect.appendChild(opt);
	}
	form.appendChild(formRow("Category", catSelect));

	const accountSelect = el("select", { class: "fin-select" });
	accountSelect.appendChild(el("option", { value: "" }, "-- None --"));
	for (const acct of state.getState().accounts.values()) {
		const opt = el("option", { value: acct.id }, acct.name);
		if (editing && editing.account_id === acct.id) opt.selected = true;
		accountSelect.appendChild(opt);
	}
	form.appendChild(formRow("Account", accountSelect));

	const payeeInput = el("input", { class: "fin-input", type: "text", placeholder: "Payee (optional)" });
	if (editing) payeeInput.value = editing.payee_id || "";
	form.appendChild(formRow("Payee", payeeInput));

	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes (optional)" });
	if (editing) notesInput.value = editing.notes || "";
	form.appendChild(formRow("Notes", notesInput));

	const autoCreateCb = el("input", { type: "checkbox" });
	if (editing && editing.auto_create_transaction) autoCreateCb.checked = true;
	form.appendChild(el("div", { class: "fin-form-row horizontal" },
		autoCreateCb,
		el("label", {}, "Auto-create transaction"),
	));

	const iconInput = el("input", { class: "fin-input", type: "text", placeholder: "Icon text" });
	if (editing) iconInput.value = editing.icon || "";
	form.appendChild(formRow("Icon", iconInput));

	const colorInput = el("input", { class: "fin-input", type: "color" });
	colorInput.value = editing?.color || "#22c55e";
	form.appendChild(formRow("Color", colorInput));

	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			const payload = {
				name: nameInput.value.trim(),
				amount: displayToCents(amountInput.value),
				currency: currInput.value.trim() || "RON",
				frequency: freqSelect.value,
				frequency_interval: parseInt(intervalInput.value, 10) || 1,
				next_due_date: dueDateInput.value ? dueDateInput.value + "T00:00:00Z" : "",
				category: catSelect.value,
				account_id: accountSelect.value || undefined,
				payee_id: payeeInput.value.trim() || undefined,
				notes: notesInput.value.trim(),
				auto_create_transaction: autoCreateCb.checked,
				icon: iconInput.value.trim(),
				color: colorInput.value,
			};
			if (!payload.name) {
				showToast("Name is required", "error");
				return;
			}
			if (editing) {
				payload.id = editing.id;
				sendEvent("fin_subscription_edit", payload);
			} else {
				sendEvent("fin_subscription_create", payload);
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
	return el("div", { class: "fin-form-row" }, el("label", {}, label), input);
}
