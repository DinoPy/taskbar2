# Finance Patch 004 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the finance frontend with `docs/frontend_finance_patch_004.md` by adding shared stale-write handling, explicit stale reference UI, server-confirmed success resolution, and centralized balance refreshes for transaction-affecting events.

**Architecture:** Keep the main process as a thin finance event forwarder. In the renderer, add two small pure modules: one for pending write coordination and one for stale reference resolution. `financeWindow.js` owns event-to-write resolution and centralized refresh policy; individual finance sections own their form state and stale-field rendering.

**Tech Stack:** Electron renderer, vanilla JS/DOM, WebSocket events relayed through `fin-send` / `fin-event`, `node:test` for pure helper coverage.

---

## Context And Review Notes

- `src/js/finance/financeWindow.js` currently treats all `connection_error` payloads as a generic toast and has no way to correlate them to a finance mutation.
- `src/js/finance/financeTransactions.js`, `src/js/finance/financeSubscriptions.js`, and `src/js/finance/financeCustomViews.js` do not model stale reference state explicitly.
- Only the active finance section receives `onEvent`, so section-local balance refresh logic is insufficient for dashboard/custom-view consistency.
- `state.transactions` is shared by dashboard and transactions views. Do not add a shell-level automatic `fin_transactions_fetch` without splitting that store first.

---

### Task 1: Add Pure Stale-Reference Helpers

**Files:**
- Create: `src/js/finance/financeReferenceState.js`
- Create: `tests/finance/financeReferenceState.test.mjs`

**Step 1: Write the failing tests**

Create `tests/finance/financeReferenceState.test.mjs` with focused cases for:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
	resolveSingleReference,
	resolveMultiReference,
} from "../../src/js/finance/financeReferenceState.js";

test("resolveSingleReference returns valid state for a present id", () => {
	const result = resolveSingleReference("acct-1", new Map([["acct-1", { id: "acct-1", name: "Main" }]]));
	assert.equal(result.value, "acct-1");
	assert.equal(result.isStale, false);
});

test("resolveSingleReference marks missing id as stale", () => {
	const result = resolveSingleReference("acct-missing", new Map());
	assert.equal(result.value, "acct-missing");
	assert.equal(result.isStale, true);
});

test("resolveMultiReference reports unresolved ids separately", () => {
	const result = resolveMultiReference(["acct-1", "acct-missing"], new Map([["acct-1", { id: "acct-1" }]]));
	assert.deepEqual(result.validIds, ["acct-1"]);
	assert.deepEqual(result.staleIds, ["acct-missing"]);
	assert.equal(result.hasStale, true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/finance/financeReferenceState.test.mjs`

Expected: FAIL with missing export or module-not-found errors for `financeReferenceState.js`.

**Step 3: Write minimal implementation**

Create `src/js/finance/financeReferenceState.js` with pure helpers:

```javascript
export function resolveSingleReference(selectedId, collection) {
	if (!selectedId) {
		return { value: "", entity: null, isStale: false };
	}
	const entity = collection.get(selectedId) ?? null;
	return {
		value: selectedId,
		entity,
		isStale: !entity,
	};
}

export function resolveMultiReference(selectedIds, collection) {
	const ids = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
	const validIds = [];
	const staleIds = [];
	for (const id of ids) {
		if (collection.has(id)) validIds.push(id);
		else staleIds.push(id);
	}
	return {
		selectedIds: ids,
		validIds,
		staleIds,
		hasStale: staleIds.length > 0,
	};
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/finance/financeReferenceState.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/js/finance/financeReferenceState.js tests/finance/financeReferenceState.test.mjs
git commit -m "test(finance): add stale reference helpers"
```

---

### Task 2: Add Pure Pending-Write Coordinator Helpers

**Files:**
- Create: `src/js/finance/financeWriteCoordinator.js`
- Create: `tests/finance/financeWriteCoordinator.test.mjs`

**Step 1: Write the failing tests**

Create `tests/finance/financeWriteCoordinator.test.mjs` with cases for:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
	createWriteCoordinator,
	getBalanceRefreshKindsForEvent,
} from "../../src/js/finance/financeWriteCoordinator.js";

test("coordinator resolves a registered write on matching success event", () => {
	const coordinator = createWriteCoordinator();
	const token = coordinator.beginWrite("fin_transaction_edit", {
		entityKind: "transaction",
		entityId: "tx-1",
		successEvents: ["fin_transaction_updated"],
	});
	const resolved = coordinator.resolveWrite("fin_transaction_updated", { id: "tx-1" });
	assert.equal(resolved?.token, token);
});

test("coordinator keeps unrelated success events from resolving the wrong write", () => {
	const coordinator = createWriteCoordinator();
	coordinator.beginWrite("fin_transaction_edit", {
		entityKind: "transaction",
		entityId: "tx-1",
		successEvents: ["fin_transaction_updated"],
	});
	const resolved = coordinator.resolveWrite("fin_subscription_updated", { id: "sub-1" });
	assert.equal(resolved, null);
});

test("subscription confirmation with transaction requests account and custom-view refresh", () => {
	const kinds = getBalanceRefreshKindsForEvent("fin_subscription_confirmed", {
		transaction: { id: "tx-1" },
	});
	assert.deepEqual(kinds, ["accounts", "customViews"]);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/finance/financeWriteCoordinator.test.mjs`

Expected: FAIL with missing export or module-not-found errors for `financeWriteCoordinator.js`.

**Step 3: Write minimal implementation**

Create `src/js/finance/financeWriteCoordinator.js` with:

```javascript
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

export function createWriteCoordinator() {
	let nextToken = 1;
	const pending = new Map();

	return {
		beginWrite(requestEvent, metadata = {}) {
			const token = `write-${nextToken++}`;
			pending.set(token, {
				token,
				requestEvent,
				successEvents: metadata.successEvents ?? DEFAULT_SUCCESS_EVENTS[requestEvent] ?? [],
				entityKind: metadata.entityKind ?? null,
				entityId: metadata.entityId ?? null,
				refreshKinds: metadata.refreshKinds ?? [],
			});
			return token;
		},
		resolveWrite(successEvent, payload) {
			for (const [token, write] of pending) {
				if (!write.successEvents.includes(successEvent)) continue;
				if (write.entityId && payload?.id && write.entityId !== payload.id) continue;
				pending.delete(token);
				return write;
			}
			return null;
		},
		failWrite(predicate = () => true) {
			for (const [token, write] of pending) {
				if (!predicate(write)) continue;
				pending.delete(token);
				return write;
			}
			return null;
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
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/finance/financeWriteCoordinator.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/js/finance/financeWriteCoordinator.js tests/finance/financeWriteCoordinator.test.mjs
git commit -m "test(finance): add write coordination helpers"
```

---

### Task 3: Wire Shared Coordination Into The Finance Shell

**Files:**
- Modify: `src/js/finance/financeWindow.js`

**Step 1: Write the failing integration-oriented tests if any pure helpers are still missing**

If shell logic needs more pure extraction, add a small test for it before editing `financeWindow.js`. Otherwise proceed with the existing helper coverage.

**Step 2: Add shared imports and shell helpers**

Update `src/js/finance/financeWindow.js` to import:

```javascript
import {
	createWriteCoordinator,
	getBalanceRefreshKindsForEvent,
} from "./financeWriteCoordinator.js";
```

Create shell-local helpers:

- `refreshFinanceCollections(kinds)`
- `beginFinanceWrite(requestEvent, metadata)`
- `handleFinanceNotFound(errorPayload)`
- `handleFinanceSuccess(event, data)`

Keep these in the shell so every section can share them through `sharedCtx`.

**Step 3: Update `connection_error` handling**

Replace the current generic handler with:

- `not_found`: route through `handleFinanceNotFound`
- `database_error`: toast + targeted refetch for the failed write if configured
- everything else: current generic toast behavior

Do not remove the generic fallback.

**Step 4: Centralize balance refresh**

In the shell event dispatcher, after shared state updates for:

- `fin_transaction_created`
- `fin_transaction_updated`
- `fin_transaction_deleted`
- `fin_transfer_created`
- `fin_subscription_confirmed` when `data.transaction`

call:

```javascript
refreshFinanceCollections(getBalanceRefreshKindsForEvent(event, data));
```

Do not add a shell-level `fin_transactions_fetch`.

**Step 5: Expose the coordinator to section modules**

Extend `sharedCtx` with:

```javascript
beginFinanceWrite,
refreshFinanceCollections,
```

Require every section to pass callback metadata when registering a write:

```javascript
beginFinanceWrite("fin_transaction_edit", {
	entityKind: "transaction",
	entityId: editing.id,
	refreshKinds: ["accounts", "payees"],
	onSuccess: () => {
		formVisible = false;
		editingTx = null;
	},
	onNotFound: () => {
		// keep the form open, but mark the stale references invalid
	},
});
```

Keep the API minimal and renderer-only.

**Step 6: Run tests**

Run:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/js/finance/financeWindow.js
git commit -m "feat(finance): centralize write and stale error handling"
```

---

### Task 4: Make Transaction Form State Explicit And Stale-Aware

**Files:**
- Modify: `src/js/finance/financeTransactions.js`
- Test: `tests/finance/financeReferenceState.test.mjs`

**Step 1: Add or extend failing tests for transaction reference rules**

If needed, extend `tests/finance/financeReferenceState.test.mjs` with cases for:

```javascript
test("missing edited payee stays stale instead of clearing automatically", () => {
	const result = resolveSingleReference("payee-missing", new Map());
	assert.equal(result.isStale, true);
});
```

Run: `node --test tests/finance/financeReferenceState.test.mjs`

Expected: FAIL before the helper/output change, or continue if already covered.

**Step 2: Convert the form to explicit local state**

In `src/js/finance/financeTransactions.js`:

- replace ad-hoc `selectedPayeeId` and direct `accSelect.value` reads with a local form-state object
- seed it from the editing transaction
- resolve `account_id` and `payee_id` through `financeReferenceState.js`
- render stale field hints when the selected id is missing from current collections

Do not silently pick a replacement account.

**Step 3: Register writes and close only on success**

Before sending:

```javascript
beginFinanceWrite(editing ? "fin_transaction_edit" : "fin_transaction_create", {
	entityKind: "transaction",
	entityId: editing?.id ?? null,
	refreshKinds: ["accounts", "payees"],
	successMessage: editing ? "Transaction updated" : "Transaction created",
});
```

Update the section event handlers so form close/reset happens only after the matching success event resolves.

**Step 4: Handle stale delete/edit paths**

- For delete, register a pending write with `entityKind: "transaction"`.
- On `not_found`, refresh the current transaction surface only if the transactions section is active; otherwise rely on broadcast state and the targeted collection refresh.
- Keep the filter state intact.

**Step 5: Run tests**

Run:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/js/finance/financeTransactions.js tests/finance/financeReferenceState.test.mjs
git commit -m "feat(finance): make transaction forms stale-aware"
```

---

### Task 5: Apply The Same Stale-Reference Rules To Subscriptions And Custom Views

**Files:**
- Modify: `src/js/finance/financeSubscriptions.js`
- Modify: `src/js/finance/financeCustomViews.js`

**Step 1: Write or extend failing tests for multi-reference handling**

If needed, extend `tests/finance/financeReferenceState.test.mjs` with:

```javascript
test("resolveMultiReference preserves valid ids and exposes stale ids", () => {
	const result = resolveMultiReference(["acct-1", "acct-2"], new Map([["acct-1", { id: "acct-1" }]]));
	assert.deepEqual(result.validIds, ["acct-1"]);
	assert.deepEqual(result.staleIds, ["acct-2"]);
});
```

Run: `node --test tests/finance/financeReferenceState.test.mjs`

Expected: FAIL before the helper exists or continue if already green.

**Step 2: Update subscriptions**

In `src/js/finance/financeSubscriptions.js`:

- resolve `account_id` and `payee_id` explicitly
- render stale field messages instead of falling back to blank/first option
- block save while a stale account or payee remains
- register create/edit/delete/pause/resume/cancel/confirm writes with the coordinator

Keep the success toast timing on success events only.

**Step 3: Update custom views**

In `src/js/finance/financeCustomViews.js`:

- keep `selectedIds` in form-local state
- compute unresolved account ids with `resolveMultiReference`
- render those unresolved ids visibly in the form
- block save until the unresolved ids are removed or reselected from current accounts
- register create/edit/delete/reorder writes with the coordinator

**Step 4: Remove section-local balance refetch responsibilities that now belong in the shell**

Leave custom view fetch-on-create/update in place if needed for `computed_balance`, but remove transaction-balance refetch assumptions that depend on the section being active.

**Step 5: Run tests**

Run:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/js/finance/financeSubscriptions.js src/js/finance/financeCustomViews.js tests/finance/financeReferenceState.test.mjs
git commit -m "feat(finance): enforce stale reference rules in forms"
```

---

### Task 6: Register Remaining Patch-004 Mutations And Targeted Refetch Rules

**Files:**
- Modify: `src/js/finance/financeAccounts.js`
- Modify: `src/js/finance/financePayees.js`
- Modify: `src/js/finance/financeBudgets.js`
- Modify: `src/js/finance/financeTransfers.js`

**Step 1: Add write registration for affected flows**

Update these sections so they call the shared coordinator before sending:

- accounts: archive, unarchive, delete, reorder
- payees: delete
- budgets: category set, category delete
- transfers: create

Do not add optimistic success UI.

**Step 2: Add `not_found` refresh metadata**

Use targeted refresh kinds:

- accounts: `["accounts"]`
- payees: `["payees"]`
- budgets: `["budget"]` for the current month
- custom views affected by account changes: `["accounts", "customViews"]`
- transfer create: `["accounts", "customViews"]`

Where a current form or confirm state can become stale, clear it on `not_found`.

**Step 3: Keep existing success-event UX**

Do not move success toasts to send-time. Keep them tied to:

- `fin_account_archived`
- `fin_account_unarchived`
- `fin_account_deleted`
- `fin_transfer_created`
- `fin_payee_deleted`
- `fin_budget_category_updated`
- `fin_budget_category_deleted`

Only add the missing stale-data recovery behavior.

**Step 4: Run tests**

Run:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/js/finance/financeAccounts.js src/js/finance/financePayees.js src/js/finance/financeBudgets.js src/js/finance/financeTransfers.js
git commit -m "feat(finance): add stale handling for remaining patch 004 flows"
```

---

### Task 7: Final Verification

**Files:**
- Modify: none unless verification reveals a bug

**Step 1: Run automated tests**

Run:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

Expected: PASS.

**Step 2: Run the app for a manual finance smoke check**

Run:

```bash
npm start
```

Manual checks:

1. Open Finance.
2. Edit a transaction and move it to another account.
3. Delete or archive a stale entity and confirm the stale-data toast + refresh path.
4. Open an edit form for a record whose account/payee has been deleted and confirm the stale UI blocks submit.
5. Confirm a subscription that creates a transaction and verify accounts/custom views refresh.
6. Verify dashboard account/custom-view balances update after transaction create/edit/delete and transfer create.

**Step 3: If smoke check fails, fix and rerun the relevant tests**

Run the smallest relevant subset first, then rerun:

```bash
node --test tests/finance/financeReferenceState.test.mjs tests/finance/financeWriteCoordinator.test.mjs
```

**Step 4: Commit**

```bash
git add src/js/finance/*.js tests/finance/*.mjs
git commit -m "fix(finance): align patch 004 write flows with backend"
```
