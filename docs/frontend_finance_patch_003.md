# Finance Module — Patch 003: Dashboard Configuration

**Date:** 2026-03-16
**Applies to:** `frontend_finance_ws_contract.md`

This patch adds server-side dashboard configuration, letting users choose which finance views appear on the dashboard. The setting syncs across all clients. Main contract updated (section 13).

---

## 1. New Migration

**`038_fin_dashboard_setting.sql`** — Adds `fin_dashboard JSONB NOT NULL DEFAULT '[]'` column to `user_settings`.

Run `goose up`.

---

## 2. Data Model

An ordered array of dashboard items:

```json
[
  { "kind": "net_worth" },
  { "kind": "total_assets" },
  { "kind": "total_liabilities" },
  { "kind": "custom_view", "view_id": "<uuid>" }
]
```

| Kind | Description | Requires `view_id` |
|------|-------------|-------------------|
| `net_worth` | Net worth (assets - liabilities) | No |
| `total_assets` | Sum of all asset accounts | No |
| `total_liabilities` | Sum of all liability accounts | No |
| `custom_view` | Custom view balance | Yes |

---

## 3. New Events

### `fin_dashboard_fetch`

```json
{ "event": "fin_dashboard_fetch", "data": {} }
```

Response: `fin_dashboard_data`
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

Empty `items` array (`[]`) means no configuration — frontend shows default layout.

### `fin_dashboard_update`

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
- Invalid `kind` → `400`
- `custom_view` without `view_id` → `400`
- Non-existent custom view → `404`

**Broadcast:** `fin_dashboard_updated` with `{ "items": [...] }` to all sessions.

---

## 4. Frontend Implementation Notes

- Fetch dashboard config on app startup (`fin_dashboard_fetch`)
- `items` defines which views to show and their order
- For `custom_view` items, look up the view from `fin_custom_views_list` by `view_id`
- For built-in kinds, compute values from account data
- Handle stale `view_id` references gracefully (custom view may have been deleted)
- Listen for `fin_dashboard_updated` broadcast for multi-client sync

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `fin_dashboard` column + migration | Run `goose up` |
| 2 | `fin_dashboard_fetch` / `fin_dashboard_update` events | Yes — fetch on startup, implement settings UI |
| 3 | `fin_dashboard_updated` broadcast | Yes — handle for multi-client sync |
