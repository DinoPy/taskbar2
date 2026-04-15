const { ipcRenderer } = require("electron");

import * as state from "./financeState.js";
import * as utils from "./financeUtils.js";
import * as dashboard from "./financeDashboard.js";
import * as accounts from "./financeAccounts.js";
import * as transactions from "./financeTransactions.js";
import * as transfers from "./financeTransfers.js";
import * as subscriptions from "./financeSubscriptions.js";
import * as budgets from "./financeBudgets.js";
import * as reports from "./financeReports.js";
import * as payees from "./financePayees.js";
import * as categories from "./financeCategories.js";
import * as customViews from "./financeCustomViews.js";
import {
	createWriteCoordinator,
	getBalanceRefreshKindsForEvent,
} from "./financeWriteCoordinator.js";

// =========================================
// Send helper
// =========================================

export const sendEvent = (event, data = {}) => {
	ipcRenderer.send("fin-send", { event, data });
};

// =========================================
// Navigation config
// =========================================

const NAV_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: "\u25EB" },
	{ id: "accounts", label: "Accounts", icon: "\u25F0" },
	{ id: "transactions", label: "Transactions", icon: "\u2630" },
	{ id: "transfers", label: "Transfers", icon: "\u21C4" },
	{ id: "subscriptions", label: "Subscriptions", icon: "\u21BB" },
	{ id: "budgets", label: "Budgets", icon: "\u25A3" },
	{ id: "reports", label: "Reports", icon: "\u25F2" },
	{ id: "payees", label: "Payees", icon: "\u22A1" },
	{ id: "categories", label: "Categories", icon: "\u229E" },
	{ id: "custom-views", label: "Custom Views", icon: "\u25C8" },
];

// =========================================
// Placeholder section module
// =========================================

function createPlaceholder(name) {
	return {
		init() {},
		render(container) {
			container.innerHTML = `<div class="fin-empty-state">${name} — coming soon</div>`;
		},
		onEvent() {},
		destroy() {},
	};
}

// Section modules — real implementations + placeholders for unbuilt ones
const sections = {};
for (const item of NAV_ITEMS) {
	sections[item.id] = createPlaceholder(item.label);
}
sections["dashboard"] = dashboard;
sections["accounts"] = accounts;
sections["transactions"] = transactions;
sections["transfers"] = transfers;
sections["subscriptions"] = subscriptions;
sections["budgets"] = budgets;
sections["reports"] = reports;
sections["payees"] = payees;
sections["categories"] = categories;
sections["custom-views"] = customViews;

// =========================================
// State
// =========================================

let activeSection = null;
let activeSectionId = null;
const writeCoordinator = createWriteCoordinator();

// =========================================
// Toast helper
// =========================================

function showToast(message, type = "info") {
	const toast = utils.el("div", { class: "fin-toast fin-toast--" + type }, message);
	document.body.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("fin-toast--visible"));
	setTimeout(() => {
		toast.classList.remove("fin-toast--visible");
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

function refreshFinanceCollections(kinds) {
	const refreshKinds = new Set(Array.isArray(kinds) ? kinds : []);

	if (refreshKinds.has("accounts")) {
		sendEvent("fin_accounts_fetch", {});
	}
	if (refreshKinds.has("payees")) {
		sendEvent("fin_payees_fetch", {});
	}
	if (refreshKinds.has("customViews")) {
		sendEvent("fin_custom_views_fetch", {});
	}
	if (refreshKinds.has("subscriptions")) {
		sendEvent("fin_subscriptions_fetch", {});
	}
	if (refreshKinds.has("dashboard")) {
		sendEvent("fin_dashboard_fetch", {});
	}
	if (refreshKinds.has("budget") && activeSectionId === "budgets" && typeof budgets.refetchCurrentBudget === "function") {
		budgets.refetchCurrentBudget();
	}
}

export function beginFinanceWrite(requestEvent, metadata = {}) {
	return writeCoordinator.beginWrite(requestEvent, metadata);
}

function resolveFinanceWrite(event, data) {
	const resolved = writeCoordinator.resolveWrite(event, data);
	if (!resolved) return null;

	try {
		resolved.onSuccess?.(event, data, resolved);
	} catch (error) {
		console.error("[Finance] onSuccess callback failed:", error);
	}

	return resolved;
}

function getDefaultNotFoundRefreshKinds() {
	const refreshKinds = ["accounts", "payees", "customViews", "subscriptions"];
	if (activeSectionId === "budgets") {
		refreshKinds.push("budget");
	}
	return refreshKinds;
}

function failFinanceWrite(errorData) {
	const requestEvent = typeof errorData?.request_event === "string"
		? errorData.request_event.trim()
		: "";
	if (!requestEvent) return null;

	const failed = writeCoordinator.failWrite(write => write.requestEvent === requestEvent);
	if (!failed) return null;

	if (errorData?.type === "not_found") {
		refreshFinanceCollections(failed.refreshKinds);
		try {
			failed.onNotFound?.(errorData, failed);
		} catch (error) {
			console.error("[Finance] onNotFound callback failed:", error);
		}
		return failed;
	}

	try {
		failed.onError?.(errorData, failed);
	} catch (error) {
		console.error("[Finance] onError callback failed:", error);
	}

	if (errorData?.type === "database_error") {
		refreshFinanceCollections(failed.refreshKinds);
	}

	return failed;
}

function handleConnectionError(data) {
	const errorData = data && typeof data === "object" ? data : {};
	const hadRequestHint = typeof errorData.request_event === "string" && errorData.request_event.trim().length > 0;
	const failedWrite = failFinanceWrite(errorData);

	if (!hadRequestHint) {
		writeCoordinator.clearWrites();
	}

	if (errorData.type === "not_found") {
		if (!failedWrite) {
			refreshFinanceCollections(getDefaultNotFoundRefreshKinds());
		}
		showToast(errorData.message || "This item no longer exists. The list has been refreshed.", "info");
		return;
	}

	if (failedWrite && errorData.message) {
		showToast(errorData.message, "error");
		return;
	}

	showToast(errorData.message || "Connection error", "error");
}

function refreshDerivedFinanceState(event, data) {
	refreshFinanceCollections(getBalanceRefreshKindsForEvent(event, data));

	if (
		event === "fin_account_created" ||
		event === "fin_account_updated" ||
		event === "fin_account_deleted"
	) {
		refreshFinanceCollections(["customViews"]);
	}

	if (
		event === "fin_custom_view_created" ||
		event === "fin_custom_view_updated" ||
		event === "fin_custom_views_reordered"
	) {
		refreshFinanceCollections(["customViews"]);
	}

	if (
		activeSectionId === "budgets" &&
		(
			event === "fin_transaction_created" ||
			event === "fin_transaction_updated" ||
			event === "fin_transaction_deleted" ||
			event === "fin_transfer_created" ||
			(event === "fin_subscription_confirmed" && data?.transaction)
		)
	) {
		refreshFinanceCollections(["budget"]);
	}
}

// =========================================
// Sidebar rendering
// =========================================

function renderSidebar() {
	const navList = document.getElementById("fin-nav-list");
	if (!navList) return;

	for (const item of NAV_ITEMS) {
		const li = utils.el("li", { class: "fin-nav-item", "data-section": item.id },
			utils.el("span", { class: "fin-nav-icon" }, item.icon),
			utils.el("span", { class: "fin-nav-label" }, item.label),
		);
		li.addEventListener("click", () => switchSection(item.id));
		navList.appendChild(li);
	}
}

function updateNavActive(sectionId) {
	const items = document.querySelectorAll(".fin-nav-item");
	for (const item of items) {
		item.classList.toggle("active", item.dataset.section === sectionId);
	}
}

// =========================================
// Section switching
// =========================================

function switchSection(sectionId) {
	if (sectionId === activeSectionId) return;

	const contentEl = document.getElementById("fin-content");
	if (!contentEl) return;

	if (activeSection) {
		activeSection.destroy();
	}

	contentEl.innerHTML = "";
	activeSectionId = sectionId;
	activeSection = sections[sectionId] || createPlaceholder(sectionId);
	activeSection.render(contentEl);
	updateNavActive(sectionId);
}

// =========================================
// Event dispatch — maps server events to state mutations
// =========================================

function handleStateEvent(event, data) {
	switch (event) {
		// Accounts
		case "fin_accounts_list":
			state.setAccounts(data);
			break;
		case "fin_account_created":
		case "fin_account_updated": {
			const existing = state.getState().accounts.get(data.id);
			if (existing && !("computed_balance" in data)) {
				// Adjust computed_balance if initial_balance changed
				const oldInitial = Number(existing.initial_balance ?? 0);
				const newInitial = Number(data.initial_balance ?? oldInitial);
				const oldComputed = Number(existing.computed_balance ?? oldInitial);
				data.computed_balance = oldComputed + (newInitial - oldInitial);
			}
			state.upsertAccount(data);
			break;
		}
		case "fin_account_archived": {
			const existing = state.getState().accounts.get(data.id);
			if (existing) {
				state.upsertAccount({ ...existing, is_archived: true });
			} else {
				state.upsertAccount({ ...data, is_archived: true });
			}
			break;
		}
		case "fin_account_unarchived": {
			const existing = state.getState().accounts.get(data.id);
			if (existing) {
				state.upsertAccount({ ...existing, is_archived: false });
			}
			break;
		}
		case "fin_account_deleted":
			state.removeAccount(data.id);
			break;
		case "fin_accounts_reordered": {
			const accounts = state.getState().accounts;
			if (Array.isArray(data)) {
				for (const item of data) {
					const acct = accounts.get(item.id);
					if (acct) {
						acct.position = item.position;
					}
				}
			}
			state.emit("accounts");
			break;
		}

		// Transactions
		case "fin_transactions_list":
			state.setTransactions(data);
			break;
		case "fin_transaction_created":
		case "fin_transaction_updated":
			state.upsertTransaction(data);
			break;
		case "fin_transaction_deleted":
			state.removeTransaction(data.id);
			if (data.transfer_peer_id) {
				state.removeTransaction(data.transfer_peer_id);
			}
			break;

		// Transfers
		case "fin_transfer_created":
			state.upsertTransaction(data.outgoing);
			state.upsertTransaction(data.incoming);
			break;

		// Payees
		case "fin_payees_list":
			state.setPayees(data);
			break;
		case "fin_payee_created":
		case "fin_payee_updated":
			state.upsertPayee(data);
			break;
		case "fin_payee_deleted":
			state.removePayee(data.id);
			break;

		// Subscriptions
		case "fin_subscriptions_list":
			state.setSubscriptions(data);
			break;
		case "fin_subscription_created":
		case "fin_subscription_updated":
			state.upsertSubscription(data);
			break;
		case "fin_subscription_deleted":
			state.removeSubscription(data.id);
			break;
		case "fin_subscription_confirmed":
			state.upsertSubscription(data.subscription);
			if (data.transaction) {
				state.upsertTransaction(data.transaction);
			}
			break;

		// Budget
		case "fin_budget_data":
		case "fin_budget_updated":
			state.setBudget(data.budget, data.categories);
			break;
		case "fin_budget_category_updated": {
			const cats = state.getState().budgetCategories;
			const idx = cats.findIndex(c => c.id === data.id);
			if (idx >= 0) cats[idx] = data;
			else cats.push(data);
			state.emit("budget");
			break;
		}
		case "fin_budget_category_deleted": {
			const cats = state.getState().budgetCategories;
			const idx = cats.findIndex(c => c.id === data.id);
			if (idx >= 0) cats.splice(idx, 1);
			state.emit("budget");
			break;
		}

		// Categories
		case "fin_categories_data":
		case "fin_categories_updated":
			state.setCategories(data.categories);
			break;

		// Reports — store any fin_report_* events
		case "connection_error":
			handleConnectionError(data);
			break;

		case "fin_reconnected":
			// Re-fetch core data after WebSocket reconnect
			sendEvent("fin_accounts_fetch", {});
			sendEvent("fin_categories_fetch", {});
			sendEvent("fin_custom_views_fetch", {});
			sendEvent("fin_dashboard_fetch", {});
			// Re-render active section so it re-fetches its own data
			if (activeSectionId) {
				const contentEl = document.getElementById("fin-content");
				if (contentEl && activeSection) {
					activeSection.destroy();
					contentEl.innerHTML = "";
					activeSection.render(contentEl);
				}
			}
			break;

		// Transaction splits
		case "fin_transaction_split_updated": {
			const tx = state.getState().transactions.find(t => t.id === data.transaction_id);
			if (tx) {
				tx.is_split = !!data.is_split;
				state.emit("transactions");
			}
			break;
		}

		// Custom Views
		case "fin_custom_views_list": {
			const list = typeof data === "string" ? JSON.parse(data) : data;
			state.setCustomViews(Array.isArray(list) ? list : []);
			break;
		}
		case "fin_custom_view_created":
		case "fin_custom_view_updated": {
			const view = typeof data === "string" ? JSON.parse(data) : data;
			console.log("[Finance] custom view event:", event, view);
			if (view?.id) state.upsertCustomView(view);
			break;
		}
		case "fin_custom_view_deleted": {
			const del = typeof data === "string" ? JSON.parse(data) : data;
			if (del?.id) state.removeCustomView(del.id);
			break;
		}
		case "fin_custom_views_reordered":
			sendEvent("fin_custom_views_fetch", {});
			break;

		// Dashboard config
		case "fin_dashboard_data":
		case "fin_dashboard_updated": {
			const cfg = typeof data === "string" ? JSON.parse(data) : data;
			state.setDashboardConfig(cfg?.items ?? []);
			break;
		}

		default:
			// fin_report_* events
			if (event.startsWith("fin_report_")) {
				state.setReport(event, data);
			}
			// fin_payee_results, fin_subscriptions_upcoming, fin_subscriptions_summary,
			// fin_transaction_splits_list
			// — forwarded to active section only (handled below in IPC listener)
			break;
	}
}

// =========================================
// IPC listener
// =========================================

ipcRenderer.on("fin-event", (_, { event, data }) => {
	handleStateEvent(event, data);
	refreshDerivedFinanceState(event, data);
	resolveFinanceWrite(event, data);
	activeSection?.onEvent?.(event, data);
});

// =========================================
// Close button
// =========================================

document.getElementById("fin-close-btn").onclick = () => window.close();

// =========================================
// Init
// =========================================

// Init section modules with shared context
const sharedCtx = { sendEvent, showToast, switchSection, state, utils, beginFinanceWrite, refreshFinanceCollections };
dashboard.init(sharedCtx);
accounts.init(sharedCtx);
transactions.init(sharedCtx);
transfers.init(sharedCtx);
subscriptions.init(sharedCtx);
budgets.init(sharedCtx);
reports.init(sharedCtx);
payees.init(sharedCtx);
categories.init(sharedCtx);
customViews.init(sharedCtx);

renderSidebar();
switchSection("dashboard");

// Initial data fetch
sendEvent("fin_accounts_fetch", {});
sendEvent("fin_categories_fetch", {});
sendEvent("fin_custom_views_fetch", {});
sendEvent("fin_dashboard_fetch", {});

// Export for section modules
export { showToast, switchSection, state, utils, refreshFinanceCollections };
