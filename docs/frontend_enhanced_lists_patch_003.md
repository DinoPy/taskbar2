# Enhanced Standalone Lists — Patch 003: Soft Delete & Restore

**Date:** 2026-03-17
**Applies to:** `frontend_enhanced_lists_ws_contract.md`

Lists are now soft-deleted instead of permanently removed. Deleted lists can be viewed and restored within 30 days, after which they are automatically purged.

---

## 1. Behavior Change: `list_delete`

**Before:** Lists were permanently deleted (hard DELETE).
**After:** Lists are soft-deleted (`deleted_at` timestamp is set). The list disappears from normal views but can be restored.

No change to the `list_delete` request format — it works exactly as before. The server broadcasts `list_deleted` as usual.

---

## 2. New Event: `list_deleted_fetch`

Fetches all soft-deleted standalone lists for the current user.

**Request — standalone deleted lists (trash view):**
```json
{ "event": "list_deleted_fetch", "data": {} }
```

**Request — task-linked deleted lists:**
```json
{ "event": "list_deleted_fetch", "data": { "task_id": "<task-uuid>" } }
```

When `task_id` is provided, returns only deleted lists owned by that task. When omitted, returns standalone deleted lists for the user.

**Response:** `list_deleted_list` — array of `ListDefinition` objects, ordered by `deleted_at` descending (most recently deleted first).

```json
{
  "event": "list_deleted_list",
  "data": [
    {
      "id": "<uuid>",
      "title": "Old Shopping List",
      "status": "active",
      "deleted_at": "2026-03-15T10:30:00Z",
      ...
    }
  ]
}
```

**Errors (when `task_id` provided):**
| Code | Condition |
|------|-----------|
| 400 | Invalid task_id format |
| 404 | Task not found |
| 403 | Task does not belong to user |

Each list includes a `deleted_at` timestamp. The frontend can show how many days remain before auto-purge (30 days from `deleted_at`).

---

## 3. New Event: `list_restore`

Restores a soft-deleted list back to active state.

**Request:**
```json
{
  "event": "list_restore",
  "data": {
    "id": "<uuid>",
    "last_modified_at": 1741500000000
  }
}
```

**Errors:**
| Code | Condition |
|------|-----------|
| 404 | List not found or not deleted |
| 500 | Server error |

**Broadcast:** `list_restored` — full lists target response (same format as other list mutation events). The frontend should handle this like `list_updated` and add the list back to the active list.

---

## 4. Auto-Purge

A daily cron job (3 AM) permanently deletes lists that have been soft-deleted for more than 30 days. This includes all associated data (items, runs, run items, shares, images).

No frontend action required — lists simply stop appearing in `list_deleted_fetch` after purge.

---

## 5. Frontend Implementation Notes

- Add a "Trash" or "Recently Deleted" section accessible from the lists UI
- Call `list_deleted_fetch` to populate it
- Show `deleted_at` date and days remaining before permanent deletion
- Provide a "Restore" button that sends `list_restore`
- Listen for `list_restored` broadcast to update UI on all clients
- The `deleted_at` field is now present on all `ListDefinition` objects (null for active lists)

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `list_delete` now soft-deletes | No — same request format |
| 2 | `list_deleted_fetch` event | Yes — implement trash/deleted lists view |
| 3 | `list_restore` event | Yes — implement restore button |
| 4 | 30-day auto-purge | No |
| 5 | `deleted_at` field on ListDefinition | Yes — use for trash UI display |
