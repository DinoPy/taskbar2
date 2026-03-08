import { sendEvent, state, utils } from "./financeWindow.js";

const { el, formatCurrency, centsToDisplay, formatDateISO, buildBarChart, buildLineChart, buildHorizontalBarChart } = utils;

let unsubs = [];
let container = null;
let activeTab = "spending_by_category";
let dateFrom = "";
let dateTo = "";

const TABS = [
	{ id: "spending_by_category", label: "Spending by Category", event: "fin_report_spending_by_category" },
	{ id: "income_vs_expense", label: "Income vs Expense", event: "fin_report_income_vs_expense" },
	{ id: "net_worth", label: "Net Worth", event: "fin_report_net_worth" },
	{ id: "spending_trends", label: "Spending Trends", event: "fin_report_spending_trends" },
	{ id: "top_payees", label: "Top Payees", event: "fin_report_top_payees" },
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

	// Default date range: current year start to now
	const now = new Date();
	dateFrom = now.getFullYear() + "-01-01";
	dateTo = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

	unsubs.push(state.on("reports", () => renderReportContent()));

	renderContent();
	fetchActiveReport();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event) {
	if (event.startsWith("fin_report_")) {
		renderReportContent();
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
// Fetch
// =========================================

function fetchActiveReport() {
	const tab = TABS.find(t => t.id === activeTab);
	if (!tab) return;
	const payload = { date_from: dateFrom + "T00:00:00Z", date_to: dateTo + "T23:59:59Z" };
	if (activeTab === "top_payees") payload.limit = 10;
	sendEvent(tab.event, payload);
}

// =========================================
// Render shell
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	container.appendChild(el("div", { class: "fin-section-header" }, el("h2", {}, "Reports")));

	// Date range picker
	const fromInput = el("input", { class: "fin-input", type: "date" });
	fromInput.value = dateFrom;
	const toInput = el("input", { class: "fin-input", type: "date" });
	toInput.value = dateTo;

	const applyBtn = el("button", { class: "fin-btn fin-btn-sm fin-btn-primary", onClick: () => {
		dateFrom = fromInput.value;
		dateTo = toInput.value;
		fetchActiveReport();
	} }, "Apply");

	container.appendChild(el("div", { class: "fin-filter-bar" },
		el("label", { class: "fin-text-sm" }, "From"),
		fromInput,
		el("label", { class: "fin-text-sm" }, "To"),
		toInput,
		applyBtn,
	));

	// Tabs
	const tabBar = el("div", { class: "fin-tabs" });
	for (const tab of TABS) {
		tabBar.appendChild(el("div", {
			class: "fin-tab" + (activeTab === tab.id ? " active" : ""),
			onClick: () => {
				activeTab = tab.id;
				renderContent();
				fetchActiveReport();
			},
		}, tab.label));
	}
	container.appendChild(tabBar);

	// Report content area
	const reportArea = el("div", { id: "fin-report-area", style: { marginTop: "var(--spacing-md)" } });
	container.appendChild(reportArea);

	renderReportContent();
}

// =========================================
// Render report content
// =========================================

function renderReportContent() {
	const area = container?.querySelector("#fin-report-area");
	if (!area) return;
	area.innerHTML = "";

	const reports = state.getState().reports;
	const tab = TABS.find(t => t.id === activeTab);
	if (!tab) return;

	const data = reports[tab.event];
	if (!data) {
		area.appendChild(el("div", { class: "fin-empty-state" }, "Loading..."));
		return;
	}

	switch (activeTab) {
		case "spending_by_category": renderSpendingByCategory(area, data); break;
		case "income_vs_expense": renderIncomeVsExpense(area, data); break;
		case "net_worth": renderNetWorth(area, data); break;
		case "spending_trends": renderSpendingTrends(area, data); break;
		case "top_payees": renderTopPayees(area, data); break;
	}
}

// =========================================
// Tab 1: Spending by Category
// =========================================

function renderSpendingByCategory(area, data) {
	const items = Array.isArray(data) ? data : [];
	if (items.length === 0) {
		area.appendChild(el("div", { class: "fin-empty-state" }, "No spending data for this period."));
		return;
	}

	const chartData = items.map(d => ({
		label: d.category || "Uncategorized",
		value: Math.abs(Number(d.total_amount || 0)) / 100,
	}));

	const chartDiv = el("div", { class: "fin-chart-container" });
	chartDiv.innerHTML = buildBarChart({ data: chartData, width: 500, height: 280 });
	area.appendChild(chartDiv);

	const table = el("table", { class: "fin-table" });
	table.appendChild(el("thead", {}, el("tr", {},
		el("th", {}, "Category"),
		el("th", { class: "fin-col-right" }, "Total Amount"),
		el("th", { class: "fin-col-right" }, "Transactions"),
	)));
	const tbody = el("tbody", {});
	for (const item of items) {
		tbody.appendChild(el("tr", {},
			el("td", {}, item.category || "Uncategorized"),
			el("td", { class: "fin-col-right fin-text-mono" }, centsToDisplay(Math.abs(Number(item.total_amount || 0)))),
			el("td", { class: "fin-col-right" }, String(item.transaction_count || 0)),
		));
	}
	table.appendChild(tbody);
	area.appendChild(table);
}

// =========================================
// Tab 2: Income vs Expense
// =========================================

function renderIncomeVsExpense(area, data) {
	const income = Number(data.total_income || 0);
	const expense = Math.abs(Number(data.total_expense || 0));
	const net = income - expense;

	const chartData = [
		{ label: "Income", value: income / 100 },
		{ label: "Expense", value: expense / 100 },
	];
	const chartDiv = el("div", { class: "fin-chart-container" });
	chartDiv.innerHTML = buildBarChart({
		data: chartData,
		width: 300,
		height: 250,
		colorFn: (d) => d.label === "Income" ? "oklch(0.72 0.17 165)" : "oklch(0.65 0.20 25)",
	});
	area.appendChild(chartDiv);

	const netClass = net >= 0 ? "fin-amount-positive" : "fin-amount-negative";
	area.appendChild(el("div", { class: "fin-card", style: { marginTop: "var(--spacing-md)" } },
		el("div", { class: "fin-flex-row", style: { justifyContent: "space-around" } },
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Total Income"),
				el("span", { class: "fin-text-mono fin-amount-positive" }, centsToDisplay(income)),
			),
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Total Expense"),
				el("span", { class: "fin-text-mono fin-amount-negative" }, centsToDisplay(expense)),
			),
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Net"),
				el("span", { class: "fin-text-mono " + netClass }, centsToDisplay(net)),
			),
		),
	));
}

// =========================================
// Tab 3: Net Worth
// =========================================

function renderNetWorth(area, data) {
	const history = Array.isArray(data.history) ? data.history : [];
	const assets = Number(data.total_assets || 0);
	const liabilities = Number(data.total_liabilities || 0);
	const netWorth = Number(data.net_worth || (assets - liabilities));

	if (history.length > 0) {
		const chartData = history.map(h => ({
			label: (h.snapshot_date || "").slice(0, 10),
			value: Number(h.net_worth || 0) / 100,
		}));
		const chartDiv = el("div", { class: "fin-chart-container" });
		chartDiv.innerHTML = buildLineChart({ data: chartData, width: 500, height: 280, xKey: "label", yKey: "value" });
		area.appendChild(chartDiv);
	}

	const nwClass = netWorth >= 0 ? "fin-amount-positive" : "fin-amount-negative";
	area.appendChild(el("div", { class: "fin-card", style: { marginTop: "var(--spacing-md)" } },
		el("div", { class: "fin-flex-row", style: { justifyContent: "space-around" } },
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Total Assets"),
				el("span", { class: "fin-text-mono fin-amount-positive" }, centsToDisplay(assets)),
			),
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Total Liabilities"),
				el("span", { class: "fin-text-mono fin-amount-negative" }, centsToDisplay(liabilities)),
			),
			el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
				el("span", { class: "fin-text-sm fin-text-muted" }, "Net Worth"),
				el("span", { class: "fin-text-mono " + nwClass }, centsToDisplay(netWorth)),
			),
		),
	));

	// Account breakdown from latest snapshot
	if (history.length > 0) {
		const latest = history[history.length - 1];
		const breakdown = Array.isArray(latest.breakdown) ? latest.breakdown : [];
		if (breakdown.length > 0) {
			const table = el("table", { class: "fin-table", style: { marginTop: "var(--spacing-md)" } });
			table.appendChild(el("thead", {}, el("tr", {},
				el("th", {}, "Account"),
				el("th", {}, "Type"),
				el("th", { class: "fin-col-right" }, "Balance"),
			)));
			const tbody = el("tbody", {});
			for (const acct of breakdown) {
				const bal = Number(acct.balance || 0);
				const cls = bal >= 0 ? "fin-amount-positive" : "fin-amount-negative";
				tbody.appendChild(el("tr", {},
					el("td", {}, acct.account_name || ""),
					el("td", {}, acct.account_type || ""),
					el("td", { class: "fin-col-right fin-text-mono " + cls }, centsToDisplay(bal)),
				));
			}
			table.appendChild(tbody);
			area.appendChild(table);
		}
	}
}

// =========================================
// Tab 4: Spending Trends
// =========================================

function renderSpendingTrends(area, data) {
	const items = Array.isArray(data) ? data : [];
	if (items.length === 0) {
		area.appendChild(el("div", { class: "fin-empty-state" }, "No trend data for this period."));
		return;
	}

	const chartData = items.map(d => ({
		label: d.year + "-" + String(d.month).padStart(2, "0"),
		value: Math.abs(Number(d.total_amount || 0)) / 100,
	}));
	const chartDiv = el("div", { class: "fin-chart-container" });
	chartDiv.innerHTML = buildLineChart({ data: chartData, width: 500, height: 280, xKey: "label", yKey: "value" });
	area.appendChild(chartDiv);

	const table = el("table", { class: "fin-table", style: { marginTop: "var(--spacing-md)" } });
	table.appendChild(el("thead", {}, el("tr", {},
		el("th", {}, "Year"),
		el("th", {}, "Month"),
		el("th", { class: "fin-col-right" }, "Total Amount"),
	)));
	const tbody = el("tbody", {});
	for (const item of items) {
		tbody.appendChild(el("tr", {},
			el("td", {}, String(item.year || "")),
			el("td", {}, String(item.month || "")),
			el("td", { class: "fin-col-right fin-text-mono" }, centsToDisplay(Math.abs(Number(item.total_amount || 0)))),
		));
	}
	table.appendChild(tbody);
	area.appendChild(table);
}

// =========================================
// Tab 5: Top Payees
// =========================================

function renderTopPayees(area, data) {
	const items = Array.isArray(data) ? data : [];
	if (items.length === 0) {
		area.appendChild(el("div", { class: "fin-empty-state" }, "No payee data for this period."));
		return;
	}

	const chartData = items.map(d => ({
		label: d.payee_name || "Unknown",
		value: Math.abs(Number(d.total_amount || 0)) / 100,
	}));
	const chartDiv = el("div", { class: "fin-chart-container" });
	chartDiv.innerHTML = buildHorizontalBarChart({ data: chartData, width: 500, height: Math.max(250, items.length * 30 + 40) });
	area.appendChild(chartDiv);

	const table = el("table", { class: "fin-table", style: { marginTop: "var(--spacing-md)" } });
	table.appendChild(el("thead", {}, el("tr", {},
		el("th", {}, "Payee"),
		el("th", { class: "fin-col-right" }, "Total Amount"),
		el("th", { class: "fin-col-right" }, "Transactions"),
	)));
	const tbody = el("tbody", {});
	for (const item of items) {
		tbody.appendChild(el("tr", {},
			el("td", {}, item.payee_name || "Unknown"),
			el("td", { class: "fin-col-right fin-text-mono" }, centsToDisplay(Math.abs(Number(item.total_amount || 0)))),
			el("td", { class: "fin-col-right" }, String(item.transaction_count || 0)),
		));
	}
	table.appendChild(tbody);
	area.appendChild(table);
}
