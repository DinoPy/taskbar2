# Calendar Search — Patch 001

**Date:** 2026-03-17
**Applies to:** `frontend_scheduler_ws_contract_v2.md`

Adds a search event for finding schedules by title, with next occurrence timing.

---

## New Event: `calendar_search`

**Request:**
```json
{
  "event": "calendar_search",
  "data": {
    "query": "call"
  }
}
```

**Validation:**
- `query` is required (trimmed, non-empty)

**Response:** `calendar_search_results` — array of matching schedules (max 20), ordered by active status then most recently updated.

```json
{
  "event": "calendar_search_results",
  "data": [
    {
      "id": "<schedule-uuid>",
      "title": "Call Joan",
      "kind": "task",
      "rrule": "FREQ=WEEKLY;BYDAY=MO",
      "is_all_day": false,
      "category": "Life",
      "description": "Weekly check-in",
      "common_language": "every Monday",
      "active": true,
      "next_occurs_at": "2026-03-18T10:00:00Z"
    },
    {
      "id": "<schedule-uuid>",
      "title": "Call dentist",
      "kind": "reminder",
      "rrule": null,
      "is_all_day": false,
      "category": "Health",
      "description": "",
      "common_language": null,
      "active": false,
      "next_occurs_at": null
    }
  ]
}
```

### Field Reference

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Schedule ID |
| `title` | string | Schedule title (matched by search) |
| `kind` | string | `"task"` or `"reminder"` |
| `rrule` | string \| null | Recurrence rule (null for one-time) |
| `is_all_day` | boolean | Whether it's an all-day event |
| `category` | string \| null | Category label |
| `description` | string | Schedule description |
| `common_language` | string \| null | Human-readable recurrence (e.g. "every Monday") |
| `active` | boolean | Whether the schedule is active (false = deleted/completed) |
| `next_occurs_at` | timestamp \| null | Next planned occurrence (null if none upcoming) |

### Notes

- Search is case-insensitive (ILIKE)
- Results include both active and inactive (deleted) schedules, with active sorted first
- Max 20 results returned
- `next_occurs_at` is the nearest future planned occurrence — null means no future occurrences exist
- The frontend can use `id` to navigate to the schedule detail view
- If `rrule` is non-null, the schedule recurs; if null, it was a one-time event
- `common_language` provides a display-friendly recurrence description when available

---

## Frontend Implementation Notes

- Add a search input to the calendar view
- Debounce the search input (e.g. 300ms) before sending `calendar_search`
- Display results with title, kind icon, category, and next occurrence date
- Clicking a result should navigate to that schedule in the calendar
- Show inactive results differently (greyed out or with a label)
- `next_occurs_at` can be formatted as relative time ("in 2 days") or absolute

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `calendar_search` event | Yes — implement search UI in calendar |
| 2 | `calendar_search_results` response | Yes — render search results with timing info |
