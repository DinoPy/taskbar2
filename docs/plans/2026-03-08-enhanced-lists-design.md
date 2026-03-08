# Enhanced Standalone Lists — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance standalone lists with organization (pinning, tags, status, search), sharing/collaboration, richer item fields (quantity/unit), list duplication, and item cancellation.

**Architecture:** Builds on existing two-layer architecture (list definition + list run). All changes are additive to the current listWindow.js renderer, listsController.js controller, and socket/IPC handlers. No new windows or processes needed.

**Contract:** `docs/frontend_enhanced_lists_ws_contract.md`

---

## 1. Data Model Migration

**List definitions**: Remove `is_archived`, add `icon`, `color`, `is_pinned`, `tags`, `status` (active/completed/archived).

**List items**: Add `quantity` (string|null) and `unit` (string).

**Run items**: Replace `is_completed` (boolean) with `status` (pending/completed/cancelled). Add `cancelled_at`.

## 2. Sidebar Enhancements (standalone home only)

- Search + status filter bar above the sidebar list, always visible.
- Text input for search, dropdown for status filter (All / Active / Completed / Archived).
- Pinned lists sort first, then by `updated_at DESC`.
- Sidebar items show: color dot, title, pin icon if pinned, share icon if shared.
- Right-click context menu on sidebar items: Pin/Unpin, Set Status (Active/Completed/Archived), Duplicate, Share, Delete.

## 3. List Item Changes

- Item create/edit dialog gets two new fields: quantity (text input) and unit (text input), side by side.
- Template view shows quantity+unit inline after title: "Milk — 2 L".
- Run view shows the same from the item snapshot.

## 4. Run Item Status Migration

- Replace `ri.is_completed` checks with `ri.status === "completed"`.
- Cancelled items: strikethrough text, reduced opacity, stay in place. "Restore" button on hover.
- Cancel action: small cancel button on hover for pending items.
- Progress computation: server handles totals (cancelled items excluded from both counts).

## 5. Sharing (standalone only)

- Share button in list header (owner only).
- Share dialog: email input to invite, list of current shares with remove buttons.
- Shared lists from other users appear in sidebar with indicator.
- Owner can remove shares; shared users can leave.
- All mutations on shared lists broadcast to all users with access.

## 6. New Events

### Client → Server
- `list_duplicate` — clone list + items
- `list_pin` — toggle pinning
- `list_set_status` — set active/completed/archived
- `list_run_item_cancel` — cancel a run item
- `list_run_item_restore` — restore cancelled item to pending
- `list_share_invite` — share list with user by email
- `list_share_remove` — remove share or leave
- `list_shares_fetch` — get shares for a list
- `list_run_item_assign` — assign user to run item
- `list_run_item_unassign` — remove assignment

### Server → Client (new handlers)
- `list_share_created` — share was created
- `list_share_removed` — share was removed
- `list_shares_list` — shares fetch response
- `list_run_item_assigned` — assignment created
- `list_run_item_unassigned` — assignment removed

## 7. Assignment

Run items can be assigned to shared users. Small avatar/initial badge on the run item. Assign/unassign via context menu on run items (only on shared lists).

## 8. Files Modified

- `src/js/listWindow.js` — renderer (bulk of changes)
- `src/styles/list.css` — new styles
- `src/html/list.html` — new markup (search/filter, share dialog)
- `src/main/controllers/listsController.js` — new event handlers
- `src/main/socket/handlers.js` — new server event handlers
- `src/main/ipc/registerHandlers.js` — new IPC forwarding

## 9. UI Decisions

- **Status changes**: via right-click context menu on sidebar items
- **Cancelled items**: strikethrough in place with restore on hover
- **Quantity/unit**: inline after title in both template and run views
- **Search/filter**: always visible above sidebar (standalone only)
- **Sharing**: dialog opened from share button in list header
