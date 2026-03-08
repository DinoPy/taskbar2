import { sendEvent, showToast, state, utils } from "./financeWindow.js";

const { el } = utils;

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
	unsubs.push(state.on("categories", () => renderContent()));

	const cats = state.getState().categories;
	if (!cats || cats.length === 0) {
		sendEvent("fin_categories_fetch", {});
	}
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event) {
	if (event === "fin_categories_data" || event === "fin_categories_updated") {
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
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	container.appendChild(el("div", { class: "fin-section-header" }, el("h2", {}, "Categories")));

	const categories = state.getState().categories;

	// List
	if (categories.length === 0) {
		container.appendChild(el("div", { class: "fin-empty-state" }, "No categories defined."));
	} else {
		const list = el("div", { class: "fin-flex-col", style: { gap: "2px", marginBottom: "var(--spacing-md)" } });
		for (const cat of categories) {
			list.appendChild(el("div", {
				class: "fin-flex-row",
				style: {
					justifyContent: "space-between",
					padding: "var(--spacing-xs) var(--spacing-sm)",
					borderBottom: "1px solid var(--color-border-subtle)",
				},
			},
				el("span", {}, cat),
				el("button", { class: "fin-btn fin-btn-sm fin-btn-icon", onClick: () => removeCategory(cat), title: "Remove" }, "\u00D7"),
			));
		}
		container.appendChild(list);
	}

	// Add row
	const input = el("input", { class: "fin-input", type: "text", placeholder: "New category name", style: { flex: "1" } });
	const addBtn = el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
		addCategory(input.value.trim());
	} }, "Add");

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") addCategory(input.value.trim());
	});

	container.appendChild(el("div", { class: "fin-flex-row fin-gap-sm" }, input, addBtn));
}

// =========================================
// Add / Remove
// =========================================

function addCategory(name) {
	if (!name) { showToast("Enter a category name", "error"); return; }
	const categories = [...state.getState().categories];
	if (categories.includes(name)) { showToast("Category already exists", "error"); return; }
	categories.push(name);
	sendUpdate(categories);
}

function removeCategory(name) {
	const categories = state.getState().categories.filter(c => c !== name);
	sendUpdate(categories);
}

function sendUpdate(categories) {
	sendEvent("fin_categories_update", { categories: categories.join(",") });
}
