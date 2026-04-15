# Completed Tasks V2 — Patch 002: Has Lists Filter

**Date:** 2026-03-23
**Applies to:** `websocket_events.md` (get_completed_tasks_v2 section)

Adds an optional `has_lists` filter to show only completed tasks that had (or didn't have) associated lists.

---

## Change

New optional field in the `get_completed_tasks_v2` request:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `has_lists` | boolean \| null | null | `true` = only tasks with lists, `false` = only tasks without lists, omitted = no filtering |

---

## Example Requests

**Only tasks with lists:**
```json
{
  "event": "get_completed_tasks_v2",
  "data": {
    "has_lists": true,
    "start_date": "2026-03-01",
    "end_date": "2026-03-23"
  }
}
```

**Only tasks without lists:**
```json
{
  "event": "get_completed_tasks_v2",
  "data": {
    "has_lists": false
  }
}
```

**No filtering (current behavior):**
```json
{
  "event": "get_completed_tasks_v2",
  "data": {}
}
```

---

## Notes

- The filter is applied after all other filters (categories, tags, keywords) and after list summaries are loaded
- Combines with all existing filters — e.g. you can filter by category AND has_lists simultaneously
- The `available_filters` in the response still reflects the unfiltered result set (same as other filters)
- Tasks matched by `has_lists: true` will always have a non-null `lists_summary` in the response

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `has_lists` filter parameter | Yes — add toggle/checkbox to completed tasks filter UI |
