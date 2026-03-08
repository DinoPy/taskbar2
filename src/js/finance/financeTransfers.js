import { sendEvent, showToast, switchSection, state, utils } from "./financeWindow.js";

const { el, formatCurrency, formatDateShort, displayToCents, centsToDisplay } = utils;

let unsubs = [];
let container = null;

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
	unsubs.push(state.on("transactions", () => renderContent()));
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_transfer_created") {
		showToast("Transfer completed", "info");
		// Refetch accounts to get updated balances
		sendEvent("fin_accounts_fetch", {});
		clearForm();
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
}

// =========================================
// Form values (persist across renders)
// =========================================

let formState = {
	from_account_id: "",
	to_account_id: "",
	amount: "",
	date: new Date().toISOString().slice(0, 16),
	description: "",
	notes: "",
};

function clearForm() {
	formState = {
		from_account_id: "",
		to_account_id: "",
		amount: "",
		date: new Date().toISOString().slice(0, 16),
		description: "",
		notes: "",
	};
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	const s = state.getState();
	const accounts = [...s.accounts.values()].filter(a => !a.is_archived);

	// Header
	container.appendChild(el("div", { class: "fin-section-header" },
		el("h2", {}, "Transfers"),
	));

	// Transfer form card
	container.appendChild(buildTransferForm(accounts));

	// Recent transfers
	container.appendChild(buildRecentTransfers(s));
}

// =========================================
// Transfer form
// =========================================

function buildTransferForm(accounts) {
	const card = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	const form = el("div", { class: "fin-form" });

	// Source and target row
	const transferRow = el("div", { class: "fin-form-row horizontal", style: { alignItems: "flex-end", flexWrap: "wrap" } });

	// Source account
	const fromGroup = el("div", { class: "fin-form-row", style: { flex: "1", minWidth: "180px" } });
	fromGroup.appendChild(el("label", {}, "From Account"));
	const fromSelect = el("select", { class: "fin-select" });
	fromSelect.appendChild(el("option", { value: "" }, "Select source..."));
	for (const a of accounts) {
		const opt = el("option", { value: a.id },
			a.name + " (" + formatCurrency(Number(a.computed_balance || 0), a.currency || "RON") + ")");
		if (formState.from_account_id === a.id) opt.selected = true;
		fromSelect.appendChild(opt);
	}
	fromSelect.addEventListener("change", () => { formState.from_account_id = fromSelect.value; });
	fromGroup.appendChild(fromSelect);
	transferRow.appendChild(fromGroup);

	// Arrow
	transferRow.appendChild(el("span", { style: { fontSize: "var(--font-size-xl)", padding: "0 var(--spacing-sm)", color: "var(--color-text-tertiary)" } }, "\u2192"));

	// Target account
	const toGroup = el("div", { class: "fin-form-row", style: { flex: "1", minWidth: "180px" } });
	toGroup.appendChild(el("label", {}, "To Account"));
	const toSelect = el("select", { class: "fin-select" });
	toSelect.appendChild(el("option", { value: "" }, "Select target..."));
	for (const a of accounts) {
		const opt = el("option", { value: a.id },
			a.name + " (" + formatCurrency(Number(a.computed_balance || 0), a.currency || "RON") + ")");
		if (formState.to_account_id === a.id) opt.selected = true;
		toSelect.appendChild(opt);
	}
	toSelect.addEventListener("change", () => { formState.to_account_id = toSelect.value; });
	toGroup.appendChild(toSelect);
	transferRow.appendChild(toGroup);

	form.appendChild(transferRow);

	// Amount
	const amtInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00" });
	amtInput.value = formState.amount;
	amtInput.addEventListener("input", () => { formState.amount = amtInput.value; });
	form.appendChild(formRow("Amount", amtInput));

	// Date
	const dateInput = el("input", { class: "fin-input", type: "datetime-local" });
	dateInput.value = formState.date;
	dateInput.addEventListener("change", () => { formState.date = dateInput.value; });
	form.appendChild(formRow("Date", dateInput));

	// Description
	const descInput = el("input", { class: "fin-input", type: "text", placeholder: "Transfer description" });
	descInput.value = formState.description;
	descInput.addEventListener("input", () => { formState.description = descInput.value; });
	form.appendChild(formRow("Description", descInput));

	// Notes
	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes (optional)" });
	notesInput.value = formState.notes;
	notesInput.addEventListener("input", () => { formState.notes = notesInput.value; });
	form.appendChild(formRow("Notes", notesInput));

	// Submit
	form.appendChild(el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			if (!formState.from_account_id) {
				showToast("Select source account", "error");
				return;
			}
			if (!formState.to_account_id) {
				showToast("Select target account", "error");
				return;
			}
			if (formState.from_account_id === formState.to_account_id) {
				showToast("Source and target must be different", "error");
				return;
			}
			const amount = displayToCents(formState.amount);
			if (amount <= 0) {
				showToast("Amount must be positive", "error");
				return;
			}

			sendEvent("fin_transfer_create", {
				from_account_id: formState.from_account_id,
				to_account_id: formState.to_account_id,
				amount,
				date: formState.date ? new Date(formState.date).toISOString() : new Date().toISOString(),
				description: formState.description.trim(),
				notes: formState.notes.trim(),
				last_modified_at: Date.now(),
			});
		} }, "Transfer"),
		el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
			clearForm();
			renderContent();
		} }, "Clear"),
	));

	card.appendChild(form);
	return card;
}

function formRow(label, input) {
	return el("div", { class: "fin-form-row" },
		el("label", {}, label),
		input,
	);
}

// =========================================
// Recent transfers
// =========================================

function buildRecentTransfers(s) {
	const card = el("div", { class: "fin-card" });
	card.appendChild(el("h3", { style: { margin: "0 0 var(--spacing-sm) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } }, "Recent Transfers"));

	const transfers = s.transactions
		.filter(tx => tx.transaction_type === "transfer")
		.slice(0, 10);

	if (transfers.length === 0) {
		card.appendChild(el("div", { class: "fin-empty-state" }, "No transfers yet"));
		return card;
	}

	const table = el("table", { class: "fin-table" });
	table.appendChild(el("thead", {},
		el("tr", {},
			el("th", {}, "Date"),
			el("th", {}, "Description"),
			el("th", {}, "Account"),
			el("th", { class: "fin-col-right" }, "Amount"),
		),
	));

	const tbody = el("tbody", {});
	for (const tx of transfers) {
		const amt = Number(tx.amount || 0);
		const account = s.accounts.get(tx.account_id);
		tbody.appendChild(el("tr", {},
			el("td", {}, tx.date ? formatDateShort(tx.date) : ""),
			el("td", {}, tx.description || "Transfer"),
			el("td", {}, account ? account.name : ""),
			el("td", { class: "fin-col-right fin-text-mono fin-text-accent" }, centsToDisplay(Math.abs(amt))),
		));
	}
	table.appendChild(tbody);
	card.appendChild(table);
	return card;
}
