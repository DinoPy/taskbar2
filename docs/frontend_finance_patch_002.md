# Finance Module — Patch 002: Custom Balance Views

**Date:** 2026-03-16
**Applies to:** `frontend_finance_ws_contract.md`

This patch adds custom balance views — user-defined groupings of accounts with a combined balance. The main contract has been updated (section 12).

---

## 1. New Table: `fin_custom_views`

**Migration:** `036_fin_custom_views.sql` — run `goose up`.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | UUID | auto | Primary key |
| `name` | string | — | Required, non-empty |
| `account_ids` | UUID[] | `[]` | References `fin_accounts.id` |
| `position` | int32 | `0` | Sort order |
| `created_at` | timestamp | now | |
| `updated_at` | timestamp | now | |
| `last_modified_at` | int64 | `0` | Client sync timestamp |

---

## 2. New Events

### `fin_custom_view_create`

```json
{
  "event": "fin_custom_view_create",
  "data": {
    "name": "Daily Spending",
    "account_ids": ["<uuid>", "<uuid>"],
    "position": 0,
    "last_modified_at": 1741500000000
  }
}
```

Broadcast: `fin_custom_view_created` with the full view object.

### `fin_custom_view_edit`

```json
{
  "event": "fin_custom_view_edit",
  "data": {
    "id": "<uuid>",
    "name": "Updated Name",
    "account_ids": ["<uuid>"],
    "last_modified_at": 1741500000000
  }
}
```

Broadcast: `fin_custom_view_updated` with the full view object.

### `fin_custom_view_delete`

```json
{
  "event": "fin_custom_view_delete",
  "data": {
    "id": "<uuid>",
    "last_modified_at": 1741500000000
  }
}
```

Broadcast: `fin_custom_view_deleted` with `{ "id": "<uuid>" }`.

### `fin_custom_views_fetch`

```json
{ "event": "fin_custom_views_fetch", "data": {} }
```

Response: `fin_custom_views_list` — array of view objects with `computed_balance`:

```json
[
  {
    "id": "<uuid>",
    "name": "Daily Spending",
    "account_ids": ["<uuid>", "<uuid>"],
    "position": 0,
    "computed_balance": 523400,
    "created_at": "...",
    "updated_at": "...",
    "last_modified_at": 1741500000000
  }
]
```

`computed_balance` is the sum of `computed_balance` for each account in `account_ids` (bigint, cents). Non-existent account IDs contribute 0.

### `fin_custom_view_reorder`

```json
{
  "event": "fin_custom_view_reorder",
  "data": {
    "orders": [
      { "id": "<uuid>", "position": 0 },
      { "id": "<uuid>", "position": 1 }
    ],
    "last_modified_at": 1741500000000
  }
}
```

Broadcast: `fin_custom_views_reordered` with `{}`.

---

## 3. Server → Client Events (Confirmations)

| Client sends | Server broadcasts | Payload |
|-------------|-------------------|---------|
| `fin_custom_view_create` | `fin_custom_view_created` | Full `FinCustomView` object |
| `fin_custom_view_edit` | `fin_custom_view_updated` | Full `FinCustomView` object |
| `fin_custom_view_delete` | `fin_custom_view_deleted` | `{ "id": "<uuid>" }` |
| `fin_custom_view_reorder` | `fin_custom_views_reordered` | `{}` |
| `fin_custom_views_fetch` | `fin_custom_views_list` (unicast) | Array of `FinCustomView` + `computed_balance` |

All broadcast events are sent to **all sessions** of the same user. `fin_custom_views_list` is sent only to the requesting session.

**Example `fin_custom_view_created` payload:**
```json
{
  "event": "fin_custom_view_created",
  "data": {
    "id": "<uuid>",
    "user_id": "<uuid>",
    "name": "Daily Spending",
    "account_ids": ["<uuid>", "<uuid>"],
    "position": 0,
    "created_at": "2026-03-16T08:00:00Z",
    "updated_at": "2026-03-16T08:00:00Z",
    "last_modified_at": 1741500000000
  }
}
```

---

## 4. Frontend Implementation Notes

- Refetch custom views (`fin_custom_views_fetch`) after any account or transaction mutation to get updated balances.
- Listen for broadcast events (`fin_custom_view_created`, `fin_custom_view_updated`, `fin_custom_view_deleted`, `fin_custom_views_reordered`) for multi-client sync.
- The view creation UI should let users pick from their existing accounts (fetched via `fin_accounts_fetch`).
- `computed_balance` follows the same sign convention as individual accounts — display as currency by dividing by 100.

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `fin_custom_views` table + migration | Run `goose up` |
| 2 | CRUD + fetch + reorder events | Yes — implement custom views UI |
| 3 | Server confirmation/broadcast events | Yes — handle for multi-client sync |
| 4 | `computed_balance` on fetch | Yes — display combined balance |
