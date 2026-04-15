# Frontend Finance Module WebSocket Contract

This document is the authoritative frontend contract for the personal finance
module and all finance-related backend behavior currently implemented in the Go
server.

It covers:

- the `fin_account` data model and CRUD
- the `fin_transaction` data model, CRUD, and filtering
- the `fin_transfer` paired-transaction model
- the `fin_transaction_split` model
- the `fin_payee` data model, CRUD, and search
- the `fin_subscription` data model, CRUD, lifecycle, and confirmation
- the `fin_budget` and `fin_budget_category` models
- the report endpoints (spending, income vs expense, net worth, trends, payees)
- the `fin_categories` user preference
- the `fin_custom_view` data model and CRUD

All amounts are stored as `bigint` (cents). The frontend must convert between
cents and display currency. For example, `12345` means `123.45 RON`.

## 0) Transport And Realtime Model

All WebSocket messages use the standard envelope:

```json
{
  "event": "string",
  "data": {}
}
```

Finance client -> server events:

- `fin_account_create`
- `fin_account_edit`
- `fin_account_archive`
- `fin_account_delete`
- `fin_accounts_fetch`
- `fin_account_reorder`
- `fin_transaction_create`
- `fin_transaction_edit`
- `fin_transaction_delete`
- `fin_transactions_fetch`
- `fin_transfer_create`
- `fin_transaction_split_set`
- `fin_transaction_splits_fetch`
- `fin_payee_create`
- `fin_payee_edit`
- `fin_payee_delete`
- `fin_payees_fetch`
- `fin_payee_search`
- `fin_subscription_create`
- `fin_subscription_edit`
- `fin_subscription_delete`
- `fin_subscriptions_fetch`
- `fin_subscription_pause`
- `fin_subscription_resume`
- `fin_subscription_cancel`
- `fin_subscription_confirm`
- `fin_subscriptions_upcoming`
- `fin_subscriptions_summary`
- `fin_budget_set`
- `fin_budget_category_set`
- `fin_budget_category_delete`
- `fin_budget_fetch`
- `fin_budget_copy_previous`
- `fin_report_spending_by_category`
- `fin_report_income_vs_expense`
- `fin_report_net_worth`
- `fin_report_spending_trends`
- `fin_report_top_payees`
- `fin_categories_update`
- `fin_categories_fetch`
- `fin_custom_view_create`
- `fin_custom_view_edit`
- `fin_custom_view_delete`
- `fin_custom_views_fetch`
- `fin_custom_view_reorder`
- `fin_dashboard_fetch`
- `fin_dashboard_update`

Finance server -> client events:

- `fin_account_created` (broadcast)
- `fin_account_updated` (broadcast)
- `fin_account_archived` (broadcast)
- `fin_account_deleted` (broadcast)
- `fin_accounts_list` (unicast)
- `fin_accounts_reordered` (broadcast)
- `fin_transaction_created` (broadcast)
- `fin_transaction_updated` (broadcast)
- `fin_transaction_deleted` (broadcast)
- `fin_transactions_list` (unicast)
- `fin_transfer_created` (broadcast)
- `fin_transaction_split_updated` (broadcast)
- `fin_transaction_splits_list` (unicast)
- `fin_payee_created` (broadcast)
- `fin_payee_updated` (broadcast)
- `fin_payee_deleted` (broadcast)
- `fin_payees_list` (unicast)
- `fin_payee_results` (unicast)
- `fin_subscription_created` (broadcast)
- `fin_subscription_updated` (broadcast)
- `fin_subscription_deleted` (broadcast)
- `fin_subscriptions_list` (unicast)
- `fin_subscription_confirmed` (broadcast)
- `fin_subscriptions_upcoming` (unicast)
- `fin_subscriptions_summary` (unicast)
- `fin_budget_updated` (broadcast)
- `fin_budget_category_updated` (broadcast)
- `fin_budget_category_deleted` (broadcast)
- `fin_budget_data` (unicast)
- `fin_report_spending_by_category` (unicast)
- `fin_report_income_vs_expense` (unicast)
- `fin_report_net_worth` (unicast)
- `fin_report_spending_trends` (unicast)
- `fin_report_top_payees` (unicast)
- `fin_categories_updated` (broadcast)
- `fin_categories_data` (unicast)
- `fin_custom_view_created` (broadcast)
- `fin_custom_view_updated` (broadcast)
- `fin_custom_view_deleted` (broadcast)
- `fin_custom_views_list` (unicast)
- `fin_custom_views_reordered` (broadcast)
- `fin_dashboard_data` (unicast)
- `fin_dashboard_updated` (broadcast)
- `connection_error` (unicast, on validation/permission failures)

Delivery semantics:

- Events marked **(broadcast)** are sent to all sessions of the same user.
- Events marked **(unicast)** are sent only to the requesting session.
- All mutation success events are broadcast. All fetch/query results are unicast.

Common mutation timestamp rule:

- When a request includes `last_modified_at`, the frontend should send its
  client timestamp in epoch milliseconds.
- If the value is absent, zero, or negative, backend normalizes to server time.

Initial load rule:

- Finance data is not included in `connected`.
- Frontend must fetch on demand via `fin_accounts_fetch`, `fin_payees_fetch`,
  `fin_subscriptions_fetch`, `fin_transactions_fetch`, `fin_categories_fetch`,
  etc.
- After reconnect, re-issue fetches for any visible finance surface.

## 1) Data Structures

### 1.1 Nullable fields

Nullable UUID fields (`payee_id`, `transfer_peer_id`, `transfer_account_id`,
`account_id` on subscriptions) serialize as:

- present: `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"` (plain UUID string)
- absent: `null`

The frontend should send `null` or omit the field when no value is intended.

### 1.2 FinAccount

```ts
type FinAccount = {
  id: string              // uuid
  user_id: string         // uuid
  name: string
  account_type: string    // "checking" | "savings" | "credit_card" | "cash" | "deposit" | "loan" | "investment"
  currency: string        // default "RON"
  initial_balance: number // bigint cents
  icon: string            // default "wallet"
  color: string           // default "#4A90D9"
  notes: string
  is_archived: boolean
  position: number        // int32, ordering
  created_at: string      // RFC3339
  updated_at: string      // RFC3339
  last_modified_at: number // epoch millis
}
```

### 1.3 FinAccountWithBalance

Returned by `fin_accounts_fetch`. Extends `FinAccount` with a computed field:

```ts
type FinAccountWithBalance = FinAccount & {
  computed_balance: number // bigint cents: initial_balance + income - expense - transfers
}
```

Balance is always computed on read. There is no stored balance column.

### 1.4 FinTransaction

```ts
type FinTransaction = {
  id: string                   // uuid
  user_id: string              // uuid
  account_id: string           // uuid
  transaction_type: string     // "income" | "expense" | "transfer"
  amount: number               // bigint cents, always positive
  date: string                 // RFC3339
  description: string
  category: string             // default "Uncategorized"
  tags: string[]               // default []
  payee_id: string | null      // uuid or null
  notes: string
  transfer_peer_id: string | null    // uuid of the paired transfer transaction, or null
  transfer_account_id: string | null // uuid of the other account in a transfer, or null
  is_split: boolean
  created_at: string           // RFC3339
  updated_at: string           // RFC3339
  last_modified_at: number     // epoch millis
}
```

Key design notes:

- `amount` is always positive. Direction is determined by `transaction_type`.
- Transfers create two linked transactions (see section 3.8).
- `transfer_peer_id` and `transfer_account_id` are only set on transfer
  transactions.

### 1.5 FinTransactionSplit

```ts
type FinTransactionSplit = {
  id: string            // uuid
  transaction_id: string // uuid
  category: string
  amount: number        // bigint cents
  notes: string
  created_at: string    // RFC3339
}
```

Splits break a single transaction into category line items. When `is_split` is
true, the transaction's category-level breakdown comes from its splits, not from
the transaction's own `category` field.

### 1.6 FinPayee

```ts
type FinPayee = {
  id: string        // uuid
  user_id: string   // uuid
  name: string      // unique per user
  notes: string
  created_at: string // RFC3339
  updated_at: string // RFC3339
}
```

### 1.7 FinSubscription

```ts
type FinSubscription = {
  id: string                     // uuid
  user_id: string                // uuid
  name: string
  amount: number                 // bigint cents
  currency: string               // default "RON"
  frequency: string              // "weekly" | "monthly" | "yearly" | "custom"
  frequency_interval: number     // int32, e.g. 2 means "every 2 months"
  next_due_date: string          // date (YYYY-MM-DD) in RFC3339 format
  category: string               // default "Uncategorized"
  account_id: string | null      // uuid, linked account for auto-create
  payee_id: string | null        // uuid
  status: string                 // "active" | "paused" | "cancelled"
  notes: string
  auto_create_transaction: boolean // if true, cron creates expense when due
  icon: string                   // default "repeat"
  color: string                  // default "#4A90D9"
  created_at: string             // RFC3339
  updated_at: string             // RFC3339
  last_modified_at: number       // epoch millis
}
```

Due date advancement rules:

- `weekly`: `next_due_date + (frequency_interval * 7) days`
- `monthly`: `next_due_date + frequency_interval months`
- `yearly`: `next_due_date + frequency_interval years`
- `custom`: `next_due_date + frequency_interval days`

### 1.8 FinBudget

```ts
type FinBudget = {
  id: string           // uuid
  user_id: string      // uuid
  year: number         // int32
  month: number        // int32, 1-12
  created_at: string   // RFC3339
  updated_at: string   // RFC3339
  last_modified_at: number // epoch millis
}
```

A budget is uniquely identified by `(user_id, year, month)`.

### 1.9 FinBudgetCategory

```ts
type FinBudgetCategory = {
  id: string           // uuid
  budget_id: string    // uuid
  category: string
  budgeted_amount: number // bigint cents
  rollover: boolean
  rollover_amount: number // bigint cents, carried from previous month
  created_at: string   // RFC3339
  updated_at: string   // RFC3339
}
```

### 1.10 FinBudgetCategoryWithActuals

Returned by `fin_budget_fetch`. Adds actual spending for the budget period:

```ts
type FinBudgetCategoryWithActuals = {
  id: string
  budget_id: string
  category: string
  budgeted_amount: number  // bigint cents
  rollover: boolean
  rollover_amount: number  // bigint cents
  actual_amount: number    // bigint cents, sum of expense transactions in this category for the month
}
```

### 1.11 FinNetWorthSnapshot

```ts
type FinNetWorthSnapshot = {
  id: string              // uuid
  user_id: string         // uuid
  snapshot_date: string   // RFC3339 (Go time.Time serialized as full timestamp, e.g. "2026-03-07T00:00:00Z")
  total_assets: number    // bigint cents
  total_liabilities: number // bigint cents
  net_worth: number       // bigint cents
  breakdown: AccountSnapshot[] // JSON array stored as jsonb, parsed automatically
  created_at: string      // RFC3339
}

type AccountSnapshot = {
  account_id: string
  account_name: string
  account_type: string
  balance: number         // bigint cents
}
```

### 1.12 SubscriptionSummary

```ts
type SubscriptionSummary = {
  frequency: string      // "weekly" | "monthly" | "yearly" | "custom"
  count: number          // number of active subscriptions
  total_amount: number   // bigint cents, sum of amounts for this frequency
}
```

## 2) Accounts

### 2.1 `fin_account_create`

Request:

```json
{
  "event": "fin_account_create",
  "data": {
    "name": "Main Checking",
    "account_type": "checking",
    "currency": "RON",
    "initial_balance": 500000,
    "icon": "bank",
    "color": "#4A90D9",
    "notes": "",
    "position": 0,
    "last_modified_at": 1700000000000
  }
}
```

Required fields:

- `name` (non-empty after trim)
- `account_type` (must be one of: `checking`, `savings`, `credit_card`, `cash`,
  `deposit`, `loan`, `investment`)

Defaults:

- `currency`: `"RON"` if empty
- `icon`: `"wallet"` if empty
- `color`: `"#4A90D9"` if empty

Success: broadcast `fin_account_created` with full `FinAccount`.

### 2.2 `fin_account_edit`

Request:

```json
{
  "event": "fin_account_edit",
  "data": {
    "id": "uuid",
    "name": "Main Checking",
    "account_type": "checking",
    "currency": "RON",
    "initial_balance": 500000,
    "icon": "bank",
    "color": "#4A90D9",
    "notes": "Primary account",
    "last_modified_at": 1700000000000
  }
}
```

Required fields: `id`, `name`, `account_type`.

Success: broadcast `fin_account_updated` with full `FinAccount`.

Errors: `not_found` / 404 if account doesn't exist or belongs to another user.

### 2.3 `fin_account_archive`

Request:

```json
{
  "event": "fin_account_archive",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000000
  }
}
```

Success: broadcast `fin_account_archived`:

```json
{
  "event": "fin_account_archived",
  "data": {
    "id": "uuid"
  }
}
```

### 2.4 `fin_account_delete`

Request:

```json
{
  "event": "fin_account_delete",
  "data": {
    "id": "uuid"
  }
}
```

Success: broadcast `fin_account_deleted`:

```json
{
  "event": "fin_account_deleted",
  "data": {
    "id": "uuid"
  }
}
```

Behavior: deleting an account cascades to all its transactions.

### 2.5 `fin_accounts_fetch`

Request:

```json
{
  "event": "fin_accounts_fetch",
  "data": {}
}
```

Success: unicast `fin_accounts_list`:

```json
{
  "event": "fin_accounts_list",
  "data": [<FinAccountWithBalance>, ...]
}
```

Order: non-archived first, then by `position ASC`, then `created_at ASC`.

### 2.6 `fin_account_reorder`

Request:

```json
{
  "event": "fin_account_reorder",
  "data": {
    "orders": [
      { "id": "uuid-1", "position": 0 },
      { "id": "uuid-2", "position": 1 },
      { "id": "uuid-3", "position": 2 }
    ],
    "last_modified_at": 1700000000000
  }
}
```

Success: broadcast `fin_accounts_reordered`:

```json
{
  "event": "fin_accounts_reordered",
  "data": [
    { "id": "uuid-1", "position": 0 },
    { "id": "uuid-2", "position": 1 },
    { "id": "uuid-3", "position": 2 }
  ]
}
```

## 3) Transactions

### 3.1 `fin_transaction_create`

Request:

```json
{
  "event": "fin_transaction_create",
  "data": {
    "account_id": "uuid",
    "transaction_type": "expense",
    "amount": 15099,
    "date": "2026-03-07T10:00:00Z",
    "description": "Grocery shopping",
    "category": "Food",
    "tags": ["groceries"],
    "payee_id": "uuid-or-null",
    "notes": "",
    "last_modified_at": 1700000000000
  }
}
```

Required fields:

- `account_id` (non-nil)
- `transaction_type` (must be `income` or `expense` — `transfer` is **rejected**
  with 400; use `fin_transfer_create` instead, section 3.7)
- `amount` (must be > 0)

Defaults:

- `category`: `"Uncategorized"` if empty
- `tags`: `[]` if null

`payee_id`: send `null` or omit if no payee. Send a UUID string to link a payee.

Success: broadcast `fin_transaction_created` with full `FinTransaction`.

### 3.2 `fin_transaction_edit`

Request:

```json
{
  "event": "fin_transaction_edit",
  "data": {
    "id": "uuid",
    "transaction_type": "expense",
    "amount": 15099,
    "date": "2026-03-07T10:00:00Z",
    "description": "Grocery shopping (updated)",
    "category": "Food",
    "tags": ["groceries"],
    "payee_id": "uuid-or-null",
    "notes": "Updated note",
    "is_split": false,
    "last_modified_at": 1700000000000
  }
}
```

Required fields: `id`, `transaction_type`, `amount` (> 0).

Edit does not change the `account_id`. To move a transaction between accounts,
delete and recreate.

Edit does not modify `transfer_peer_id` or `transfer_account_id`. These are
managed by the transfer system.

Success: broadcast `fin_transaction_updated` with full `FinTransaction`.

### 3.3 `fin_transaction_delete`

Request:

```json
{
  "event": "fin_transaction_delete",
  "data": {
    "id": "uuid"
  }
}
```

Behavior: if the transaction is part of a transfer pair, the peer transaction
is also deleted automatically.

Success: broadcast `fin_transaction_deleted`:

```json
{
  "event": "fin_transaction_deleted",
  "data": {
    "id": "uuid",
    "transfer_peer_id": "uuid-or-null"
  }
}
```

Frontend must remove both `id` and `transfer_peer_id` (if non-null) from its
local transaction store.

### 3.4 `fin_transactions_fetch`

Request:

```json
{
  "event": "fin_transactions_fetch",
  "data": {
    "account_id": "uuid-or-null",
    "date_from": "2026-01-01T00:00:00Z",
    "date_to": "2026-03-31T23:59:59Z",
    "category": "Food",
    "search_text": "grocery",
    "limit": 50,
    "offset": 0
  }
}
```

All filter fields are optional. Omit or send `null` to skip a filter.

- `account_id`: filter to a specific account
- `date_from` / `date_to`: date range filter (inclusive)
- `category`: exact category match
- `search_text`: case-insensitive search in `description` and `notes` (special
  characters `%`, `_`, `\` are escaped server-side)
- `limit`: default 50
- `offset`: default 0

Success: unicast `fin_transactions_list`:

```json
{
  "event": "fin_transactions_list",
  "data": [<FinTransaction>, ...]
}
```

Order: `date DESC`, then `created_at DESC`.

Note: No `total_count` is returned. The frontend should use "load more"
(infinite scroll) pagination: request the next page when the current page
returns exactly `limit` results, and stop when fewer results are returned.

### 3.5 `fin_transaction_split_set`

Replaces all splits on a transaction. Send an empty array to clear splits.

Request:

```json
{
  "event": "fin_transaction_split_set",
  "data": {
    "transaction_id": "uuid",
    "splits": [
      { "category": "Food", "amount": 10000, "notes": "" },
      { "category": "Drinks", "amount": 5099, "notes": "Coffee" }
    ],
    "last_modified_at": 1700000000000
  }
}
```

Behavior:

- Deletes all existing splits for the transaction.
- Creates new splits from the array.
- Sets `is_split = true` if splits array is non-empty, `false` if empty.
- Split amounts should sum to the transaction amount (not enforced server-side,
  but recommended client-side).

Success: broadcast `fin_transaction_split_updated`:

```json
{
  "event": "fin_transaction_split_updated",
  "data": {
    "transaction_id": "uuid",
    "splits": [<FinTransactionSplit>, ...],
    "is_split": true
  }
}
```

### 3.6 `fin_transaction_splits_fetch`

Fetches the split line items for a specific transaction.

Request:

```json
{
  "event": "fin_transaction_splits_fetch",
  "data": {
    "transaction_id": "uuid"
  }
}
```

Required: `transaction_id` (must belong to the requesting user).

Success: unicast `fin_transaction_splits_list`:

```json
{
  "event": "fin_transaction_splits_list",
  "data": [<FinTransactionSplit>, ...]
}
```

Returns `[]` (empty array) if the transaction has no splits.

### 3.7 `fin_transfer_create`

Creates a paired transfer between two accounts. This is the only way to create
transfer transactions.

Request:

```json
{
  "event": "fin_transfer_create",
  "data": {
    "from_account_id": "uuid",
    "to_account_id": "uuid",
    "amount": 100000,
    "date": "2026-03-07T10:00:00Z",
    "description": "Move to savings",
    "notes": "",
    "last_modified_at": 1700000000000
  }
}
```

Required fields:

- `from_account_id` (non-nil)
- `to_account_id` (non-nil, must differ from `from_account_id`)
- `amount` (must be > 0)

Behavior:

- Creates two linked transactions in a single atomic operation.
- **Outgoing** (on `from_account_id`): `transaction_type = "transfer"`,
  `transfer_account_id = to_account_id`, `category = "Transfer"`.
- **Incoming** (on `to_account_id`): `transaction_type = "income"`,
  `transfer_account_id = from_account_id`, `category = "Transfer"`.
- Both transactions are linked via `transfer_peer_id`.

Success: broadcast `fin_transfer_created`:

```json
{
  "event": "fin_transfer_created",
  "data": {
    "outgoing": <FinTransaction>,
    "incoming": <FinTransaction>
  }
}
```

Frontend should add both transactions to its store. The outgoing transaction
reduces the source account balance; the incoming transaction increases the
destination account balance.

## 4) Payees

### 4.1 `fin_payee_create`

Request:

```json
{
  "event": "fin_payee_create",
  "data": {
    "name": "Lidl",
    "notes": "Grocery store"
  }
}
```

Required: `name` (non-empty after trim).

Payee names are unique per user. Duplicate names return `conflict` / 409.

Success: broadcast `fin_payee_created` with full `FinPayee`.

### 4.2 `fin_payee_edit`

Request:

```json
{
  "event": "fin_payee_edit",
  "data": {
    "id": "uuid",
    "name": "Lidl Romania",
    "notes": "Updated note"
  }
}
```

Required: `id`, `name`.

Success: broadcast `fin_payee_updated` with full `FinPayee`.

Errors: `not_found` / 404, `conflict` / 409 for duplicate name.

### 4.3 `fin_payee_delete`

Request:

```json
{
  "event": "fin_payee_delete",
  "data": {
    "id": "uuid"
  }
}
```

Behavior: deleting a payee sets `payee_id = null` on all linked transactions
(does not delete transactions).

Success: broadcast `fin_payee_deleted`:

```json
{
  "event": "fin_payee_deleted",
  "data": {
    "id": "uuid"
  }
}
```

### 4.4 `fin_payees_fetch`

Request:

```json
{
  "event": "fin_payees_fetch",
  "data": {}
}
```

Success: unicast `fin_payees_list`:

```json
{
  "event": "fin_payees_list",
  "data": [<FinPayee>, ...]
}
```

Order: `name ASC`.

### 4.5 `fin_payee_search`

Request:

```json
{
  "event": "fin_payee_search",
  "data": {
    "search_query": "lid",
    "limit": 20
  }
}
```

- `search_query`: case-insensitive search on name (special characters `%`, `_`,
  `\` are escaped server-side).
- `limit`: default 20. Optional.

Prefix matches sort before non-prefix matches, then alphabetically.

Success: unicast `fin_payee_results`:

```json
{
  "event": "fin_payee_results",
  "data": [<FinPayee>, ...]
}
```

## 5) Subscriptions

### 5.1 `fin_subscription_create`

Request:

```json
{
  "event": "fin_subscription_create",
  "data": {
    "name": "Netflix",
    "amount": 4999,
    "currency": "RON",
    "frequency": "monthly",
    "frequency_interval": 1,
    "next_due_date": "2026-04-01T00:00:00Z",
    "category": "Entertainment",
    "account_id": "uuid-or-null",
    "payee_id": "uuid-or-null",
    "notes": "",
    "auto_create_transaction": true,
    "icon": "tv",
    "color": "#E74C3C",
    "last_modified_at": 1700000000000
  }
}
```

Required fields:

- `name` (non-empty after trim)
- `amount` (must be > 0)
- `frequency` (one of: `weekly`, `monthly`, `yearly`, `custom`)

Defaults:

- `currency`: `"RON"` if empty
- `frequency_interval`: `1` if <= 0
- `category`: `"Uncategorized"` if empty
- `icon`: `"repeat"` if empty
- `color`: `"#4A90D9"` if empty
- `status` is always `"active"` on create

Success: broadcast `fin_subscription_created` with full `FinSubscription`.

### 5.2 `fin_subscription_edit`

Request: same shape as create, with added `id` field. All fields are replaced.

```json
{
  "event": "fin_subscription_edit",
  "data": {
    "id": "uuid",
    "name": "Netflix Premium",
    "amount": 7999,
    "currency": "RON",
    "frequency": "monthly",
    "frequency_interval": 1,
    "next_due_date": "2026-04-01T00:00:00Z",
    "category": "Entertainment",
    "account_id": "uuid-or-null",
    "payee_id": "uuid-or-null",
    "notes": "Upgraded plan",
    "auto_create_transaction": true,
    "icon": "tv",
    "color": "#E74C3C",
    "last_modified_at": 1700000000000
  }
}
```

Edit does not change `status`. Use the dedicated status events instead.

Success: broadcast `fin_subscription_updated` with full `FinSubscription`.

### 5.3 `fin_subscription_delete`

Request:

```json
{
  "event": "fin_subscription_delete",
  "data": {
    "id": "uuid"
  }
}
```

Success: broadcast `fin_subscription_deleted`:

```json
{
  "event": "fin_subscription_deleted",
  "data": {
    "id": "uuid"
  }
}
```

### 5.4 `fin_subscriptions_fetch`

Request:

```json
{
  "event": "fin_subscriptions_fetch",
  "data": {}
}
```

Success: unicast `fin_subscriptions_list`:

```json
{
  "event": "fin_subscriptions_list",
  "data": [<FinSubscription>, ...]
}
```

Order: `status ASC` (active first, then paused, then cancelled), then
`next_due_date ASC`.

### 5.5 `fin_subscription_pause`

Sets status to `"paused"`.

Request:

```json
{
  "event": "fin_subscription_pause",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000000
  }
}
```

Success: broadcast `fin_subscription_updated` with full `FinSubscription`
(status will be `"paused"`).

### 5.6 `fin_subscription_resume`

Sets status to `"active"`.

Request:

```json
{
  "event": "fin_subscription_resume",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000000
  }
}
```

Success: broadcast `fin_subscription_updated` with full `FinSubscription`
(status will be `"active"`).

### 5.7 `fin_subscription_cancel`

Sets status to `"cancelled"`.

Request:

```json
{
  "event": "fin_subscription_cancel",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000000
  }
}
```

Success: broadcast `fin_subscription_updated` with full `FinSubscription`
(status will be `"cancelled"`).

### 5.8 `fin_subscription_confirm`

Manually confirms a subscription payment. Creates an expense transaction (if
`account_id` is set) and advances `next_due_date`.

Request:

```json
{
  "event": "fin_subscription_confirm",
  "data": {
    "id": "uuid",
    "last_modified_at": 1700000000000
  }
}
```

Behavior:

- If `account_id` is set on the subscription, creates an expense transaction:
  - `transaction_type = "expense"`
  - `amount` = subscription amount
  - `date` = now
  - `description` = subscription name
  - `category` = subscription category
  - `payee_id` = subscription payee_id
  - `notes` = `"Subscription payment: <name>"`
- Advances `next_due_date` according to frequency rules (section 1.7).
- If `account_id` is not set, only advances the due date (no transaction
  created).

Success: broadcast `fin_subscription_confirmed`:

```json
{
  "event": "fin_subscription_confirmed",
  "data": {
    "subscription": <FinSubscription>,
    "transaction": <FinTransaction> | null
  }
}
```

Frontend should:
- Update the subscription in its store (new `next_due_date`).
- If `transaction` is non-null, add it to the transaction store.

### 5.9 `fin_subscriptions_upcoming`

Request:

```json
{
  "event": "fin_subscriptions_upcoming",
  "data": {
    "days_ahead": 30
  }
}
```

- `days_ahead`: number of days to look ahead. Default 30 if <= 0.

Returns only active subscriptions due within the window.

Success: unicast `fin_subscriptions_upcoming`:

```json
{
  "event": "fin_subscriptions_upcoming",
  "data": [<FinSubscription>, ...]
}
```

Order: `next_due_date ASC`.

### 5.10 `fin_subscriptions_summary`

Request:

```json
{
  "event": "fin_subscriptions_summary",
  "data": {}
}
```

Returns active subscriptions grouped by frequency with total amounts.

Success: unicast `fin_subscriptions_summary`:

```json
{
  "event": "fin_subscriptions_summary",
  "data": [<SubscriptionSummary>, ...]
}
```

### 5.11 Auto-create subscription cron

Backend runs a cron job every minute that checks for active subscriptions where
`auto_create_transaction = true` and `next_due_date <= today`.

For each matching subscription with a valid `account_id`:
- Creates an expense transaction and advances `next_due_date` atomically
  (both succeed or neither does).

These auto-created transactions are **not** broadcast via WebSocket. The
frontend will see them on the next `fin_transactions_fetch`.

## 6) Budgets

### 6.1 `fin_budget_set`

Creates or updates a monthly budget period. Uses upsert — safe to call even if
the budget already exists.

Request:

```json
{
  "event": "fin_budget_set",
  "data": {
    "year": 2026,
    "month": 3,
    "last_modified_at": 1700000000000
  }
}
```

Validation: `year` must be 2000-2100, `month` must be 1-12.

Success: broadcast `fin_budget_updated`:

```json
{
  "event": "fin_budget_updated",
  "data": {
    "budget": <FinBudget>,
    "categories": [<FinBudgetCategoryWithActuals>, ...] | null
  }
}
```

Note: `categories` may be `null` or empty if no category lines exist yet.
This shape is consistent across `fin_budget_set` and `fin_budget_copy_previous`.

### 6.2 `fin_budget_category_set`

Creates or updates a budget category line. Uses upsert on `(budget_id,
category)`.

Request:

```json
{
  "event": "fin_budget_category_set",
  "data": {
    "budget_id": "uuid",
    "category": "Food",
    "budgeted_amount": 200000,
    "rollover": false,
    "rollover_amount": 0
  }
}
```

Required: `budget_id`, `category` (non-empty after trim).

The `budget_id` must belong to the requesting user. If it doesn't, the
operation silently does nothing (no row inserted/updated, no error).

Success: broadcast `fin_budget_category_updated` with full
`FinBudgetCategory`.

### 6.3 `fin_budget_category_delete`

Request:

```json
{
  "event": "fin_budget_category_delete",
  "data": {
    "id": "uuid",
    "budget_id": "uuid"
  }
}
```

Success: broadcast `fin_budget_category_deleted`:

```json
{
  "event": "fin_budget_category_deleted",
  "data": {
    "id": "uuid",
    "budget_id": "uuid"
  }
}
```

### 6.4 `fin_budget_fetch`

Fetches a budget for a specific month with actual spending per category.

Request:

```json
{
  "event": "fin_budget_fetch",
  "data": {
    "year": 2026,
    "month": 3
  }
}
```

Success: unicast `fin_budget_data`:

If budget exists:

```json
{
  "event": "fin_budget_data",
  "data": {
    "budget": <FinBudget>,
    "categories": [<FinBudgetCategoryWithActuals>, ...]
  }
}
```

If no budget exists for the month:

```json
{
  "event": "fin_budget_data",
  "data": {
    "budget": null,
    "categories": null
  }
}
```

Categories are ordered alphabetically by `category`.

The `actual_amount` field contains the sum of expense transactions in that
category for the budget's year/month period.

### 6.5 `fin_budget_copy_previous`

Copies budget category lines from the previous month into the target month.

Request:

```json
{
  "event": "fin_budget_copy_previous",
  "data": {
    "year": 2026,
    "month": 3,
    "last_modified_at": 1700000000000
  }
}
```

Behavior:

- Automatically creates the target budget if it doesn't exist.
- Calculates previous month (handles January -> December year rollback).
- Copies category names and budgeted amounts from previous month.
- Sets `rollover_amount` to 0 on copied categories.
- Uses `ON CONFLICT DO NOTHING` — existing categories in the target month are
  not overwritten.

If no previous month budget exists: returns `not_found` / 404.

Success: broadcast `fin_budget_updated` with the same `{ budget, categories }`
shape as `fin_budget_set` (see section 6.1). Categories here are the newly
copied lines. To get the full budget with actuals, the frontend should follow
up with `fin_budget_fetch`.

## 7) Reports

All report endpoints are unicast (sent only to the requesting session).

### 7.1 `fin_report_spending_by_category`

Request:

```json
{
  "event": "fin_report_spending_by_category",
  "data": {
    "date_from": "2026-01-01T00:00:00Z",
    "date_to": "2026-03-31T23:59:59Z"
  }
}
```

Success:

```json
{
  "event": "fin_report_spending_by_category",
  "data": [
    {
      "category": "Food",
      "total_amount": 450000,
      "transaction_count": 23
    },
    ...
  ]
}
```

Fields: `total_amount` is `bigint` cents. `transaction_count` is an integer
(Go `int64`, serialized as JSON number — safe up to 2^53 in JS).

Only includes expense transactions. Order: `total_amount DESC`.

### 7.2 `fin_report_income_vs_expense`

Request:

```json
{
  "event": "fin_report_income_vs_expense",
  "data": {
    "date_from": "2026-01-01T00:00:00Z",
    "date_to": "2026-03-31T23:59:59Z"
  }
}
```

Success:

```json
{
  "event": "fin_report_income_vs_expense",
  "data": {
    "total_income": 1500000,
    "total_expense": 980000
  }
}
```

### 7.3 `fin_report_net_worth`

Request:

```json
{
  "event": "fin_report_net_worth",
  "data": {
    "date_from": "2025-01-01T00:00:00Z",
    "date_to": "2026-03-07T00:00:00Z"
  }
}
```

Success:

```json
{
  "event": "fin_report_net_worth",
  "data": {
    "history": [<FinNetWorthSnapshot>, ...],
    "total_assets": 5000000,
    "total_liabilities": 200000,
    "net_worth": 4800000
  }
}
```

`history` contains daily snapshots from the `fin_net_worth_snapshots` table.

`total_assets`, `total_liabilities`, and `net_worth` are computed live from
current account balances (not from snapshots).

Asset accounts: `checking`, `savings`, `cash`, `deposit`, `investment`.
Liability accounts: `credit_card`, `loan`.

Net worth snapshots are created daily at 2 AM by a cron job.

### 7.4 `fin_report_spending_trends`

Monthly spending totals over time.

Request:

```json
{
  "event": "fin_report_spending_trends",
  "data": {
    "date_from": "2025-01-01T00:00:00Z",
    "date_to": "2026-03-31T23:59:59Z"
  }
}
```

Success:

```json
{
  "event": "fin_report_spending_trends",
  "data": [
    { "year": 2025, "month": 1, "total_amount": 450000 },
    { "year": 2025, "month": 2, "total_amount": 380000 },
    ...
  ]
}
```

Only includes expense transactions. Order: chronological.

### 7.5 `fin_report_top_payees`

Request:

```json
{
  "event": "fin_report_top_payees",
  "data": {
    "date_from": "2026-01-01T00:00:00Z",
    "date_to": "2026-03-31T23:59:59Z",
    "limit": 10
  }
}
```

- `limit`: default 10. Optional.

Only includes expense transactions with a linked payee.

Success:

```json
{
  "event": "fin_report_top_payees",
  "data": [
    {
      "payee_id": "uuid",
      "payee_name": "Lidl",
      "total_amount": 250000,
      "transaction_count": 15
    },
    ...
  ]
}
```

Order: `total_amount DESC`.

## 8) Finance Categories

User-level category preference storage for the finance module.

### 8.1 `fin_categories_fetch`

Request:

```json
{
  "event": "fin_categories_fetch",
  "data": {}
}
```

Success: unicast `fin_categories_data`:

```json
{
  "event": "fin_categories_data",
  "data": {
    "categories": "Food,Transport,Entertainment,Utilities,Shopping,Health"
  }
}
```

The `categories` field is a plain string (empty string `""` if never set).
The frontend defines its own parsing format (e.g., comma-separated).

Note: `fin_categories` is **not** included in the `connected` event. The
frontend must call `fin_categories_fetch` when entering the finance module.

### 8.2 `fin_categories_update`

Request:

```json
{
  "event": "fin_categories_update",
  "data": {
    "categories": "Food,Transport,Entertainment,Utilities,Shopping,Health"
  }
}
```

The `categories` field is a plain string. The frontend defines its own
serialization format (e.g., comma-separated). The backend stores it as-is.

Success: broadcast `fin_categories_updated`:

```json
{
  "event": "fin_categories_updated",
  "data": {
    "categories": "Food,Transport,Entertainment,Utilities,Shopping,Health"
  }
}
```

To read categories on load, use `fin_categories_fetch` (section 8.1).

## 9) Error Contract

All finance handlers use the standard `connection_error` envelope:

```json
{
  "event": "connection_error",
  "data": {
    "type": "invalid_data",
    "message": "Human readable reason",
    "code": 400
  }
}
```

Error types used by finance handlers:

| Type | Code | When |
|------|------|------|
| `invalid_data` | 400 | Missing required field, invalid enum value, amount <= 0, invalid JSON |
| `not_found` | 404 | Entity doesn't exist or belongs to another user |
| `conflict` | 409 | Duplicate payee name |
| `database_error` | 500 | Unexpected persistence failure |

## 10) Frontend State Rules

### 10.1 Fetch and reconnect

- Finance data is not part of `connected`. Fetch on demand.
- After reconnect, re-issue fetches for any visible finance surface.
- Accounts: `fin_accounts_fetch` on entering the finance module.
- Transactions: `fin_transactions_fetch` with current filters.
- Subscriptions: `fin_subscriptions_fetch` on entering subscriptions screen.
- Budgets: `fin_budget_fetch` for the current month.
- Payees: `fin_payees_fetch` or `fin_payee_search` as needed.
- Categories: `fin_categories_fetch` on entering the finance module.

### 10.2 Balance updates

Account balances are computed on-read. After any transaction mutation
(create/edit/delete/transfer), the frontend should either:

- Refetch accounts via `fin_accounts_fetch` to get updated balances, or
- Compute balances locally by adjusting based on the transaction change.

### 10.3 Transfer handling

When receiving `fin_transfer_created`, add both `outgoing` and `incoming`
transactions to the store.

When receiving `fin_transaction_deleted` with a non-null `transfer_peer_id`,
remove both transactions from the store.

### 10.4 Subscription confirmation

When receiving `fin_subscription_confirmed`:
- Update the subscription (new `next_due_date`, same `status`).
- If `transaction` is non-null, add it to the transaction store.
- Optionally refetch account balances.

### 10.5 Budget actuals

Budget actuals (`actual_amount`) are computed from expense transactions for the
budget's month. After adding/editing/deleting transactions in a budgeted month,
refetch the budget via `fin_budget_fetch` to get updated actuals.

### 10.6 Optimistic updates

- The frontend may apply optimistic state for all mutations.
- On success, replace with the authoritative broadcast payload.
- On `connection_error`, revert optimistic state.
- On `database_error` (500), revert and refetch.

### 10.7 Refetching accounts after transaction mutations

Account balances are computed from transactions. Any transaction mutation
(create, edit, delete — not just transfers) changes account balances. The
frontend should refetch accounts via `fin_accounts_fetch` after any
`fin_transaction_created`, `fin_transaction_updated`,
`fin_transaction_deleted`, or `fin_transfer_created` event. The backend does
not auto-broadcast updated account balances when transactions change.

## 11) FAQ / Clarifications

### Q1: `computed_balance` vs `balance` field name

The server serializes the field as **`computed_balance`** (JSON tag
`json:"computed_balance"`). This field is only present on
`FinAccountWithBalance` (returned by `fin_accounts_fetch`). The base
`FinAccount` returned by create/edit events does not include it.

### Q2: Can `fin_account_edit` change `initial_balance`?

Yes. Editing `initial_balance` on an existing account is fully supported. The
handler accepts `initial_balance` in the edit payload and passes it to the
database update. The computed balance will recalculate automatically on the
next `fin_accounts_fetch`. The frontend form can show `initial_balance` on
both create and edit screens.

### Q3: Does `fin_payee_edit` need `last_modified_at`?

No. Payees do not have a `last_modified_at` column in the database. The edit
handler only reads `id`, `name`, and `notes`. Do not send `last_modified_at`
for payee mutations. This is intentional — payees are simple entities without
optimistic concurrency control.

### Q4: Does `fin_subscription_delete` need `last_modified_at`?

No. The delete handler only reads `id` from the payload. If `last_modified_at`
is sent, it is silently ignored (Go's JSON unmarshalling skips unknown fields).
No validation error occurs. You can safely omit it.

### Q5: `fin_transaction_splits_list` response shape

The response is a **direct array**: `[<FinTransactionSplit>, ...]`. It is NOT
wrapped in `{ transaction_id, splits }`. Since this is a unicast response to
the session that requested it, the frontend should track which
`transaction_id` it asked about client-side (e.g., store the ID before sending
the request and match it when the response arrives). Each split object does
contain a `transaction_id` field, so you can also read it from the first
element of the array if non-empty.

### Q6: `fin_payee_results` response shape

The response is always a **direct array**: `[<FinPayee>, ...]`. It is never
wrapped in an object. Remove any `data.payees` fallback — the data payload is
the array itself.

### Q7: Should the frontend refetch accounts after transaction mutations?

Yes. See section 10.7. Any transaction create/edit/delete changes account
balances. The backend does not automatically broadcast updated balances when
transactions change. The frontend should refetch accounts after any
transaction mutation, not just transfers.

### Q8: Can `fin_categories_data.categories` be null?

No. The `categories` field is always a `string`. The database column is
`text NOT NULL DEFAULT ''`. For a new user who has never set categories, the
value will be an empty string `""`. It is never `null` and never missing from
the response. The response is always `{ "categories": "..." }`.

---

## 12) Custom Balance Views

Custom views let users group selected accounts and see a combined balance (e.g. "Daily Spending" showing only checking + cash accounts).

### 12.1 Data Model

```
FinCustomView {
  id:               UUID
  user_id:          UUID
  name:             string
  account_ids:      UUID[]        // references fin_accounts.id
  position:         int32
  created_at:       timestamp
  updated_at:       timestamp
  last_modified_at: int64
}
```

### 12.2 `fin_custom_view_create`

```json
{
  "event": "fin_custom_view_create",
  "data": {
    "name": "Daily Spending",
    "account_ids": ["<account-uuid-1>", "<account-uuid-2>"],
    "position": 0,
    "last_modified_at": 1741500000000
  }
}
```

**Validation:**
- `name` is required (trimmed, non-empty)
- `account_ids` defaults to `[]` if omitted

**Broadcast:** `fin_custom_view_created` with the full `FinCustomView` object.

### 12.3 `fin_custom_view_edit`

```json
{
  "event": "fin_custom_view_edit",
  "data": {
    "id": "<view-uuid>",
    "name": "Updated Name",
    "account_ids": ["<account-uuid-1>", "<account-uuid-3>"],
    "last_modified_at": 1741500000000
  }
}
```

**Broadcast:** `fin_custom_view_updated` with the full `FinCustomView` object.

### 12.4 `fin_custom_view_delete`

```json
{
  "event": "fin_custom_view_delete",
  "data": {
    "id": "<view-uuid>",
    "last_modified_at": 1741500000000
  }
}
```

**Broadcast:** `fin_custom_view_deleted` with `{ "id": "<view-uuid>" }`.

### 12.5 `fin_custom_views_fetch`

```json
{
  "event": "fin_custom_views_fetch",
  "data": {}
}
```

**Response:** `fin_custom_views_list` — array of `FinCustomView` objects, each with an additional `computed_balance` field (bigint, in cents) representing the sum of all selected accounts' balances.

```json
{
  "event": "fin_custom_views_list",
  "data": [
    {
      "id": "<view-uuid>",
      "user_id": "<user-uuid>",
      "name": "Daily Spending",
      "account_ids": ["<account-uuid-1>", "<account-uuid-2>"],
      "position": 0,
      "computed_balance": 523400,
      "created_at": "...",
      "updated_at": "...",
      "last_modified_at": 1741500000000
    }
  ]
}
```

**Notes:**
- `computed_balance` is the sum of `computed_balance` for each account in `account_ids`
- Archived accounts are included in the sum if referenced (they still have balances)
- Non-existent account IDs are silently ignored (balance contribution = 0)
- The frontend should refetch custom views after any account or transaction mutation to get updated balances

### 12.6 `fin_custom_view_reorder`

```json
{
  "event": "fin_custom_view_reorder",
  "data": {
    "orders": [
      { "id": "<view-uuid-1>", "position": 0 },
      { "id": "<view-uuid-2>", "position": 1 }
    ],
    "last_modified_at": 1741500000000
  }
}
```

**Broadcast:** `fin_custom_views_reordered` with `{}`.

---

## 13) Dashboard Configuration

Lets users configure which finance views appear on the dashboard. Stored server-side in `user_settings.fin_dashboard` (JSONB) so the configuration syncs across all clients.

### 13.1 Data Model

The dashboard is an ordered array of items. Each item has a `kind` and optionally a `view_id`:

```json
[
  { "kind": "net_worth" },
  { "kind": "total_assets" },
  { "kind": "total_liabilities" },
  { "kind": "custom_view", "view_id": "<custom-view-uuid>" }
]
```

**Valid `kind` values:**

| Kind | Description |
|------|-------------|
| `net_worth` | Net worth (assets - liabilities) |
| `total_assets` | Sum of all asset account balances |
| `total_liabilities` | Sum of all liability account balances |
| `custom_view` | A custom view (requires `view_id` referencing a `fin_custom_views.id`) |

### 13.2 `fin_dashboard_fetch`

```json
{ "event": "fin_dashboard_fetch", "data": {} }
```

**Response:** `fin_dashboard_data`
```json
{
  "event": "fin_dashboard_data",
  "data": {
    "items": [
      { "kind": "net_worth" },
      { "kind": "custom_view", "view_id": "<uuid>" }
    ]
  }
}
```

If the user has never configured their dashboard, `items` is `[]`. The frontend should show a default layout in this case.

### 13.3 `fin_dashboard_update`

```json
{
  "event": "fin_dashboard_update",
  "data": {
    "items": [
      { "kind": "net_worth" },
      { "kind": "total_assets" },
      { "kind": "custom_view", "view_id": "<uuid>" }
    ]
  }
}
```

**Validation:**
- Each item must have a valid `kind`
- `custom_view` items must include a `view_id` that references an existing custom view owned by the user
- Invalid kind → `400`
- Missing/invalid `view_id` → `400`
- Non-existent custom view → `404`

**Broadcast:** `fin_dashboard_updated` with `{ "items": [...] }` to all sessions.

### 13.4 Frontend Notes

- Fetch the dashboard config on app startup alongside accounts
- The `items` array defines both **which** views to show and their **order**
- For `custom_view` items, use the `view_id` to look up the view name and computed balance from `fin_custom_views_list`
- For built-in items (`net_worth`, `total_assets`, `total_liabilities`), compute from the accounts data
- When the user deletes a custom view, the dashboard config is NOT auto-updated — the frontend should handle stale `view_id` references gracefully (hide or show a "view deleted" placeholder)
