import { sendEvent, showToast, state, utils } from "./financeWindow.js";

const { el } = utils;

let unsubs = [];
let container = null;
let formVisible = false;
let editingId = null;
let searchQuery = "";
let searchResults = null;
let debounceTimer = null;

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;
	unsubs.push(state.on("payees", () => renderContent()));

	sendEvent("fin_payees_fetch", {});
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_payee_results") {
		searchResults = Array.isArray(data) ? data : (data.payees || []);
		renderContent();
	}
	if (event === "fin_payee_created") {
		showToast("Payee created", "info");
		formVisible = false;
		renderContent();
	}
	if (event === "fin_payee_updated") {
		showToast("Payee updated", "info");
		editingId = null;
		renderContent();
	}
	if (event === "fin_payee_deleted") {
		showToast("Payee deleted", "info");
	}
}

// =========================================
// Destroy
// =========================================

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	formVisible = false;
	editingId = null;
	searchQuery = "";
	searchResults = null;
	if (debounceTimer) clearTimeout(debounceTimer);
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	// Header
	container.appendChild(el("div", { class: "fin-section-header" },
		el("h2", {}, "Payees"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				formVisible = !formVisible;
				editingId = null;
				renderContent();
			} }, formVisible && !editingId ? "Cancel" : "+ Add Payee"),
		),
	));

	// Search
	const searchInput = el("input", { class: "fin-input", type: "text", placeholder: "Search payees...", style: { marginBottom: "var(--spacing-md)", width: "100%" } });
	searchInput.value = searchQuery;
	searchInput.addEventListener("input", (e) => {
		searchQuery = e.target.value;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (searchQuery.trim()) {
			debounceTimer = setTimeout(() => {
				sendEvent("fin_payee_search", { search_query: searchQuery.trim(), limit: 20 });
			}, 300);
		} else {
			searchResults = null;
			renderContent();
		}
	});
	container.appendChild(searchInput);

	// Add form
	if (formVisible && !editingId) {
		container.appendChild(buildAddForm());
	}

	// Payee list
	const payees = searchResults || [...state.getState().payees.values()];
	if (payees.length === 0) {
		container.appendChild(el("div", { class: "fin-empty-state" },
			searchQuery ? "No payees match your search." : "No payees yet."));
		return;
	}

	const table = el("table", { class: "fin-table" });
	table.appendChild(el("thead", {}, el("tr", {},
		el("th", {}, "Name"),
		el("th", {}, "Notes"),
		el("th", {}, ""),
	)));

	const tbody = el("tbody", {});
	for (const payee of payees) {
		if (editingId === payee.id) {
			tbody.appendChild(buildEditRow(payee));
		} else {
			tbody.appendChild(buildPayeeRow(payee));
		}
	}
	table.appendChild(tbody);
	container.appendChild(table);
}

// =========================================
// Payee row
// =========================================

function buildPayeeRow(payee) {
	const notes = payee.notes || "";
	const truncated = notes.length > 50 ? notes.slice(0, 50) + "..." : notes;

	return el("tr", {},
		el("td", { style: { fontWeight: "var(--font-weight-medium)" } }, payee.name || ""),
		el("td", { class: "fin-text-muted" }, truncated),
		el("td", {},
			el("div", { class: "fin-flex-row fin-gap-sm", style: { justifyContent: "flex-end" } },
				el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
					editingId = payee.id;
					renderContent();
				} }, "Edit"),
				el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: (e) => {
					handleDelete(payee, e.currentTarget);
				} }, "Delete"),
			),
		),
	);
}

// =========================================
// Edit row
// =========================================

function buildEditRow(payee) {
	const nameInput = el("input", { class: "fin-input", type: "text" });
	nameInput.value = payee.name || "";
	const notesInput = el("textarea", { class: "fin-textarea", style: { minHeight: "40px" } });
	notesInput.value = payee.notes || "";

	const tr = el("tr", {},
		el("td", {}, nameInput),
		el("td", {}, notesInput),
		el("td", {},
			el("div", { class: "fin-flex-row fin-gap-sm", style: { justifyContent: "flex-end" } },
				el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
					const name = nameInput.value.trim();
					if (!name) { showToast("Name is required", "error"); return; }
					sendEvent("fin_payee_edit", { id: payee.id, name, notes: notesInput.value.trim() });
				} }, "Save"),
				el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
					editingId = null;
					renderContent();
				} }, "Cancel"),
			),
		),
	);
	return tr;
}

// =========================================
// Add form
// =========================================

function buildAddForm() {
	const nameInput = el("input", { class: "fin-input", type: "text", placeholder: "Payee name" });
	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes (optional)" });

	return el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } },
		el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } }, "New Payee"),
		el("div", { class: "fin-form" },
			formRow("Name", nameInput),
			formRow("Notes", notesInput),
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
					const name = nameInput.value.trim();
					if (!name) { showToast("Name is required", "error"); return; }
					sendEvent("fin_payee_create", { name, notes: notesInput.value.trim() });
				} }, "Create"),
				el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
					formVisible = false;
					renderContent();
				} }, "Cancel"),
			),
		),
	);
}

// =========================================
// Delete with inline confirmation
// =========================================

function handleDelete(payee, btnEl) {
	if (btnEl.dataset.confirming) {
		sendEvent("fin_payee_delete", { id: payee.id });
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

function formRow(label, input) {
	return el("div", { class: "fin-form-row" }, el("label", {}, label), input);
}
