# Completed Tasks V2 — Patch 001: Lists Summary

**Date:** 2026-03-16
**Applies to:** `websocket_events.md` (get_completed_tasks_v2 section)

This patch adds a `lists_summary` field to each task in the `completed_tasks_v2` response, showing whether the task had associated lists and their completion status.

---

## Change

Each task object in the `completed_tasks_v2` response now includes an additional field:

| Field | Type | Notes |
|-------|------|-------|
| `lists_summary` | object \| null | `null` if the task has no associated lists |

### `lists_summary` object

| Field | Type | Description |
|-------|------|-------------|
| `list_count` | int | Number of list runs associated with the task |
| `total_items` | int | Sum of all required items across all lists |
| `completed_items` | int | Sum of all completed required items across all lists |

---

## Example Response

```json
{
  "event": "completed_tasks_v2",
  "data": {
    "tasks": [
      {
        "id": "...",
        "title": "Weekly Shopping",
        "category": "Life",
        "tags": ["errands"],
        "lists_summary": {
          "list_count": 1,
          "total_items": 8,
          "completed_items": 8
        },
        ...
      },
      {
        "id": "...",
        "title": "Read chapter 5",
        "category": "Learning",
        "tags": [],
        "lists_summary": null,
        ...
      }
    ],
    "available_filters": {
      "categories": ["Learning", "Life"],
      "tags": ["errands"]
    }
  }
}
```

---

## Frontend Implementation Notes

- `lists_summary` is `null` when the task has no lists — don't render a list indicator
- When non-null, you can show a completion badge like "8/8 items" or a progress bar
- `total_items` and `completed_items` count only **required** items (non-required items are excluded)
- No additional request needed — the summary is included automatically in the existing `get_completed_tasks_v2` response

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `lists_summary` field on each task | Yes — render list completion indicator when non-null |
