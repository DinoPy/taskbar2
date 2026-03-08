import { sendEvent, showToast, state, utils } from "./financeWindow.js";

const { el, formatCurrency, displayToCents, centsToDisplay } = utils;

let unsubs = [];
let container = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
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
	unsubs.push(state.on("budget", () => renderContent()));
	unsubs.push(state.on("categories", () => renderContent()));

	fetchBudget();
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_budget_data" || event === "fin_budget_updated") {
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
// Helpers
// =========================================

function fetchBudget() {
	sendEvent("fin_budget_fetch", { year: currentYear, month: currentMonth });
}

function prevMonth() {
	currentMonth--;
	if (currentMonth < 1) { currentMonth = 12; currentYear--; }
	fetchBudget();
}

function nextMonth() {
	currentMonth++;
	if (currentMonth > 12) { currentMonth = 1; currentYear++; }
	fetchBudget();
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	// Header
	container.appendChild(el("div", { class: "fin-section-header" },
		el("h2", {}, "Budgets"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				sendEvent("fin_budget_copy_previous", { year: currentYear, month: currentMonth, last_modified_at: Date.now() });
			} }, "Copy from Previous Month"),
		),
	));

	// Month picker
	const picker = el("div", { class: "fin-flex-row fin-gap-sm", style: { marginBottom: "var(--spacing-md)", justifyContent: "center" } },
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: prevMonth }, "\u25C0"),
		el("span", { style: { fontWeight: "var(--font-weight-semibold)", minWidth: "160px", textAlign: "center" } },
			MONTH_NAMES[currentMonth - 1] + " " + currentYear),
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: nextMonth }, "\u25B6"),
	);
	container.appendChild(picker);

	const s = state.getState();
	const budget = s.budget;
	const cats = s.budgetCategories;

	if (!budget) {
		container.appendChild(el("div", { class: "fin-empty-state" },
			el("div", { class: "fin-flex-col", style: { alignItems: "center", gap: "var(--spacing-sm)" } },
				el("span", {}, "No budget for this month."),
				el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
					sendEvent("fin_budget_set", { year: currentYear, month: currentMonth, last_modified_at: Date.now() });
				} }, "Create Budget"),
			),
		));
		return;
	}

	// Budget table
	const table = el("table", { class: "fin-table" });
	const thead = el("thead", {},
		el("tr", {},
			el("th", {}, "Category"),
			el("th", { class: "fin-col-right" }, "Budgeted"),
			el("th", { class: "fin-col-right" }, "Actual"),
			el("th", { class: "fin-col-right" }, "Remaining"),
			el("th", {}, "Progress"),
			el("th", { class: "fin-col-center" }, "Rollover"),
			el("th", {}, ""),
		),
	);
	table.appendChild(thead);

	const tbody = el("tbody", {});
	for (const cat of cats) {
		tbody.appendChild(buildBudgetRow(cat));
	}
	table.appendChild(tbody);
	container.appendChild(table);

	// Add category row
	container.appendChild(buildAddCategoryRow(cats));
}

// =========================================
// Budget row
// =========================================

function buildBudgetRow(cat) {
	const budgeted = Number(cat.budgeted_amount || 0);
	const actual = Number(cat.actual_amount || 0);
	const rollover = Number(cat.rollover_amount || 0);
	const remaining = budgeted + rollover - actual;
	const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
	const progressClass = pct > 100 ? "danger" : pct >= 80 ? "warning" : "";

	const budgetedCell = el("td", { class: "fin-col-right fin-text-mono" });
	budgetedCell.style.cursor = "pointer";

	const budgetedText = el("span", {}, centsToDisplay(budgeted));
	budgetedCell.appendChild(budgetedText);

	budgetedCell.addEventListener("click", () => {
		budgetedCell.innerHTML = "";
		const inp = el("input", { class: "fin-input", type: "text", style: { width: "90px", textAlign: "right" } });
		inp.value = centsToDisplay(budgeted);
		budgetedCell.appendChild(inp);
		inp.focus();
		inp.select();
		const save = () => {
			sendEvent("fin_budget_category_set", {
				budget_id: state.getState().budget?.id,
				category: cat.category,
				budgeted_amount: displayToCents(inp.value),
				rollover: !!cat.rollover,
				rollover_amount: Number(cat.rollover_amount || 0),
			});
		};
		inp.addEventListener("blur", save);
		inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
	});

	const rolloverCb = el("input", { type: "checkbox" });
	rolloverCb.checked = !!cat.rollover;
	rolloverCb.addEventListener("change", () => {
		sendEvent("fin_budget_category_set", {
			budget_id: state.getState().budget?.id,
			category: cat.category,
			budgeted_amount: budgeted,
			rollover: rolloverCb.checked,
			rollover_amount: Number(cat.rollover_amount || 0),
		});
	});

	const remainingClass = remaining >= 0 ? "fin-amount-positive" : "fin-amount-negative";

	return el("tr", {},
		el("td", {}, cat.category || ""),
		budgetedCell,
		el("td", { class: "fin-col-right fin-text-mono" }, centsToDisplay(actual)),
		el("td", { class: "fin-col-right fin-text-mono " + remainingClass }, centsToDisplay(remaining)),
		el("td", { style: { minWidth: "100px" } },
			el("div", { class: "fin-progress-bar " + progressClass },
				el("div", { class: "fin-progress-fill", style: { width: Math.min(pct, 100) + "%" } }),
			),
		),
		el("td", { class: "fin-col-center" }, rolloverCb),
		el("td", {},
			el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: (e) => {
				handleDeleteCat(cat, e.currentTarget);
			} }, "Del"),
		),
	);
}

// =========================================
// Delete category
// =========================================

function handleDeleteCat(cat, btnEl) {
	if (btnEl.dataset.confirming) {
		sendEvent("fin_budget_category_delete", { id: cat.id, budget_id: state.getState().budget?.id });
		return;
	}
	btnEl.dataset.confirming = "true";
	btnEl.textContent = "Sure?";
	setTimeout(() => {
		if (btnEl.isConnected) {
			delete btnEl.dataset.confirming;
			btnEl.textContent = "Del";
		}
	}, 3000);
}

// =========================================
// Add category row
// =========================================

function buildAddCategoryRow(existingCats) {
	const existingNames = new Set(existingCats.map(c => c.category));
	const available = state.getState().categories.filter(c => !existingNames.has(c));

	const wrapper = el("div", { class: "fin-flex-row fin-gap-sm", style: { marginTop: "var(--spacing-md)" } });

	const catSelect = el("select", { class: "fin-select" });
	catSelect.appendChild(el("option", { value: "" }, "-- Select category --"));
	for (const cat of available) {
		catSelect.appendChild(el("option", { value: cat }, cat));
	}

	const amtInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00", style: { width: "100px" } });

	wrapper.appendChild(catSelect);
	wrapper.appendChild(amtInput);
	wrapper.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
		const category = catSelect.value;
		if (!category) { showToast("Select a category", "error"); return; }
		sendEvent("fin_budget_category_set", {
			budget_id: state.getState().budget?.id,
			category,
			budgeted_amount: displayToCents(amtInput.value),
			rollover: false,
			rollover_amount: 0,
		});
	} }, "Add"));

	return wrapper;
}
