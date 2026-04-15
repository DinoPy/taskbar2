import { sendEvent, showToast, switchSection, state, utils } from "./financeWindow.js";

const { el, formatCurrency, formatDateShort, centsToDisplay, getCurrentMonthRange, buildBarChart } = utils;

let unsubs = [];
let container = null;
let _dashboardTxRequestPending = false;
let _upcomingData = null;
let _incomeVsExpenseData = null;
let _configMode = false;

const BUILT_IN_KINDS = [
	{ kind: "net_worth", label: "Net Worth" },
	{ kind: "total_assets", label: "Total Assets" },
	{ kind: "total_liabilities", label: "Total Liabilities" },
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
	unsubs.push(state.on("customViews", () => renderContent()));
	unsubs.push(state.on("dashboardConfig", () => renderContent()));
	unsubs.push(state.on("transactions", () => {
		if (_dashboardTxRequestPending) {
			_dashboardTxRequestPending = false;
			renderContent();
		}
	}));

	renderContent();

	const s = state.getState();
	if (s.accounts.size === 0) {
		sendEvent("fin_accounts_fetch", {});
	}
	if (s.customViews.size === 0) {
		sendEvent("fin_custom_views_fetch", {});
	}
	sendEvent("fin_subscriptions_upcoming", { days_ahead: 14 });

	const { dateFrom, dateTo } = getCurrentMonthRange();
	sendEvent("fin_report_income_vs_expense", { date_from: dateFrom, date_to: dateTo });

	_dashboardTxRequestPending = true;
	sendEvent("fin_transactions_fetch", { limit: 5 });
}

// =========================================
// onEvent
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
	if (event === "fin_dashboard_updated") {
		_configMode = false;
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
	_dashboardTxRequestPending = false;
	_upcomingData = null;
	_incomeVsExpenseData = null;
	_configMode = false;
}

// =========================================
// Balance helpers
// =========================================

function computeBalances(accounts) {
	let assets = 0;
	let liabilities = 0;
	for (const a of accounts) {
		const bal = Number(a.computed_balance ?? a.initial_balance ?? 0);
		if (a.account_type === "credit_card" || a.account_type === "loan") {
			if (bal < 0) liabilities += Math.abs(bal);
			else if (bal > 0) assets += bal;
		} else {
			assets += bal;
		}
	}
	return { assets, liabilities, netWorth: assets - liabilities };
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	const s = state.getState();
	const accounts = [...s.accounts.values()].filter(a => !a.is_archived);

	if (_configMode) {
		container.appendChild(buildConfigPanel());
		return;
	}

	// Top views row — configurable or default
	const config = s.dashboardConfig;
	if (config.length > 0) {
		container.appendChild(buildConfiguredViews(accounts, config));
	} else {
		container.appendChild(buildNetWorthPanel(accounts));
	}

	// Configure button
	const configBtn = el("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "4px" } },
		el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
			_configMode = true;
			renderContent();
		} }, "Configure Dashboard"),
	);
	container.appendChild(configBtn);

	// 2x2 grid
	const grid = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-md)", marginTop: "var(--spacing-md)" } });
	grid.appendChild(buildAccountsPanel(accounts));
	grid.appendChild(buildUpcomingPanel());
	grid.appendChild(buildRecentTransactionsPanel(s));
	grid.appendChild(buildIncomeExpensePanel());
	container.appendChild(grid);
}

// =========================================
// Configured views row
// =========================================

function buildConfiguredViews(accounts, config) {
	const s = state.getState();
	const { assets, liabilities, netWorth } = computeBalances(accounts);

	const row = el("div", { style: { display: "flex", gap: "var(--spacing-md)", flexWrap: "wrap" } });

	for (const item of config) {
		let label = "";
		let value = 0;

		if (item.kind === "net_worth") {
			label = "Net Worth";
			value = netWorth;
		} else if (item.kind === "total_assets") {
			label = "Total Assets";
			value = assets;
		} else if (item.kind === "total_liabilities") {
			label = "Total Liabilities";
			value = liabilities;
		} else if (item.kind === "custom_view") {
			const view = s.customViews.get(item.view_id);
			if (!view) continue; // stale reference — skip gracefully
			label = view.name || "Custom View";
			value = Number(view.computed_balance ?? 0);
		} else {
			continue;
		}

		const card = el("div", { class: "fin-card", style: { flex: "1", minWidth: "140px" } },
			el("div", { class: "fin-text-muted fin-text-sm", style: { marginBottom: "4px" } }, label),
			el("div", { style: { fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-semibold)" } },
				formatCurrency(value)),
		);
		row.appendChild(card);
	}

	if (row.children.length === 0) {
		return buildNetWorthPanel(accounts);
	}
	return row;
}

// =========================================
// Net Worth Panel
// =========================================

function buildNetWorthPanel(accounts) {
	const { assets, liabilities, netWorth } = computeBalances(accounts);

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
			el("span", { class: "fin-text-mono fin-text-sm" }, formatCurrency(Number(a.computed_balance ?? a.initial_balance ?? 0), a.currency || "RON")),
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
				el("span", { class: "fin-text-muted fin-text-sm" }, sub.next_due_date ? formatDateShort(sub.next_due_date) : ""),
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
		const isTransfer = tx.transaction_type === "transfer";
		const isTransferIncoming = tx.transaction_type === "income" && tx.transfer_peer_id;
		let amtClass = "fin-amount-positive";
		if (isExpense || isTransfer) amtClass = "fin-amount-negative";
		else if (isTransferIncoming) amtClass = "fin-text-accent";
		const prefix = (isExpense || isTransfer) ? "-" : "+";

		const account = s.accounts.get(tx.account_id);
		const peerAccount = (isTransfer || isTransferIncoming) && tx.transfer_account_id ? s.accounts.get(tx.transfer_account_id) : null;
		let description = tx.description || "";
		if ((isTransfer || isTransferIncoming) && peerAccount) {
			description = (isTransfer ? "To " : "From ") + peerAccount.name;
		}

		const row = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", padding: "4px 0", cursor: "pointer" } },
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("span", { class: "fin-text-muted fin-text-sm", style: { minWidth: "48px" } }, tx.date ? formatDateShort(tx.date) : ""),
				el("span", { class: "fin-truncate fin-text-sm", style: { maxWidth: "80px", color: "var(--color-text-tertiary)" } }, account?.name || ""),
				el("span", { class: "fin-truncate", style: { maxWidth: "140px" } }, description),
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

	const income = Number(_incomeVsExpenseData.total_income || 0);
	const expense = Math.abs(Number(_incomeVsExpenseData.total_expense || 0));

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

// =========================================
// Dashboard Configuration Panel
// =========================================

function buildConfigPanel() {
	const s = state.getState();
	const current = [...s.dashboardConfig];
	const customViews = [...s.customViews.values()].sort((a, b) => (a.position || 0) - (b.position || 0));

	const panel = el("div", { class: "fin-card" });
	panel.appendChild(el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } }, "Configure Dashboard Views"));

	// Current items list
	const listEl = el("div", { class: "fin-flex-col", style: { gap: "6px", marginBottom: "var(--spacing-md)" } });

	const renderList = () => {
		listEl.innerHTML = "";
		if (current.length === 0) {
			listEl.appendChild(el("div", { class: "fin-text-muted fin-text-sm" }, "No items — default net worth view will be shown."));
		}
		current.forEach((item, idx) => {
			const label = itemLabel(item, s);
			const row = el("div", { class: "fin-flex-row", style: { justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "var(--color-bg-secondary)", borderRadius: "4px" } },
				el("span", { class: "fin-text-sm" }, label),
				el("div", { class: "fin-flex-row fin-gap-sm" },
					idx > 0 ? el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
						[current[idx - 1], current[idx]] = [current[idx], current[idx - 1]];
						renderList();
					} }, "\u2191") : null,
					idx < current.length - 1 ? el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
						[current[idx], current[idx + 1]] = [current[idx + 1], current[idx]];
						renderList();
					} }, "\u2193") : null,
					el("button", { class: "fin-btn fin-btn-sm fin-btn-danger", onClick: () => {
						current.splice(idx, 1);
						renderList();
					} }, "\u2715"),
				),
			);
			listEl.appendChild(row);
		});
	};
	renderList();
	panel.appendChild(listEl);

	// Add item controls
	const addRow = el("div", { class: "fin-flex-row fin-gap-sm", style: { marginBottom: "var(--spacing-md)", flexWrap: "wrap" } });

	for (const bk of BUILT_IN_KINDS) {
		const alreadyAdded = current.some(c => c.kind === bk.kind);
		if (!alreadyAdded) {
			addRow.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				current.push({ kind: bk.kind });
				renderList();
			} }, "+ " + bk.label));
		}
	}

	for (const cv of customViews) {
		const alreadyAdded = current.some(c => c.kind === "custom_view" && c.view_id === cv.id);
		if (!alreadyAdded) {
			addRow.appendChild(el("button", { class: "fin-btn fin-btn-sm fin-btn-secondary", onClick: () => {
				current.push({ kind: "custom_view", view_id: cv.id });
				renderList();
			} }, "+ " + (cv.name || "Custom View")));
		}
	}

	if (addRow.children.length > 0) {
		panel.appendChild(el("div", { class: "fin-text-muted fin-text-sm", style: { marginBottom: "4px" } }, "Add view:"));
		panel.appendChild(addRow);
	}

	// Save / Cancel
	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			sendEvent("fin_dashboard_update", { items: current });
			_configMode = false;
			// Optimistic update
			state.setDashboardConfig(current);
		} }, "Save"),
		el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
			_configMode = false;
			renderContent();
		} }, "Cancel"),
	);
	panel.appendChild(btns);

	return panel;
}

function itemLabel(item, s) {
	if (item.kind === "net_worth") return "Net Worth";
	if (item.kind === "total_assets") return "Total Assets";
	if (item.kind === "total_liabilities") return "Total Liabilities";
	if (item.kind === "custom_view") {
		const view = s.customViews.get(item.view_id);
		return view ? view.name : "Custom View (deleted)";
	}
	return item.kind;
}
