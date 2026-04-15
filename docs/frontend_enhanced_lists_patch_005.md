# Enhanced Standalone Lists — Patch 005: Schedule List Cloning & Soft Delete Fixes

**Date:** 2026-03-26
**Applies to:** `frontend_enhanced_lists_ws_contract.md`

This patch covers two sets of backend fixes that change how schedule-owned lists and soft-deleted lists behave. Several of these changes affect what the frontend receives and how it should handle lists.

---

## 1. Schedule Lists Are Now Cloned Per Task (Breaking Change)

**Before:** A recurring schedule had ONE list definition shared across all tasks. Each task got its own `list_run` (independent completion status) but shared the same `list_items`. Editing an item's title/description on one task affected all tasks.

**After:** Each materialized task gets its own **independent copy** of the schedule's list — its own `ListDefinition`, its own `list_items`, and its own `list_run`. The schedule's list serves as a template only.

### What changes for the frontend

- Task-owned lists now have `owner.kind = "task"` instead of runs referencing a schedule-owned list
- Editing a task's list item only affects that task
- The schedule's template list is still visible when viewing the schedule itself (for editing the template)
- **Existing tasks** created before this fix still reference the old shared list. Only new tasks get independent copies.

### Frontend action required

- No code changes needed — the task view already renders from `bundle.run_items`
- The `bundle.definition.owner` will now show `{ "kind": "task", "id": "<task-uuid>" }` instead of `{ "kind": "schedule", "id": "<schedule-uuid>" }` for newly created tasks
- If you have special handling based on `owner.kind`, verify it works for both old (schedule-owned) and new (task-owned) lists

---

## 2. Soft-Deleted Lists No Longer Block Task Completion

**Before:** Soft-deleting a task's list set `deleted_at` on the list definition, but the `list_run` stayed active. The task completion check (`CountBlockingRequiredItemsForTask`) still counted pending required items from the deleted list, making the task impossible to complete.

**After:** Three queries now exclude soft-deleted lists:
- `CountBlockingRequiredItemsForTask` — no longer counts items from deleted lists
- `CountActiveRunsForTask` — no longer counts runs from deleted lists
- `GetListRunsByTask` — no longer returns runs for deleted lists

### What changes for the frontend

- Soft-deleting a task's list immediately removes it from the task view (no refresh needed — the next `lists_fetch` for that task won't include it)
- Task completion will succeed even if a deleted list had incomplete required items
- The deleted list is still recoverable via `list_restore` within 30 days

### Frontend action required

- After sending `list_delete` for a task-owned list, refetch the task's lists — the deleted list will no longer appear
- The "task blocked by list" error (`task_blocked_by_list`, 409) will no longer fire for deleted lists
- If showing a list completion indicator on the task, exclude lists that are no longer in the response

---

## 3. Schedule Deletion Now Cleans Up Owned Lists

**Before:** Deleting a schedule left its template lists as orphans in the database.

**After:** `ArchiveListsBySchedule` archives all lists owned by the schedule and sets `deleted_at`.

### Frontend action required

None — this is a backend-only cleanup. The lists were already invisible to the frontend after schedule deletion.

---

## 4. List Restore Now Restores Canceled Runs

**Before:** Restoring a schedule-owned list only cleared `deleted_at`. Canceled runs stayed canceled.

**After:** `list_restore` for schedule-owned lists also restores canceled future runs via `RestoreCanceledRunsForList`.

### Frontend action required

None — after `list_restore`, the `list_restored` broadcast already triggers a refetch which will include the restored runs.

---

## 5. Archived Schedule Lists Cannot Be Un-Archived

**Before:** `list_set_status` allowed changing any list's status, including archived schedule-owned lists.

**After:** Attempting to set a non-archived status on an archived schedule-owned list returns:
```json
{
  "type": "list_owner_locked",
  "message": "Archived schedule lists cannot be un-archived",
  "code": 409
}
```

### Frontend action required

- Handle the `409` error on `list_set_status` for schedule-owned lists
- Optionally hide the un-archive UI option for schedule-owned lists

---

## 6. Schedule List Item Sync to Active Runs

**Before:** Adding, editing, or deleting items on a schedule-owned template list did NOT propagate to active runs.

**After:** Changes to schedule template list items now sync to all active runs (for non-task schedules like reminders that still use occurrence-level runs).

### Frontend action required

None — this is transparent to the frontend. The next `lists_fetch` will return updated run item snapshots.

---

## 7. Reminder About `deleted_at` and `status` Independence

These are **two independent fields** on every `ListDefinition`:

| Field | Purpose | Values |
|-------|---------|--------|
| `status` | UI filter (active/completed/archived) | `"active"`, `"completed"`, `"archived"` |
| `deleted_at` | Soft delete timestamp | `null` (not deleted) or ISO timestamp |

A list can be `status = "active"` and soft-deleted. Or `status = "archived"` and not deleted. They don't interact — `status` is for UI organization, `deleted_at` is for the trash/recovery system.

When filtering lists:
- Active lists = `status = "active"` AND `deleted_at = null`
- Archived lists = `status = "archived"` AND `deleted_at = null`
- Deleted lists = `deleted_at != null` (any status)

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | Schedule lists cloned per task | Minimal — verify `owner.kind` handling |
| 2 | Soft-deleted lists don't block task completion | Yes — refetch task lists after delete |
| 3 | Schedule deletion archives owned lists | No |
| 4 | List restore restores canceled runs | No |
| 5 | Archived schedule lists can't be un-archived | Yes — handle 409, optionally hide UI |
| 6 | Schedule list item sync to active runs | No |
| 7 | `status` and `deleted_at` are independent | Yes — ensure correct filter logic |
