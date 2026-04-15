# Enhanced Standalone Lists — Patch 001

**Date:** 2026-03-08
**Applies to:** `frontend_enhanced_lists_ws_contract.md`

This patch documents all backend fixes applied after the initial contract was shipped. The main contract has already been updated to reflect these changes — this document exists as a changelog for frontend developers to understand what changed and why.

---

## 1. Share Invite: Email Instead of User ID

**What changed:** `list_share_invite` now accepts `email` (string) instead of `shared_with_user_id` (UUID).

**Before:**
```json
{
  "event": "list_share_invite",
  "data": {
    "list_id": "<uuid>",
    "shared_with_user_id": "<uuid>"
  }
}
```

**After:**
```json
{
  "event": "list_share_invite",
  "data": {
    "list_id": "<uuid>",
    "email": "user@example.com"
  }
}
```

**Why:** Users don't know other users' UUIDs. Email is the natural identifier for inviting someone.

**Backend behavior:**
- Email is trimmed and lowercased before lookup
- Empty email returns `400 invalid_data`
- No user found returns `404 not_found`
- Already shared returns `409 already_shared`
- Cannot share with yourself returns `400 invalid_data`

**Frontend action:** Replace any `shared_with_user_id` field with `email` in the share invite payload.

---

## 2. Position Reorder 500 Errors — Fixed

**What changed:** List reorder, list item reorder, and list duplicate no longer cause `500` errors from unique constraint violations.

**Affected events:**
- `list_reorder`
- `list_item_reorder`
- `list_duplicate`
- `list_create`
- `list_item_create`

**Root cause:** The unique index on `list_items(list_id, position)` was checked at the SQL statement level, not the transaction level. When shifting sibling items to make room for a reorder, intermediate states during the UPDATE violated the uniqueness constraint — even though the final state would be valid.

**Fix (two parts):**
1. **Migration 032:** Converts the `list_items` unique index to a `DEFERRABLE INITIALLY IMMEDIATE` unique constraint (checked at transaction commit instead of per-statement). Replaces partial unique indexes on `lists` with regular indexes (PostgreSQL doesn't support deferrable partial unique constraints).
2. **Handler change:** All position-sensitive transactions (`list_create`, `list_item_create`, `list_reorder`, `list_item_reorder`, `list_duplicate`) now defer constraint checks until commit.

**Frontend action:** None. If you had client-side workarounds for 500 errors on reorder/duplicate, they can be removed.

---

## 3. Owner-Only Guards on Shared Lists

**What changed:** The backend now enforces owner-only restrictions on shared standalone lists with proper `403` errors.

**New 403 responses for shared (non-owner) users on:**

| Event | Error |
|-------|-------|
| `list_edit` | `"Only the list owner can edit list metadata"` |
| `list_delete` | `"Only the list owner can delete a list"` |
| `list_reorder` | `"Only the list owner can reorder lists"` |

These are in addition to the owner-only guards already documented for `list_pin`, `list_set_status`, `list_duplicate`, and share management.

**Frontend action:** Handle `403` error responses on these events for shared users. Ideally, hide or disable the edit/delete/reorder UI controls when the current user is not the list owner (check `owner.user_id !== currentUser.id`).

---

## 4. Broadcasting Fixes for Shared Lists

**What changed:** All list mutations now correctly broadcast to all users with access (owner + shared users) when the list is a shared standalone list.

**Fixed broadcasts:**

| Event | Before | After |
|-------|--------|-------|
| `list_updated` (edit) | Owner only | All list users |
| `list_deleted` | Owner only | All list users |
| `lists_reordered` | Owner only | All list users |
| `list_item_created` | Owner only | All list users |
| `list_item_updated` | Owner only | All list users |
| `list_item_deleted` | Owner only | All list users |
| `list_items_reordered` | Owner only | All list users |
| `list_run_item_updated` (note) | Acting user only | All list users |
| `list_run_item_updated` (timer) | Acting user only | All list users |

**Frontend action:** None — this is a backend-only fix. Shared users will now receive real-time updates they were previously missing.

---

## 5. Shared Lists: Search and Status Filter

**What changed:** The `lists_fetch` search and status filter now apply to shared lists too, not just owned lists.

**Before:** `search_text` and `status_filter` only filtered owned standalone lists. Shared lists were always returned unfiltered.

**After:** Both filters apply equally to owned and shared lists in the response.

**Frontend action:** None — this is a backend-only fix. Search and filter results will now be consistent across owned and shared lists.

---

## 6. BumpListRevision: Shared User Support

**What changed:** The `BumpListRevision` query no longer filters by `user_id`, allowing shared users to bump the list revision when they create/edit/delete/reorder items.

**Before:** A shared user creating or editing an item would fail to bump the list revision (silent failure — the rev wouldn't increment).

**After:** Any user with access can bump the revision.

**Frontend action:** None — this is a backend-only fix. The `rev` field on list payloads will now correctly increment for all mutations regardless of which user performed them.

---

## Summary

| # | Fix | Frontend Change Required |
|---|-----|------------------------|
| 1 | Email-based share invite | Yes — change `shared_with_user_id` to `email` |
| 2 | Position shifting on reorder/duplicate | No |
| 3 | Owner-only 403 guards | Yes — handle 403 errors, hide UI for non-owners |
| 4 | Broadcasting to all shared list users | No |
| 5 | Search/status filter on shared lists | No |
| 6 | BumpListRevision for shared users | No |
