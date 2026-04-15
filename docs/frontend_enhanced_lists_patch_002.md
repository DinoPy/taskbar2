# Enhanced Standalone Lists — Patch 002: List Item Images

**Date:** 2026-03-09
**Applies to:** `frontend_enhanced_lists_ws_contract.md`

This patch adds optional image support to list items. Images are managed via HTTP endpoints (not WebSocket), following the same pattern as recipe images. The main contract has been updated — this document provides a focused changelog.

---

## 1. New Field: `image_path` on List Items

**Schema change:** `list_items` table has a new nullable `image_path text` column.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `image_path` | string (nullable) | `null` | Relative path to uploaded image |

All existing WS events that return list items (`list_item_created`, `list_item_updated`, `list_item_deleted`, etc.) now include the `image_path` field in the item payload.

**Frontend action:** Add `image_path` to your ListItem model. When non-null, render the image at `{serverBaseURL}/{image_path}`.

---

## 2. New HTTP Endpoints

### Authentication

All image endpoints require two headers:

| Header | Description |
|--------|-------------|
| `X-Google-UID` | The user's Google UID string |
| `X-Email` | The user's email address |

### POST /api/lists/{listID}/items/{itemID}/image — Upload Image

Uploads or replaces an image for a list item.

**Content-Type:** `multipart/form-data`

**Form field:** `image` — the image file (JPEG, PNG). Max 10MB.

**Processing:** Image is decoded, resized (max 1200px on longest side), re-encoded as JPEG (quality 70%).

**Success response (201):**
```json
{
  "id": "aaaaaaaa-0000-0000-0000-000000000001",
  "image_path": "uploads/lists/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001.jpg"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 400 | Invalid list/item ID, missing image, invalid image format |
| 401 | Missing or invalid auth headers |
| 403 | User is not a member of the list (owner or shared) |
| 404 | Item not found or does not belong to the specified list |
| 500 | Server error |

**Notes:**
- Re-uploading replaces the existing image (only one image per item).
- Old image file is automatically deleted on replacement.

### DELETE /api/lists/{listID}/items/{itemID}/image — Remove Image

**Success response (200):**
```json
{
  "id": "aaaaaaaa-0000-0000-0000-000000000001",
  "image_path": null
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 400 | Invalid list/item ID |
| 401 | Missing or invalid auth headers |
| 403 | User is not a member of the list |
| 404 | Item not found, does not belong to list, or has no image |
| 500 | Server error |

### GET /uploads/lists/{itemID}/{imageFileName}.jpg — Serve Image

Static file serving. No authentication required (same as recipe images).

---

## 3. Real-Time Sync via WebSocket

After a successful image upload or delete, the server broadcasts a `list_item_image_updated` event to all members of the shared list (owner + shared users). The payload is the full lists target response (same format as other list mutation events like `list_item_updated`).

**Frontend action:** Listen for `list_item_image_updated` and refresh the list data from the payload — same handler pattern as other list mutation events.

---

## 4. Image Cleanup on Delete

When a list item or entire list is deleted via WebSocket, the server automatically cleans up associated image files from disk. No frontend action required.

**Behavior:**
- `list_item_delete` — removes the deleted item's image (and subtree items' images)
- `list_delete` (full delete, not archive) — removes all item images for the list

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `image_path` field on list items | Yes — add to model, render when non-null |
| 2 | HTTP upload/delete endpoints | Yes — implement upload/delete UI |
| 3 | `list_item_image_updated` WS event | Yes — handle for real-time sync on shared lists |
| 4 | Auto-cleanup on item/list delete | No |
