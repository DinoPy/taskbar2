const { ipcRenderer } = require("electron");

import * as state from "./financeState.js";
import * as utils from "./financeUtils.js";

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

// Section modules — placeholders until real ones are built
const sections = {};
for (const item of NAV_ITEMS) {
	sections[item.id] = createPlaceholder(item.label);
}

// =========================================
// State
// =========================================

let activeSection = null;
let activeSectionId = null;

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
		case "fin_account_updated":
			state.upsertAccount(data);
			break;
		case "fin_account_archived": {
			const existing = state.getState().accounts.get(data.id);
			if (existing) {
				state.upsertAccount({ ...existing, is_archived: true });
			} else {
				state.upsertAccount({ ...data, is_archived: true });
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
			state.setTransactions(data, state.getState().transactionsOffset > 0);
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
			showToast(data.message || "Connection error", "error");
			break;

		default:
			// fin_report_* events
			if (event.startsWith("fin_report_")) {
				state.setReport(event, data);
			}
			// fin_payee_results, fin_subscriptions_upcoming, fin_subscriptions_summary,
			// fin_transaction_split_updated, fin_transaction_splits_list
			// — forwarded to active section only (handled below in IPC listener)
			break;
	}
}

// =========================================
// IPC listener
// =========================================

ipcRenderer.on("fin-event", (_, { event, data }) => {
	handleStateEvent(event, data);
	activeSection?.onEvent?.(event, data);
});

// =========================================
// Close button
// =========================================

document.getElementById("fin-close-btn").onclick = () => window.close();

// =========================================
// Init
// =========================================

renderSidebar();
switchSection("dashboard");

// Initial data fetch
sendEvent("fin_accounts_fetch", {});
sendEvent("fin_categories_fetch", {});

// Export for section modules
export { showToast, switchSection, state, utils };
