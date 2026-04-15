import test from "node:test";
import assert from "node:assert/strict";

import {
	createWriteCoordinator,
	getBalanceRefreshKindsForEvent,
} from "../../src/js/finance/financeWriteCoordinator.js";

test("coordinator resolves a registered write on a matching success event", () => {
	const coordinator = createWriteCoordinator();
	const token = coordinator.beginWrite("fin_transaction_edit", {
		entityKind: "transaction",
		entityId: "tx-1",
		successEvents: ["fin_transaction_updated"],
	});

	const resolved = coordinator.resolveWrite("fin_transaction_updated", { id: "tx-1" });

	assert.equal(resolved?.token, token);
	assert.equal(coordinator.getPendingWrites().length, 0);
});

test("coordinator does not resolve the wrong write for an unrelated success event", () => {
	const coordinator = createWriteCoordinator();
	coordinator.beginWrite("fin_transaction_edit", {
		entityKind: "transaction",
		entityId: "tx-1",
		successEvents: ["fin_transaction_updated"],
	});

	const resolved = coordinator.resolveWrite("fin_subscription_updated", { id: "sub-1" });

	assert.equal(resolved, null);
	assert.equal(coordinator.getPendingWrites().length, 1);
});

test("coordinator can resolve a write via a custom matcher", () => {
	const coordinator = createWriteCoordinator();
	coordinator.beginWrite("fin_subscription_confirm", {
		entityKind: "subscription",
		entityId: "sub-1",
		successEvents: ["fin_subscription_confirmed"],
		matches: (event, payload) => event === "fin_subscription_confirmed" && payload?.subscription?.id === "sub-1",
	});

	const resolved = coordinator.resolveWrite("fin_subscription_confirmed", {
		subscription: { id: "sub-1" },
		transaction: { id: "tx-1" },
	});

	assert.equal(resolved?.entityId, "sub-1");
});

test("coordinator can clear all pending writes without guessing which one failed", () => {
	const coordinator = createWriteCoordinator();
	coordinator.beginWrite("fin_transaction_edit", {
		entityKind: "transaction",
		entityId: "tx-1",
		successEvents: ["fin_transaction_updated"],
	});
	coordinator.beginWrite("fin_custom_view_edit", {
		entityKind: "custom_view",
		entityId: "view-1",
		successEvents: ["fin_custom_view_updated"],
	});

	const cleared = coordinator.clearWrites();

	assert.equal(cleared.length, 2);
	assert.deepEqual(
		cleared.map(write => write.requestEvent),
		["fin_transaction_edit", "fin_custom_view_edit"],
	);
	assert.equal(coordinator.getPendingWrites().length, 0);
});

test("subscription confirmation with a transaction triggers account and custom view refresh", () => {
	const kinds = getBalanceRefreshKindsForEvent("fin_subscription_confirmed", {
		transaction: { id: "tx-1" },
	});

	assert.deepEqual(kinds, ["accounts", "customViews"]);
});
