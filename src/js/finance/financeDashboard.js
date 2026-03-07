import { sendEvent, showToast, switchSection, state, utils } from "./financeWindow.js";

const { el, formatCurrency, formatDateShort, centsToDisplay, getCurrentMonthRange, buildBarChart } = utils;

let unsubs = [];
let container = null;
let _dashboardTxRequestPending = false;
let _upcomingData = null;
let _incomeVsExpenseData = null;

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;

	// Subscribe to state changes
	unsubs.push(state.on("accounts", () => renderContent()));
	unsubs.push(state.on("transactions", () => {
		if (_dashboardTxRequestPending) {
			_dashboardTxRequestPending = false;
			renderContent();
		}
	}));

	renderContent();

	// Fetch data
	const s = state.getState();
	if (s.accounts.size === 0) {
		sendEvent("fin_accounts_fetch", {});
	}
	sendEvent("fin_subscriptions_upcoming", { days_ahead: 14 });

	const { dateFrom, dateTo } = getCurrentMonthRange();
	sendEvent("fin_report_income_vs_expense", { date_from: dateFrom, date_to: dateTo });

	_dashboardTxRequestPending = true;
	sendEvent("fin_transactions_fetch", { limit: 5 });
}

// =========================================
// onEvent — handle events not going through state
// =========================================

export function onEvent(event, data) {
	if (event === "fin_subscriptions_upcoming") {
		_upcomingData = Array.isArray(data) ? data : [];
		renderContent();
	}
	if (event === "fin_report_income_vs_expense") {
		_incomeVsExpenseData = data;
		renderContent();
	}
	if (event === "fin_transactions_list") {
		if (_dashboardTxRequestPending) {
			_dashboardTxRequestPending = false;
			renderContent();
		}
	}
}

// =========================================
// Destroy
// =========================================

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	_dashboardTxRequestPending = false;
	_upcomingData = null;
	_incomeVsExpenseData = null;
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	const s = state.getState();
	const accounts = [...s.accounts.values()].filter(a => !a.is_archived);

	// Net worth panel
	container.appendChild(buildNetWorthPanel(accounts));

	// 2x2 grid
	const grid = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-md)", marginTop: "var(--spacing-md)" } });
	grid.appendChild(buildAccountsPanel(accounts));
	grid.appendChild(buildUpcomingPanel());
	grid.appendChild(buildRecentTransactionsPanel(s));
	grid.appendChild(buildIncomeExpensePanel());
	container.appendChild(grid);
}

// =========================================
// Net Worth Panel
// =========================================

function buildNetWorthPanel(accounts) {
	let assets = 0;
	let liabilities = 0;

	for (const a of accounts) {
		const bal = Number(a.balance || 0);
		if (a.account_type === "credit_card" || a.account_type === "loan") {
			liabilities += Math.abs(bal);
		} else {
			assets += bal;
		}
	}

	const netWorth = assets - liabilities;

	const panel = el("div", { class: "fin-card" },
		el("div", { style: { display: "flex", alignItems: "baseline", gap: "var(--spacing-md)", flexWrap: "wrap" } },
			el("div", { style: { flex: "1" } },
				el("div", { class: "fin-text-muted fin-text-sm", style: { marginBottom: "4px" } }, "Net Worth"),
				el("div", { style: { fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-semibold)" } },
					formatCurrency(netWorth)),
			),
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-text-sm" }, "Assets: "),
				el("span", { class: "fin-amount-positive fin-text-mono" }, formatCurrency(assets)),
			),
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-text-sm" }, "Liabilities: "),
				el("span", { class: "fin-amount-negative fin-text-mono" }, formatCurrency(liabilities)),
			),
		),
	);
	return panel;
}

// =========================================
// Accounts Panel
// =========================================

function buildAccountsPanel(accounts) {
	const panel = el("div", { class: "fin-card fin-flex-col" });
	const header = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", marginBottom: "var(--spacing-sm)" } },
		el("span", { style: { fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-sm)" } }, "Accounts"),
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => switchSection("accounts") }, "View all"),
	);
	panel.appendChild(header);

	if (accounts.length === 0) {
		panel.appendChild(el("div", { class: "fin-empty-state" }, "No accounts yet"));
		return panel;
	}

	const list = el("div", { class: "fin-flex-col", style: { gap: "6px" } });
	for (const a of accounts.slice(0, 6)) {
		const row = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", cursor: "pointer", padding: "4px 0" } },
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-account-color-dot", style: { backgroundColor: a.color || "var(--color-accent-primary)" } }),
				el("span", { class: "fin-truncate", style: { maxWidth: "140px" } }, a.name),
			),
			el("span", { class: "fin-text-mono fin-text-sm" }, formatCurrency(Number(a.balance || 0), a.currency || "RON")),
		);
		row.addEventListener("click", () => switchSection("accounts"));
		list.appendChild(row);
	}
	panel.appendChild(list);
	return panel;
}

// =========================================
// Upcoming Bills Panel
// =========================================

function buildUpcomingPanel() {
	const panel = el("div", { class: "fin-card fin-flex-col" });
	const header = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", marginBottom: "var(--spacing-sm)" } },
		el("span", { style: { fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-sm)" } }, "Upcoming Bills"),
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => switchSection("subscriptions") }, "View all"),
	);
	panel.appendChild(header);

	if (!_upcomingData || _upcomingData.length === 0) {
		panel.appendChild(el("div", { class: "fin-empty-state" }, "No upcoming bills"));
		return panel;
	}

	const list = el("div", { class: "fin-flex-col", style: { gap: "6px" } });
	for (const sub of _upcomingData.slice(0, 6)) {
		const row = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", padding: "4px 0", cursor: "pointer" } },
			el("span", { class: "fin-truncate", style: { maxWidth: "140px" } }, sub.name || sub.description || "Subscription"),
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-amount-negative fin-text-mono fin-text-sm" }, formatCurrency(Number(sub.amount || 0))),
				el("span", { class: "fin-text-muted fin-text-sm" }, sub.next_billing_date ? formatDateShort(sub.next_billing_date) : ""),
			),
		);
		row.addEventListener("click", () => switchSection("subscriptions"));
		list.appendChild(row);
	}
	panel.appendChild(list);
	return panel;
}

// =========================================
// Recent Transactions Panel
// =========================================

function buildRecentTransactionsPanel(s) {
	const panel = el("div", { class: "fin-card fin-flex-col" });
	const header = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", marginBottom: "var(--spacing-sm)" } },
		el("span", { style: { fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-sm)" } }, "Recent Transactions"),
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => switchSection("transactions") }, "View all"),
	);
	panel.appendChild(header);

	const txns = s.transactions.slice(0, 5);
	if (txns.length === 0) {
		panel.appendChild(el("div", { class: "fin-empty-state" }, "No transactions yet"));
		return panel;
	}

	const list = el("div", { class: "fin-flex-col", style: { gap: "6px" } });
	for (const tx of txns) {
		const amt = Number(tx.amount || 0);
		const isExpense = tx.transaction_type === "expense";
		const amtClass = isExpense ? "fin-amount-negative" : "fin-amount-positive";
		const prefix = isExpense ? "-" : "+";

		const row = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", padding: "4px 0", cursor: "pointer" } },
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-text-muted fin-text-sm", style: { minWidth: "48px" } }, tx.date ? formatDateShort(tx.date) : ""),
				el("span", { class: "fin-truncate", style: { maxWidth: "140px" } }, tx.description || ""),
			),
			el("span", { class: amtClass + " fin-text-mono fin-text-sm" }, prefix + centsToDisplay(Math.abs(amt))),
		);
		row.addEventListener("click", () => switchSection("transactions"));
		list.appendChild(row);
	}
	panel.appendChild(list);
	return panel;
}

// =========================================
// Income vs Expense Panel
// =========================================

function buildIncomeExpensePanel() {
	const panel = el("div", { class: "fin-card fin-flex-col" });
	panel.appendChild(
		el("span", { style: { fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-sm)", marginBottom: "var(--spacing-sm)" } }, "Income vs Expense"),
	);

	if (!_incomeVsExpenseData) {
		panel.appendChild(el("div", { class: "fin-empty-state" }, "Loading..."));
		return panel;
	}

	const income = Number(_incomeVsExpenseData.income || 0);
	const expense = Math.abs(Number(_incomeVsExpenseData.expense || 0));

	const chartData = [
		{ label: "Income", value: income / 100 },
		{ label: "Expense", value: expense / 100 },
	];

	const chartDiv = el("div", { class: "fin-chart-container" });
	chartDiv.innerHTML = buildBarChart({
		data: chartData,
		width: 300,
		height: 200,
		colorFn: (d) => d.label === "Income" ? "oklch(0.72 0.17 165)" : "oklch(0.65 0.20 25)",
	});
	panel.appendChild(chartDiv);

	// Summary row
	const summary = el("div", { class: "fin-flex-row", style: { justifyContent: "space-around" } },
		el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
			el("span", { class: "fin-text-muted fin-text-sm" }, "Income"),
			el("span", { class: "fin-amount-positive fin-text-mono" }, formatCurrency(income)),
		),
		el("div", { class: "fin-flex-col", style: { alignItems: "center" } },
			el("span", { class: "fin-text-muted fin-text-sm" }, "Expense"),
			el("span", { class: "fin-amount-negative fin-text-mono" }, formatCurrency(expense)),
		),
	);
	panel.appendChild(summary);
	return panel;
}
