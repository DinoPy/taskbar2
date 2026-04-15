# Finance Module — Patch 001

**Date:** 2026-03-09
**Applies to:** `frontend_finance_ws_contract.md`

This patch covers backend fixes and a new event, plus frontend display corrections needed for transfers and credit card accounts.

---

## 1. New Event: `fin_account_unarchive`

Restores an archived account to active status.

**Request:**
```json
{
  "event": "fin_account_unarchive",
  "data": {
    "id": "<account-uuid>",
    "last_modified_at": 1741500000000
  }
}
```

**Broadcast:** `fin_account_unarchived`
```json
{
  "event": "fin_account_unarchived",
  "data": {
    "id": "<account-uuid>"
  }
}
```

**Frontend action:** Add an "Unarchive" option on archived accounts. On receiving `fin_account_unarchived`, set the account's `is_archived` to `false` and move it back to the active accounts list.

---

## 2. Fix: Credit Card / Loan Net Worth Calculation

**What changed:** The server now uses the **sign** of the computed balance instead of `abs()` to classify credit card and loan accounts in net worth.

| Computed Balance | Classification | Meaning |
|-----------------|---------------|---------|
| Negative | Liability | You owe the bank |
| Positive | Asset | You overpaid (bank owes you) |
| Zero | Neither | Fully settled |

This applies to both the daily snapshot (`TakeNetWorthSnapshotForUser`) and the live `GetCurrentNetWorth` query.

**Frontend action — initial balance UX:**
- When creating or editing a `credit_card` or `loan` account, clarify the sign convention for `initial_balance`:
  - **Negative** = outstanding debt (you owe this amount)
  - **Positive** = overpayment/credit (bank owes you)
  - **Zero** = no balance either way
- Consider adding helper text on the initial balance field, e.g.: *"Enter negative if you owe, positive if you overpaid"*

---

## 3. Fix: Transfer Transaction Display

**Context:** When a transfer is created via `fin_transfer_create`, the server creates two transactions:

| Transaction | `transaction_type` | `transfer_peer_id` | Account |
|------------|-------------------|-------------------|---------|
| Outgoing | `"transfer"` | Points to incoming | Source (money leaves) |
| Incoming | `"income"` | Points to outgoing | Destination (money arrives) |

Both store the `amount` as a **positive** value. The `transaction_type` determines the sign.

**Frontend bugs to fix:**

1. **Transaction type label:** Both transactions currently display as "Income". The frontend must read the `transaction_type` field and display it correctly:
   - `"transfer"` → display as "Transfer" (outgoing)
   - `"income"` with `transfer_peer_id` set → display as "Transfer" (incoming)

2. **Amount sign:** The displayed amount should reflect the direction:
   - `transaction_type = "transfer"` → show as **negative** (e.g. `-100.00`)
   - `transaction_type = "expense"` → show as **negative** (e.g. `-50.00`)
   - `transaction_type = "income"` → show as **positive** (e.g. `+100.00`)

3. **Transfer identification:** Use `transfer_peer_id` (non-null) or `category === "Transfer"` to identify transfer transactions and render them distinctly from regular income/expenses (e.g. show "Transfer to/from [account name]" using `transfer_account_id` to look up the other account).

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `fin_account_unarchive` event | Yes — add unarchive UI for archived accounts |
| 2 | Credit card net worth sign fix | Yes — clarify initial balance sign convention in UI |
| 3 | Transfer display bugs | Yes — fix transaction type label and amount sign |
