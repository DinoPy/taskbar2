const DEFAULT_SUCCESS_EVENTS = {
	fin_transaction_create: ["fin_transaction_created"],
	fin_transaction_edit: ["fin_transaction_updated"],
	fin_transaction_delete: ["fin_transaction_deleted"],
	fin_transfer_create: ["fin_transfer_created"],
	fin_subscription_create: ["fin_subscription_created"],
	fin_subscription_edit: ["fin_subscription_updated"],
	fin_subscription_delete: ["fin_subscription_deleted"],
	fin_subscription_pause: ["fin_subscription_updated"],
	fin_subscription_resume: ["fin_subscription_updated"],
	fin_subscription_cancel: ["fin_subscription_updated"],
	fin_subscription_confirm: ["fin_subscription_confirmed"],
	fin_account_archive: ["fin_account_archived"],
	fin_account_unarchive: ["fin_account_unarchived"],
	fin_account_delete: ["fin_account_deleted"],
	fin_account_reorder: ["fin_accounts_reordered"],
	fin_payee_delete: ["fin_payee_deleted"],
	fin_budget_category_set: ["fin_budget_category_updated"],
	fin_budget_category_delete: ["fin_budget_category_deleted"],
	fin_custom_view_create: ["fin_custom_view_created"],
	fin_custom_view_edit: ["fin_custom_view_updated"],
	fin_custom_view_delete: ["fin_custom_view_deleted"],
	fin_custom_view_reorder: ["fin_custom_views_reordered"],
};

function getPayloadId(payload) {
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.id === "string" && payload.id) return payload.id;
	if (typeof payload.subscription?.id === "string" && payload.subscription.id) return payload.subscription.id;
	return null;
}

export function createWriteCoordinator() {
	let nextToken = 1;
	const pending = [];

	return {
		beginWrite(requestEvent, metadata = {}) {
			const write = {
				token: `write-${nextToken++}`,
				requestEvent,
				entityKind: metadata.entityKind ?? null,
				entityId: metadata.entityId ?? null,
				successEvents: Array.isArray(metadata.successEvents)
					? metadata.successEvents
					: (DEFAULT_SUCCESS_EVENTS[requestEvent] ?? []),
				refreshKinds: Array.isArray(metadata.refreshKinds) ? metadata.refreshKinds : [],
				matches: typeof metadata.matches === "function" ? metadata.matches : null,
				onSuccess: typeof metadata.onSuccess === "function" ? metadata.onSuccess : null,
				onNotFound: typeof metadata.onNotFound === "function" ? metadata.onNotFound : null,
				onError: typeof metadata.onError === "function" ? metadata.onError : null,
			};

			pending.push(write);
			return write.token;
		},

		resolveWrite(successEvent, payload) {
			for (let index = pending.length - 1; index >= 0; index -= 1) {
				const write = pending[index];
				if (!write.successEvents.includes(successEvent)) continue;

				if (write.matches && !write.matches(successEvent, payload, write)) {
					continue;
				}

				if (!write.matches && write.entityId) {
					const payloadId = getPayloadId(payload);
					if (payloadId && payloadId !== write.entityId) continue;
				}

				pending.splice(index, 1);
				return write;
			}

			return null;
		},

		failWrite(predicate = () => true) {
			for (let index = pending.length - 1; index >= 0; index -= 1) {
				const write = pending[index];
				if (!predicate(write)) continue;
				pending.splice(index, 1);
				return write;
			}

			return null;
		},

		clearWrites(predicate = () => true) {
			const cleared = [];
			for (let index = pending.length - 1; index >= 0; index -= 1) {
				const write = pending[index];
				if (!predicate(write)) continue;
				pending.splice(index, 1);
				cleared.unshift(write);
			}
			return cleared;
		},

		getPendingWrites() {
			return pending.slice();
		},
	};
}

export function getBalanceRefreshKindsForEvent(event, payload) {
	if (event === "fin_subscription_confirmed" && payload?.transaction) {
		return ["accounts", "customViews"];
	}

	if (
		event === "fin_transaction_created" ||
		event === "fin_transaction_updated" ||
		event === "fin_transaction_deleted" ||
		event === "fin_transfer_created"
	) {
		return ["accounts", "customViews"];
	}

	return [];
}
