import { beginFinanceWrite, sendEvent, showToast, state, utils } from "./financeWindow.js";
import { resolveSingleReference } from "./financeReferenceState.js";

const { el, formatCurrency, displayToCents, centsToDisplay, formatDateShort, relativeDays } = utils;

let unsubs = [];
let container = null;
let editingId = null;
let formVisible = false;
let summaryData = null;
let collapsedGroups = new Set();
let formDraft = null;

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
	unsubs.push(state.on("payees", () => { if (formVisible) renderContent(); }));

	sendEvent("fin_subscriptions_fetch", {});
	sendEvent("fin_subscriptions_summary", {});
	sendEvent("fin_payees_fetch", {});
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
	summaryData = null;
	collapsedGroups.clear();
	formDraft = null;
}

function createSubscriptionDraft(editing) {
	return {
		name: editing?.name || "",
		amount: editing ? centsToDisplay(Number(editing.amount || 0)) : "",
		currency: editing?.currency || "RON",
		frequency: editing?.frequency || "monthly",
		frequency_interval: editing?.frequency_interval || 1,
		next_due_date: editing?.next_due_date ? String(editing.next_due_date).slice(0, 10) : "",
		category: editing?.category || "",
		account_id: editing?.account_id || "",
		payee_id: editing?.payee_id || "",
		notes: editing?.notes || "",
		auto_create_transaction: !!editing?.auto_create_transaction,
		icon: editing?.icon || "",
		color: editing?.color || "#22c55e",
	};
}

function ensureFormDraft(editing) {
	if (!formDraft) {
		formDraft = createSubscriptionDraft(editing);
	}
	return formDraft;
}

function openForm(sub = null) {
	editingId = sub?.id || null;
	formDraft = createSubscriptionDraft(sub);
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

	if (formVisible && editingId && !state.getState().subscriptions.has(editingId)) {
		showToast("This item no longer exists. The list has been refreshed.", "info");
		closeForm();
		return;
	}

	container.innerHTML = "";

	// Header
	const header = el("div", { class: "fin-section-header" },
		el("h2", {}, "Subscriptions"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				if (formVisible && !editingId) closeForm();
				else openForm(null);
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
			beginFinanceWrite("fin_subscription_confirm", {
				entityKind: "subscription",
				entityId: sub.id,
				refreshKinds: ["subscriptions", "accounts", "customViews"],
				onSuccess: () => {
					showToast("Payment confirmed", "info");
				},
			});
			sendEvent("fin_subscription_confirm", { id: sub.id, last_modified_at: sub.last_modified_at || Date.now() });
		} }, "Confirm Payment"));
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
			beginFinanceWrite("fin_subscription_pause", {
				entityKind: "subscription",
				entityId: sub.id,
				refreshKinds: ["subscriptions"],
				onSuccess: () => {
					showToast("Subscription paused", "info");
				},
			});
			sendEvent("fin_subscription_pause", { id: sub.id, last_modified_at: sub.last_modified_at || Date.now() });
		} }, "Pause"));
	}
	if (status === "paused") {
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
			beginFinanceWrite("fin_subscription_resume", {
				entityKind: "subscription",
				entityId: sub.id,
				refreshKinds: ["subscriptions"],
				onSuccess: () => {
					showToast("Subscription resumed", "info");
				},
			});
			sendEvent("fin_subscription_resume", { id: sub.id, last_modified_at: sub.last_modified_at || Date.now() });
		} }, "Resume"));
	}
	if (status !== "cancelled") {
		actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
			beginFinanceWrite("fin_subscription_cancel", {
				entityKind: "subscription",
				entityId: sub.id,
				refreshKinds: ["subscriptions"],
				onSuccess: () => {
					showToast("Subscription cancelled", "info");
				},
			});
			sendEvent("fin_subscription_cancel", { id: sub.id, last_modified_at: sub.last_modified_at || Date.now() });
		} }, "Cancel"));
	}

	actions.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
		openForm(sub);
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
		beginFinanceWrite("fin_subscription_delete", {
			entityKind: "subscription",
			entityId: sub.id,
			refreshKinds: ["subscriptions"],
			onSuccess: () => {
				showToast("Subscription deleted", "info");
			},
		});
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
	const draft = ensureFormDraft(editing);
	const activeAccounts = [...state.getState().accounts.values()]
		.filter(account => !account.is_archived)
		.sort((a, b) => (a.position || 0) - (b.position || 0));
	const activeAccountMap = new Map(activeAccounts.map(account => [account.id, account]));
	const accountRef = resolveSingleReference(draft.account_id, activeAccountMap);
	const payeeRef = resolveSingleReference(draft.payee_id, state.getState().payees);
	const panel = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	panel.appendChild(el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } },
		editing ? "Edit Subscription" : "New Subscription"));

	const form = el("div", { class: "fin-form" });

	const nameInput = el("input", { class: "fin-input", type: "text", placeholder: "Subscription name" });
	nameInput.value = draft.name;
	nameInput.addEventListener("input", () => {
		draft.name = nameInput.value;
	});
	form.appendChild(formRow("Name", nameInput));

	const amountInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00" });
	amountInput.value = draft.amount;
	amountInput.addEventListener("input", () => {
		draft.amount = amountInput.value;
	});
	form.appendChild(formRow("Amount", amountInput));

	const currInput = el("input", { class: "fin-input", type: "text", placeholder: "RON" });
	currInput.value = draft.currency;
	currInput.addEventListener("input", () => {
		draft.currency = currInput.value;
	});
	form.appendChild(formRow("Currency", currInput));

	const freqSelect = el("select", { class: "fin-select" });
	for (const f of ["weekly", "monthly", "yearly", "custom"]) {
		const opt = el("option", { value: f }, f.charAt(0).toUpperCase() + f.slice(1));
		if (draft.frequency === f) opt.selected = true;
		freqSelect.appendChild(opt);
	}
	freqSelect.addEventListener("change", () => {
		draft.frequency = freqSelect.value;
	});
	form.appendChild(formRow("Frequency", freqSelect));

	const intervalInput = el("input", { class: "fin-input", type: "number", placeholder: "1" });
	intervalInput.value = draft.frequency_interval;
	intervalInput.addEventListener("input", () => {
		draft.frequency_interval = parseInt(intervalInput.value, 10) || 1;
	});
	form.appendChild(formRow("Frequency Interval", intervalInput));

	const dueDateInput = el("input", { class: "fin-input", type: "date" });
	dueDateInput.value = draft.next_due_date;
	dueDateInput.addEventListener("change", () => {
		draft.next_due_date = dueDateInput.value;
	});
	form.appendChild(formRow("Next Due Date", dueDateInput));

	const catSelect = el("select", { class: "fin-select" });
	catSelect.appendChild(el("option", { value: "" }, "-- None --"));
	for (const cat of state.getState().categories) {
		const opt = el("option", { value: cat }, cat);
		if (draft.category === cat) opt.selected = true;
		catSelect.appendChild(opt);
	}
	catSelect.addEventListener("change", () => {
		draft.category = catSelect.value;
	});
	form.appendChild(formRow("Category", catSelect));

	const accountSelect = el("select", { class: "fin-select" });
	accountSelect.appendChild(el("option", { value: "" }, "-- None --"));
	if (accountRef.isStale && draft.account_id) {
		accountSelect.appendChild(el("option", { value: draft.account_id, selected: true }, "Unavailable account (stale)"));
	}
	for (const acct of activeAccounts) {
		const opt = el("option", { value: acct.id }, acct.name);
		if (draft.account_id === acct.id) opt.selected = true;
		accountSelect.appendChild(opt);
	}
	accountSelect.addEventListener("change", () => {
		draft.account_id = accountSelect.value;
		if (container) renderContent();
	});
	form.appendChild(formRow("Account", accountSelect));
	if (accountRef.isStale) {
		form.appendChild(formHint("The selected account is no longer available. Choose another account or clear the field.", "error"));
	}

	const payeeSelect = el("select", { class: "fin-select" });
	payeeSelect.appendChild(el("option", { value: "" }, "-- None --"));
	if (payeeRef.isStale && draft.payee_id) {
		payeeSelect.appendChild(el("option", { value: draft.payee_id, selected: true }, "Unavailable payee (stale)"));
	}
	for (const p of state.getState().payees.values()) {
		const opt = el("option", { value: p.id }, p.name);
		if (draft.payee_id === p.id) opt.selected = true;
		payeeSelect.appendChild(opt);
	}
	payeeSelect.addEventListener("change", () => {
		draft.payee_id = payeeSelect.value;
		if (container) renderContent();
	});
	form.appendChild(formRow("Payee", payeeSelect));
	if (payeeRef.isStale) {
		form.appendChild(formHint("The selected payee is no longer available. Choose another payee or clear the field.", "error"));
	}

	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes (optional)" });
	notesInput.value = draft.notes;
	notesInput.addEventListener("input", () => {
		draft.notes = notesInput.value;
	});
	form.appendChild(formRow("Notes", notesInput));

	const autoCreateCb = el("input", { type: "checkbox" });
	autoCreateCb.checked = draft.auto_create_transaction;
	autoCreateCb.addEventListener("change", () => {
		draft.auto_create_transaction = autoCreateCb.checked;
	});
	form.appendChild(el("div", { class: "fin-form-row horizontal" },
		autoCreateCb,
		el("label", {}, "Auto-create transaction"),
	));

	const iconInput = el("input", { class: "fin-input", type: "text", placeholder: "Icon text" });
	iconInput.value = draft.icon;
	iconInput.addEventListener("input", () => {
		draft.icon = iconInput.value;
	});
	form.appendChild(formRow("Icon", iconInput));

	const colorInput = el("input", { class: "fin-input", type: "color" });
	colorInput.value = draft.color;
	colorInput.addEventListener("input", () => {
		draft.color = colorInput.value;
	});
	form.appendChild(formRow("Color", colorInput));

	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			const currentAccountRef = resolveSingleReference(draft.account_id, activeAccountMap);
			const currentPayeeRef = resolveSingleReference(draft.payee_id, state.getState().payees);
			if (currentAccountRef.isStale) {
				showToast("Choose a valid account or clear the stale account selection.", "error");
				return;
			}
			if (currentPayeeRef.isStale) {
				showToast("Choose a valid payee or clear the stale payee selection.", "error");
				return;
			}
			const payload = {
				name: draft.name.trim(),
				amount: displayToCents(draft.amount),
				currency: draft.currency.trim() || "RON",
				frequency: draft.frequency,
				frequency_interval: draft.frequency_interval || 1,
				next_due_date: draft.next_due_date ? draft.next_due_date + "T00:00:00Z" : "",
				category: draft.category,
				account_id: draft.account_id || null,
				payee_id: draft.payee_id || null,
				notes: draft.notes.trim(),
				auto_create_transaction: draft.auto_create_transaction,
				icon: draft.icon.trim(),
				color: draft.color,
			};
			if (!payload.name) {
				showToast("Name is required", "error");
				return;
			}
			if (editing) {
				beginFinanceWrite("fin_subscription_edit", {
					entityKind: "subscription",
					entityId: editing.id,
					refreshKinds: ["subscriptions", "accounts", "payees"],
					onSuccess: () => {
						showToast("Subscription updated", "info");
						closeForm();
					},
					onNotFound: () => {
						renderContent();
					},
				});
				payload.id = editing.id;
				payload.last_modified_at = editing.last_modified_at || Date.now();
				sendEvent("fin_subscription_edit", payload);
			} else {
				beginFinanceWrite("fin_subscription_create", {
					entityKind: "subscription",
					refreshKinds: ["subscriptions", "accounts", "payees"],
					matches: (eventName, response) => (
						eventName === "fin_subscription_created" &&
						Number(response?.last_modified_at) === Number(payload.last_modified_at) &&
						response?.name === payload.name &&
						Number(response?.amount) === Number(payload.amount) &&
						response?.frequency === payload.frequency &&
						response?.next_due_date === payload.next_due_date
					),
					onSuccess: () => {
						showToast("Subscription created", "info");
						closeForm();
					},
					onNotFound: () => {
						renderContent();
					},
				});
				payload.last_modified_at = Date.now();
				sendEvent("fin_subscription_create", payload);
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
	return el("div", { class: "fin-form-row" }, el("label", {}, label), input);
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
