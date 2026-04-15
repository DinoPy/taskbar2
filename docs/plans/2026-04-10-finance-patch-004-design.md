# Finance Patch 004 Design

## Goal

Implement `docs/frontend_finance_patch_004.md` so finance mutations follow the backend's stricter ownership and `not_found` rules, transaction edit can truly reassign `account_id`, and success/error UX is driven by server confirmations instead of local assumptions.

## Review Findings

1. `connection_error` is still handled as a generic toast in the finance shell, so stale-reference and missing-row cases cannot trigger the contract-required refresh/reset flow.
2. Transaction, subscription, and custom-view forms do not surface stale account/payee/view references. Missing references are either hidden, silently cleared, or silently re-submitted.
3. Balance refresh behavior is section-local. Because only the active finance section receives `onEvent`, custom-view and dashboard balances can remain stale after transaction-affecting events unless the custom-views section is open.
4. The finance renderer shares one `state.transactions` array between dashboard and transactions surfaces. Any automatic transaction refetch must respect that constraint, or it will clobber the other surface's data.

## Constraints

- Preserve existing local changes in the dirty worktree.
- Keep socket/main-process forwarding thin; finance write coordination stays in the renderer.
- Follow `docs/frontend_finance_ws_contract.md`, `docs/frontend_finance_patch_001.md`, `docs/frontend_finance_patch_002.md`, `docs/frontend_finance_patch_003.md`, and `docs/frontend_finance_patch_004.md`.
- Use server payloads as the authoritative source of truth after success events.
- Do not add schema changes or backend assumptions beyond the documented contract.

## Architecture

### Shared Write Coordinator

Add a small renderer-side coordinator module that tracks pending finance mutations and exposes helpers such as:

- `beginWrite(requestEvent, metadata)`
- `resolveWrite(successEvent, payload)`
- `failWrite(errorPayload)`

Metadata stores:

- request event
- entity kind (`transaction`, `subscription`, `account`, `payee`, `custom_view`, `budget_category`, `transfer`)
- entity id when known
- related reference kinds to refetch on `not_found`
- UI callbacks for `onSuccess`, `onNotFound`, and `onError`
- success toast message

The coordinator is intentionally thin: no optimistic state layer, no server envelope parsing, no cross-section store ownership.

`financeWindow.js` remains responsible for shell-level helpers such as collection refetching and event dispatch.

### Shared Reference Helpers

Add a pure helper module for stale reference detection:

- resolve single-reference fields (`account_id`, `payee_id`)
- resolve multi-reference fields (`account_ids`)
- produce explicit stale metadata for renderers
- block submit when the current selection contains stale ids

This keeps the tricky logic testable without a browser harness.

## Core Event Flow

1. A section sends a mutation and registers it with the write coordinator.
2. `financeWindow.js` receives the eventual success event, updates shared state from the server payload, then resolves the pending write.
3. The coordinator shows the success toast only after the success event arrives and asks the originating section to close/reset its form.
4. If `connection_error.type === "not_found"` arrives, the coordinator treats it as stale data:
   - refresh the relevant collections
   - clear invalid editing state or mark fields stale
   - close stale destructive-confirmation UI
   - show a specific stale-data toast
5. `invalid_data`, `conflict`, and `database_error` remain normal error paths; the originating UI stays open so the user can fix input.

## Balance Refresh Strategy

Centralize balance refresh triggers in `financeWindow.js` for these events:

- `fin_transaction_created`
- `fin_transaction_updated`
- `fin_transaction_deleted`
- `fin_transfer_created`
- `fin_subscription_confirmed` when `transaction` is non-null

For those events:

- always refetch `fin_accounts_fetch`
- refetch `fin_custom_views_fetch` if custom views are loaded or visible on dashboard
- optionally refetch the active budget month when transaction changes can affect `actual_amount`

This logic cannot live only in `financeCustomViews.onEvent`, because only the active section receives section-level event callbacks.

## Section Changes

### Transactions

- Keep explicit local form state for `account_id` and `payee_id`.
- Always send the currently selected `account_id` on edit.
- If the edited account/payee can no longer be resolved, show a stale field message instead of silently choosing a replacement.
- On success, replace local rows using the server payload already applied to shared state.
- On `not_found`, refetch accounts/payees and keep the form open in a stale-invalid state unless the transaction itself no longer exists.

### Subscriptions

- Validate the current account/payee selection against the latest fetched collections.
- Show stale selection state when either id disappears.
- Register create/edit/delete/pause/resume/cancel/confirm writes with the coordinator.
- Refetch balances after `fin_subscription_confirmed` when a transaction payload exists.

### Custom Views

- Preserve selected `account_ids` in local form state, but explicitly surface unresolved ids.
- Block submit while unresolved ids remain.
- Register create/edit/delete/reorder writes with the coordinator.
- On `not_found`, refetch both accounts and custom views, then clear stale edit/delete state.

### Accounts, Payees, Budgets, Transfers

- Route archive/unarchive/delete/reorder, payee delete, budget-category set/delete, and transfer create through the shared coordinator.
- Keep the existing server-confirmed success UX; add stale-data recovery and targeted refetch only.

## Transaction Store Constraint

Do not introduce a global automatic `fin_transactions_fetch` from the finance shell. The dashboard and transactions table currently share one `state.transactions` array with different fetch shapes. Patch 004 should use success payload replacement plus section-local resync where necessary, not a shell-level transaction refetch that would overwrite another surface.

## Testing Strategy

Add pure `node:test` coverage for:

- stale single-reference resolution
- stale multi-reference resolution
- pending write matching and `not_found` fallback behavior
- balance refresh trigger selection for transaction-affecting events

Manual smoke checks after implementation:

1. Edit a transaction and move it to another account.
2. Reopen the edit form with a deleted account/payee and verify stale UI blocks submit.
3. Delete/archive/reorder an entity that no longer exists and verify the stale-data toast + list refresh path.
4. Confirm a subscription that creates a transaction and verify account/custom-view balances refresh.
5. Verify the dashboard and custom views remain in sync after transaction create/edit/delete and transfer create.
