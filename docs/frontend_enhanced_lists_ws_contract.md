# Enhanced Standalone Lists — Frontend WebSocket Contract

## Overview

Enhances standalone lists with: organization (pinning, tags, status, search), sharing/collaboration, richer item fields (quantity/unit), list duplication, and item cancellation.

All changes build on the existing two-layer architecture (list definition + list run). Shared lists broadcast mutations to all users with access.

---

## Schema Changes

### Lists — New Fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `icon` | string | `"list"` | Icon identifier |
| `color` | string | `"#4A90D9"` | Hex color |
| `is_pinned` | boolean | `false` | Pinned lists sort first |
| `tags` | string[] | `[]` | For categorization/filtering |
| `status` | string | `"active"` | `active`, `completed`, `archived` |

**Removed:** `is_archived` (replaced by `status = "archived"`)

### List Items — New Fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `quantity` | string (nullable) | `null` | e.g. `"2"`, `"0.5"` |
| `unit` | string | `""` | e.g. `"kg"`, `"pcs"`, `"L"` |

### List Run Items — Changed Fields

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `is_completed` (bool) | `status` (string) | `pending`, `completed`, `cancelled` |
| — | `cancelled_at` (timestamp, nullable) | Set when status = `cancelled` |

**Frontend migration:** Replace `is_completed: true` checks with `status === "completed"`. New items start as `"pending"`.

---

## Modified Events

### `list_create` — accepts new fields

```json
{
  "event": "list_create",
  "data": {
    "target": { "kind": "standalone_home" },
    "position": 0,
    "title": "Grocery List",
    "kind": "checklist",
    "icon": "cart",
    "color": "#FF5733",
    "tags": ["shopping", "weekly"],
    "last_modified_at": 1709856000000
  }
}
```

All new fields are optional — defaults: `icon="list"`, `color="#4A90D9"`, `tags=[]`.

### `list_edit` — accepts new fields

```json
{
  "event": "list_edit",
  "data": {
    "id": "<list_uuid>",
    "title": "Updated Title",
    "kind": "checklist",
    "icon": "star",
    "color": "#00FF00",
    "tags": ["important"],
    "last_modified_at": 1709856000000
  }
}
```

Omit fields to keep current values.

### `list_item_create` — accepts quantity/unit

```json
{
  "event": "list_item_create",
  "data": {
    "list_id": "<list_uuid>",
    "position": 0,
    "item_type": "checkbox",
    "title": "Milk",
    "required": true,
    "quantity": "2",
    "unit": "L",
    "last_modified_at": 1709856000000
  }
}
```

### `list_item_edit` — accepts quantity/unit

Same as `list_item_create` but with `id` field. `quantity` and `unit` are optional (omit to keep current).

### `list_run_item_toggle` — unchanged wire format

The toggle still sends `run_id` + `item_id`. Backend now toggles between `status: "pending"` and `status: "completed"` instead of flipping `is_completed`.

**Response payload change:**
```json
{
  "status": "completed",
  "completed_at": "2026-03-08T12:00:00Z",
  "cancelled_at": null
}
```

### `lists_fetch` (standalone_home) — new params

```json
{
  "event": "lists_fetch",
  "data": {
    "target": { "kind": "standalone_home" },
    "search_text": "grocery",
    "status_filter": "active"
  }
}
```

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `search_text` | string | `""` | ILIKE match on title |
| `status_filter` | string | `"active"` | `active`, `completed`, `archived`, or `""` for all |

**Response includes shared lists:** Both owned and shared-with-me standalone lists are returned in the `lists` array.

### List Definition Payload — updated shape

```json
{
  "id": "<uuid>",
  "owner": { "kind": "standalone", "user_id": "<uuid>" },
  "position": 0,
  "title": "My List",
  "kind": "checklist",
  "rev": 1,
  "icon": "list",
  "color": "#4A90D9",
  "is_pinned": false,
  "tags": [],
  "status": "active",
  "created_at": "...",
  "updated_at": "...",
  "last_modified_at": 1709856000000
}
```

**Removed:** `is_archived`. **Added:** `icon`, `color`, `is_pinned`, `tags`, `status`.

### List Item Payload — updated shape

```json
{
  "id": "<uuid>",
  "list_id": "<uuid>",
  "parent_item_id": null,
  "position": 0,
  "type": "checkbox",
  "title": "Milk",
  "description": null,
  "required": true,
  "config": {},
  "quantity": "2",
  "unit": "L",
  "created_at": "...",
  "updated_at": "...",
  "last_modified_at": 1709856000000
}
```

**Added:** `quantity` (string|null), `unit` (string).

### Run Item Payload — updated shape

```json
{
  "id": "<uuid>",
  "run_id": "<uuid>",
  "snapshot": { ... },
  "status": "pending",
  "completed_at": null,
  "cancelled_at": null,
  "timer_state": {},
  "note_state": {},
  "created_at": "...",
  "updated_at": "...",
  "last_modified_at": 1709856000000
}
```

**Removed:** `is_completed`. **Added:** `status` (`pending`|`completed`|`cancelled`), `cancelled_at`.

---

## New Events

### `list_duplicate`

Clone a list + its items. Creates a fresh run with all items pending. Only owner can duplicate.

**Client -> Server:**
```json
{
  "event": "list_duplicate",
  "data": {
    "list_id": "<source_list_uuid>",
    "position": 1,
    "last_modified_at": 1709856000000
  }
}
```

**Server -> Client:** Broadcasts `list_created` to the duplicating user with full standalone target response. The new list starts unshared regardless of source list shares.

### `list_pin`

Toggle pinning. Pinned lists sort first in standalone home.

**Client -> Server:**
```json
{
  "event": "list_pin",
  "data": {
    "list_id": "<uuid>",
    "is_pinned": true,
    "last_modified_at": 1709856000000
  }
}
```

**Server -> Client:** Broadcasts `list_updated` to all list users.

### `list_set_status`

Set list status to `active`, `completed`, or `archived`. Only owner.

**Client -> Server:**
```json
{
  "event": "list_set_status",
  "data": {
    "list_id": "<uuid>",
    "status": "completed",
    "last_modified_at": 1709856000000
  }
}
```

**Server -> Client:** Broadcasts `list_updated` to all list users.

### `list_run_item_cancel`

Cancel a run item (removes it from progress computation).

**Client -> Server:**
```json
{
  "event": "list_run_item_cancel",
  "data": {
    "run_id": "<uuid>",
    "item_id": "<uuid>",
    "last_modified_at": 1709856000000
  }
}
```

**Server -> Client:** Broadcasts `list_run_item_updated` + `list_run_updated` (progress recomputed).

### `list_run_item_restore`

Restore a cancelled run item back to pending.

**Client -> Server:**
```json
{
  "event": "list_run_item_restore",
  "data": {
    "run_id": "<uuid>",
    "item_id": "<uuid>",
    "last_modified_at": 1709856000000
  }
}
```

**Server -> Client:** Broadcasts `list_run_item_updated` + `list_run_updated` (progress recomputed).

### `list_share_invite`

Share a standalone list with another user. Only owner can invite.

**Client -> Server:**
```json
{
  "event": "list_share_invite",
  "data": {
    "list_id": "<uuid>",
    "email": "user@example.com"
  }
}
```

The backend resolves the email to a user. The email is case-insensitive and trimmed.

**Server -> Client (owner):**
```json
{
  "event": "list_share_created",
  "data": {
    "list_share": {
      "id": "<share_uuid>",
      "list_id": "<uuid>",
      "owner_user_id": "<uuid>",
      "shared_with_user_id": "<uuid>",
      "permission": "edit",
      "created_at": "..."
    }
  }
}
```

**Server -> Client (invitee):** Same event, but includes full `lists` response so the invitee can render the shared list immediately.

**Error responses:**
- `404 not_found` — no user found with that email
- `409 already_shared` — list is already shared with this user
- `400 invalid_data` — cannot share with yourself, or list is not standalone

### `list_share_remove`

Owner removes a shared user, or a shared user leaves.

**Client -> Server:**
```json
{
  "event": "list_share_remove",
  "data": {
    "list_id": "<uuid>",
    "user_id": "<uuid_of_user_to_remove>"
  }
}
```

To leave: send your own `user_id`. To remove someone: send their `user_id` (owner only).

**Server -> Client:** Broadcasts `list_share_removed` to both owner and removed user:
```json
{
  "event": "list_share_removed",
  "data": {
    "list_id": "<uuid>",
    "user_id": "<removed_user_uuid>"
  }
}
```

### `list_shares_fetch`

Get all shares for a list. Owner only.

**Client -> Server:**
```json
{
  "event": "list_shares_fetch",
  "data": {
    "list_id": "<uuid>"
  }
}
```

**Server -> Client:**
```json
{
  "event": "list_shares_list",
  "data": [
    {
      "id": "<share_uuid>",
      "list_id": "<uuid>",
      "owner_user_id": "<uuid>",
      "shared_with_user_id": "<uuid>",
      "permission": "edit",
      "created_at": "..."
    }
  ]
}
```

### `list_run_item_assign`

Assign a user to a run item. The assigned user must be a list member.

**Client -> Server:**
```json
{
  "event": "list_run_item_assign",
  "data": {
    "run_item_id": "<run_item_uuid>",
    "assigned_user_id": "<user_uuid>"
  }
}
```

**Server -> Client:** Broadcasts `list_run_item_assigned` to all list users:
```json
{
  "event": "list_run_item_assigned",
  "data": {
    "id": "<assignment_uuid>",
    "run_item_id": "<uuid>",
    "assigned_user_id": "<uuid>",
    "created_at": "..."
  }
}
```

### `list_run_item_unassign`

Remove assignment.

**Client -> Server:**
```json
{
  "event": "list_run_item_unassign",
  "data": {
    "run_item_id": "<run_item_uuid>",
    "assigned_user_id": "<user_uuid>"
  }
}
```

**Server -> Client:** Broadcasts `list_run_item_unassigned` to all list users:
```json
{
  "event": "list_run_item_unassigned",
  "data": {
    "run_item_id": "<uuid>",
    "assigned_user_id": "<uuid>"
  }
}
```

---

## Authorization Rules

### Owner-only operations
- Delete list
- Change list status (`list_set_status`)
- Edit list metadata (title, icon, color, tags) — returns `403` for shared users
- Reorder list position — returns `403` for shared users
- Pin/unpin (`list_pin`)
- Duplicate (`list_duplicate`)
- Manage shares (invite/remove)
- View shares (`list_shares_fetch`)

### Owner + shared users
- Create/edit/delete items
- Toggle/cancel/restore run items
- Assign/unassign users to items
- Reorder items
- View list data (via `lists_fetch`)

### Shared user can
- Leave the list (send `list_share_remove` with own `user_id`)

### Non-standalone lists
- Cannot be shared (share operations will return error)
- No changes to authorization for task/schedule/occurrence/template lists

---

## Broadcasting Rules

### Standalone lists (not shared)
- All mutations broadcast to list owner's sessions only (unchanged behavior)

### Shared standalone lists
- Definition mutations (`list_created`, `list_updated`, `list_deleted`) → broadcast to all list users (owner + shared)
- Item definition mutations (`list_item_created`, `list_item_updated`, `list_item_deleted`, `list_items_reordered`) → broadcast to all list users
- Run mutations (`list_run_item_updated`, `list_run_updated`) → broadcast to all list users
- Note and timer mutations → broadcast to all list users
- Share mutations (`list_share_created`, `list_share_removed`) → broadcast to owner + affected user

---

## Progress Computation

Run progress now accounts for cancelled items:
- `required_total` = required checkbox/timer items **where status != 'cancelled'**
- `required_completed` = required checkbox/timer items **where status = 'completed'**

Cancelled items are excluded from both counts.

---

## Sort Order

Standalone lists are now sorted by:
1. `is_pinned DESC` (pinned first)
2. `updated_at DESC` (most recently updated first)

Previously: `position ASC, created_at ASC`.

---

## FAQ

**Q: How does a shared user detect they have access to a shared list?**
A: The `lists_fetch` response for `standalone_home` includes both owned and shared lists. Shared lists will have an `owner` field with a different `user_id`.

**Q: How do I know if a list is shared?**
A: Use `list_shares_fetch` (owner only). For shared users, they can check if the list owner's `user_id` differs from their own.

**Q: What happens when a share is removed?**
A: The removed user receives `list_share_removed` and should remove the list from their local state. The list data is no longer included in their `lists_fetch` response.

**Q: Can I share a task-attached list?**
A: No. Only standalone lists can be shared. Attempting to share a non-standalone list returns an error.

**Q: What happens to assignments when a share is removed?**
A: Assignments for the removed user remain in the database but are orphaned. The frontend should handle cleanup gracefully.
