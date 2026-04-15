export function createFinanceController({ windowManager, sendEvent }) {
	const FIN_SERVER_EVENTS = [
		"fin_account_created", "fin_account_updated", "fin_account_archived", "fin_account_unarchived",
		"fin_account_deleted", "fin_accounts_list", "fin_accounts_reordered",
		"fin_transaction_created", "fin_transaction_updated", "fin_transaction_deleted",
		"fin_transactions_list", "fin_transfer_created",
		"fin_transaction_split_updated", "fin_transaction_splits_list",
		"fin_payee_created", "fin_payee_updated", "fin_payee_deleted",
		"fin_payees_list", "fin_payee_results",
		"fin_subscription_created", "fin_subscription_updated", "fin_subscription_deleted",
		"fin_subscriptions_list", "fin_subscription_confirmed",
		"fin_subscriptions_upcoming", "fin_subscriptions_summary",
		"fin_budget_updated", "fin_budget_category_updated", "fin_budget_category_deleted",
		"fin_budget_data",
		"fin_report_spending_by_category", "fin_report_income_vs_expense",
		"fin_report_net_worth", "fin_report_spending_trends", "fin_report_top_payees",
		"fin_categories_updated", "fin_categories_data",
		"fin_custom_view_created", "fin_custom_view_updated", "fin_custom_view_deleted",
		"fin_custom_views_list", "fin_custom_views_reordered",
		"fin_dashboard_data", "fin_dashboard_updated",
	];

	const forwardToFinanceWindow = (event, data) => {
		const win = windowManager.getFinanceWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("fin-event", { event, data });
		}
	};

	const getSocketEventHandlers = () => {
		const handlers = {};
		for (const eventName of FIN_SERVER_EVENTS) {
			handlers[eventName] = ({ data }) => forwardToFinanceWindow(eventName, data);
		}
		return handlers;
	};

	const handleRendererSend = (eventName, data) => {
		sendEvent?.(eventName, data);
	};

	return {
		getSocketEventHandlers,
		handleRendererSend,
		forwardToFinanceWindow,
	};
}
