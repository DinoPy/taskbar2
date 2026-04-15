# Finance Module — Patch 004: Transaction Reassignment, Validation, and True Not-Found Handling

**Date:** 2026-04-10
**Applies to:** `frontend_finance_ws_contract.md`

This patch covers backend fixes from the finance audit. There is no schema migration in this patch. The main impact is on frontend write flows: some requests now validate ownership more strictly, some stale operations now return `not_found` instead of silently "succeeding", and transaction edit now truly moves a transaction to a different account.

---

## 1. Fix: `fin_transaction_edit` Can Now Change `account_id`

### What changed

Before this patch, `fin_transaction_edit` accepted `account_id` in the request, but the backend did not persist it. This caused the exact bug seen in the UI:

- user selected a savings account in the edit form
- backend broadcast `fin_transaction_updated`
- transaction actually stayed on the old account

The backend now updates `account_id` correctly.

### Frontend action required

1. In the transaction edit form, keep `account_id` in local form state and send it in `fin_transaction_edit`.
2. The safest frontend behavior is to always send the currently selected `account_id` on edit, not only when the UI thinks it changed.
3. On `fin_transaction_updated`, replace the local transaction with the full server payload. Do not preserve the old `account_id` from local state.
4. Do not show a success confirmation before the success event arrives.

### Account picker rule

The account picker for transaction edit must support the same active account types as create, including:

- `checking`
- `savings`
- `credit_card`
- `cash`
- `deposit`
- `loan`
- `investment`

If the currently selected account cannot be resolved, do not silently fall back to the first checking/debit account. Show an explicit invalid/stale state instead.

---

## 2. New Validation: Frontend Must Only Send User-Owned References

The backend now rejects stale or foreign references with `not_found` / `404`.

### Affected request fields

| Event | Field(s) now validated |
|------|-------------------------|
| `fin_transaction_create` | `account_id`, `payee_id` |
| `fin_transaction_edit` | `account_id`, `payee_id` |
| `fin_transfer_create` | `from_account_id`, `to_account_id` |
| `fin_subscription_create` | `account_id`, `payee_id` |
| `fin_subscription_edit` | `account_id`, `payee_id` |
| `fin_custom_view_create` | every `account_ids[]` entry |
| `fin_custom_view_edit` | every `account_ids[]` entry |

### Frontend action required

1. Build these selectors only from the latest user-owned collections:
   - accounts from `fin_accounts_fetch`
   - payees from `fin_payees_fetch`
   - custom views from `fin_custom_views_fetch`
2. If a previously selected account/payee disappears while a form is open, mark the field stale instead of keeping it silently.
3. If the backend returns `connection_error` with `type = "not_found"`, refresh the relevant source list and ask the user to reselect.

### Recommended stale-data handling

- stale `account_id` on transaction/subscription/custom-view form:
  - refetch `fin_accounts_fetch`
  - clear invalid selection or block submit
- stale `payee_id`:
  - refetch `fin_payees_fetch`
  - clear invalid payee selection
- stale custom view:
  - refetch `fin_custom_views_fetch`

---

## 3. Changed Semantics: These Events No Longer "Succeed" on Missing Rows

Several finance mutations previously returned success even when no row matched the user/id pair. The backend now returns `not_found` / `404` instead.

### Affected events

- `fin_account_archive`
- `fin_account_unarchive`
- `fin_account_delete`
- `fin_account_reorder`
- `fin_payee_delete`
- `fin_subscription_delete`
- `fin_budget_category_set`
- `fin_budget_category_delete`
- `fin_custom_view_edit`
- `fin_custom_view_delete`
- `fin_custom_view_reorder`

### Frontend action required

1. Do not treat "request sent" as success.
2. For these flows, show success only after the corresponding success broadcast/unicast arrives.
3. Handle `connection_error` with `type = "not_found"` as a normal stale-data case, not as a generic unknown failure.

### Recommended UI behavior on `not_found`

- close the modal/drawer for the missing entity
- show a message such as:
  - `"This item no longer exists. The list has been refreshed."`
- refetch the relevant collection
- remove any optimistic success toast

---

## 4. Success Handling Contract

The UI should be driven by server confirmations, not by local assumptions.

### Use the server payload as the source of truth

| Success event | Frontend behavior |
|--------------|-------------------|
| `fin_transaction_created` | append/merge full transaction from server |
| `fin_transaction_updated` | replace local transaction with full server payload |
| `fin_transaction_deleted` | remove by `id` and also `transfer_peer_id` if present |
| `fin_transfer_created` | insert both `outgoing` and `incoming` from server payload |
| `fin_subscription_created` | merge full subscription from server |
| `fin_subscription_updated` | replace local subscription with full server payload |
| `fin_subscription_deleted` | remove by `id` |
| `fin_custom_view_created` | merge full custom view from server |
| `fin_custom_view_updated` | replace local custom view with full server payload |
| `fin_custom_view_deleted` | remove by `id` |

### Important UX rule

If the UI currently shows:

- "Transaction updated"
- "Account archived"
- "Subscription deleted"
- "Budget category deleted"

immediately after `send(...)`, that behavior should be changed. Show those confirmations only after the matching backend success event arrives.

This is the main frontend fix needed to avoid repeating the original "updated even if false" issue.

---

## 5. Refetch Rules for Balances and Derived Views

This audit did not change the existing balance contract:

- account `computed_balance` is still fetched via `fin_accounts_fetch`
- custom view `computed_balance` is still fetched via `fin_custom_views_fetch`
- balances are not recalculated and rebroadcast on every transaction mutation

### Frontend action required

After any of these events, refetch account-backed balance surfaces if they are visible:

- `fin_transaction_created`
- `fin_transaction_updated`
- `fin_transaction_deleted`
- `fin_transfer_created`
- `fin_subscription_confirmed` when `transaction` is non-null

### Minimum recommended refresh behavior

1. Refetch `fin_accounts_fetch`
2. If custom views are visible or cached for dashboard display, refetch `fin_custom_views_fetch`
3. Recompute dashboard cards that depend on accounts or custom views

---

## 6. Frontend Checklist

- Send `account_id` from the transaction edit form.
- Allow savings and all other supported account types in the transaction edit account picker.
- Remove any fallback that silently rewrites the selected account to the first checking/debit account.
- Treat `connection_error` + `type = "not_found"` as a stale-reference outcome.
- Refresh account/payee/custom-view source lists when a stale selection is rejected.
- Show success messages only after success events arrive.
- Replace local entities with server payloads instead of partially merging local draft state.
- Refetch accounts/custom views after transaction-affecting mutations so balances stay correct.

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `fin_transaction_edit` now truly updates `account_id` | Yes — send and persist selected account correctly |
| 2 | Strict ownership validation for account/payee/view references | Yes — only submit user-owned IDs and handle stale selections |
| 3 | Missing-row mutations now return `not_found` instead of false success | Yes — change confirmation and error handling |
| 4 | Success should be driven by backend events | Yes — stop confirming writes before response events |
| 5 | Derived balances still require refetch after transaction mutations | Yes — refetch accounts/custom views when balances are visible |
