# Frontend Contract: Recipes & Food Planner Module

## 1. Overview

The Recipes & Food Planner module provides:

- **Recipes** -- create, edit, delete recipes with structured ingredients, free-text tags, and image attachments.
- **Recipe Groups** -- shared workspaces where multiple users can view each other's shared recipes and collaboratively plan meals.
- **Meal Log** -- track what was eaten and when (personal or within a group).
- **Meal Planner** -- configurable-duration meal plans (1-30 days, default 7) with suggestion engine that favors recipes not eaten recently. Supports tag-based filtering.
- **Save/Bookmark** -- save other users' recipes from shared groups; saving immediately creates a personal copy of the recipe.

### Workspace Concept

Every recipe, meal log entry, and meal plan exists in either:

- **Personal space** -- `group_id` is omitted or empty. Only the owner can see it.
- **Group context** -- `group_id` is provided. All group members can see it.

The frontend switches context by including or omitting `group_id` in list/create requests.

---

## 2. Authentication

### WebSocket

Authentication happens via the existing `connect` event when establishing the WebSocket connection. All subsequent recipe/meal events use the authenticated user identity from the connection session.

### HTTP (Image Endpoints)

Image upload and delete use HTTP endpoints that require two headers:

| Header | Description |
|--------|-------------|
| `X-Google-UID` | The user's Google UID string |
| `X-Email` | The user's email address |

Both headers are required. The server validates that the email matches a user in the database and that the Google UID matches that user's stored credential.

---

## 3. Schema Overview

| Table | Purpose |
|-------|---------|
| `recipes` | Core recipe: title, instructions, owner. |
| `recipe_ingredients` | Structured ingredient list per recipe (name, quantity, unit, position). |
| `recipe_images` | Image file references per recipe (file_path, position). |
| `recipe_tags` | Free-text tags per recipe (unique per recipe). |
| `recipe_groups` | Shared workspace with a name and creator. |
| `recipe_group_members` | Membership table: who belongs to which group, with role (owner/member). |
| `recipe_group_recipes` | Join table: which recipes are shared into which groups. |
| `recipe_saves` | Bookmark/save table: user saves another user's recipe. Has `copied_recipe_id` pointing to the instant personal copy. |
| `meals` | Meal log entries: what was eaten, when, optional recipe link, optional group context. |
| `meal_plans` | A meal plan (7-day window) with a start date, optional group context. |
| `meal_plan_entries` | Individual entries in a meal plan: date + meal_type slot, recipe link, name. |

### Key Relationships

- A recipe is **owned** by one user (`recipes.user_id`).
- A recipe can be **shared** into multiple groups via `recipe_group_recipes`.
- A user can **save/bookmark** another user's recipe via `recipe_saves`. Saving immediately creates a personal copy.
- Meal logs and meal plans can be personal (`group_id` is NULL) or group-scoped.

---

## 4. WebSocket Events -- Recipes

### General WebSocket Message Format

**Client sends:**
```json
{
  "event": "event_name",
  "data": { ... }
}
```

**Server responds:**
```json
{
  "event": "response_event_name",
  "data": { ... }
}
```

**Error responses** always use the event name `connection_error`:
```json
{
  "event": "connection_error",
  "data": {
    "type": "error_type_string",
    "message": "Human-readable message",
    "code": 400
  }
}
```

---

### 4.1 recipe_create

Creates a new recipe owned by the authenticated user.

**Request:**
```json
{
  "event": "recipe_create",
  "data": {
    "title": "Pasta Carbonara",
    "instructions": "1. Boil pasta\n2. Fry guanciale...",
    "last_modified_at": 1741427200000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Trimmed; must be non-empty |
| `instructions` | string | No | Trimmed; defaults to empty string |
| `last_modified_at` | int64 | No | Milliseconds since epoch. If 0 or omitted, server uses current time. |

**Response event:** `recipe_created`

**Response payload:** A `Recipe` object.

```json
{
  "event": "recipe_created",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user_id": "11111111-2222-3333-4444-555555555555",
    "title": "Pasta Carbonara",
    "instructions": "1. Boil pasta\n2. Fry guanciale...",
    "created_at": "2026-03-08T12:00:00Z",
    "updated_at": "2026-03-08T12:00:00Z",
    "last_modified_at": 1741427200000
  }
}
```

**Broadcast scope:** All sessions of the creating user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or empty title |
| `database_error` | 500 | Database failure |

---

### 4.2 recipe_get

Fetches a single recipe with its ingredients, images, and tags.

**Request:**
```json
{
  "event": "recipe_get",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Recipe ID |

**Response event:** `recipe_data`

**Response payload:**
```json
{
  "event": "recipe_data",
  "data": {
    "recipe": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "11111111-2222-3333-4444-555555555555",
      "title": "Pasta Carbonara",
      "instructions": "1. Boil pasta...",
      "created_at": "2026-03-08T12:00:00Z",
      "updated_at": "2026-03-08T12:00:00Z",
      "last_modified_at": 1741427200000
    },
    "ingredients": [
      {
        "id": "bbbbbbbb-0000-0000-0000-000000000001",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Spaghetti",
        "quantity": {"String": "400", "Valid": true},
        "unit": {"String": "g", "Valid": true},
        "position": 0,
        "last_modified_at": 1741427200000
      },
      {
        "id": "bbbbbbbb-0000-0000-0000-000000000002",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Eggs",
        "quantity": {"String": "3", "Valid": true},
        "unit": {"String": "", "Valid": false},
        "position": 1,
        "last_modified_at": 1741427200000
      }
    ],
    "images": [
      {
        "id": "cccccccc-0000-0000-0000-000000000001",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "file_path": "uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg",
        "position": 0,
        "created_at": "2026-03-08T12:01:00Z"
      }
    ],
    "tags": [
      {
        "id": "dddddddd-0000-0000-0000-000000000001",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "tag": "italian"
      }
    ]
  }
}
```

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Note:** Tags are returned in alphabetical order.

**Authorization:** User must be the recipe owner OR a member of at least one group the recipe is shared to.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe does not exist |
| `forbidden` | 403 | User has no access to this recipe |
| `database_error` | 500 | Database failure |

---

### 4.3 recipe_list

Lists recipes for the user's personal space or a group.

**Request:**
```json
{
  "event": "recipe_list",
  "data": {
    "group_id": ""
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | No | If empty/omitted: returns user's own recipes. If set: returns recipes shared in that group. |

**Response event:** `recipe_list_data`

**Response payload:** An array of `Recipe` objects.

```json
{
  "event": "recipe_list_data",
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "11111111-2222-3333-4444-555555555555",
      "title": "Pasta Carbonara",
      "instructions": "1. Boil pasta...",
      "created_at": "2026-03-08T12:00:00Z",
      "updated_at": "2026-03-08T12:00:00Z",
      "last_modified_at": 1741427200000
    }
  ]
}
```

**Note:** The list returns only the `Recipe` objects (no ingredients/images/tags). Use `recipe_get` to fetch the full detail for a single recipe.

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid group UUID |
| `forbidden` | 403 | User is not a member of the specified group |
| `database_error` | 500 | Database failure |

---

### 4.4 recipe_update

Updates the title and/or instructions of a recipe. Only the owner can update.

**Request:**
```json
{
  "event": "recipe_update",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Pasta Carbonara (Updated)",
    "instructions": "Updated instructions...",
    "last_modified_at": 1741427300000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Recipe ID |
| `title` | string | Yes | Trimmed; must be non-empty |
| `instructions` | string | No | Trimmed |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `recipe_updated`

**Response payload:** The updated `Recipe` object.

```json
{
  "event": "recipe_updated",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user_id": "11111111-2222-3333-4444-555555555555",
    "title": "Pasta Carbonara (Updated)",
    "instructions": "Updated instructions...",
    "created_at": "2026-03-08T12:00:00Z",
    "updated_at": "2026-03-08T12:05:00Z",
    "last_modified_at": 1741427300000
  }
}
```

**Broadcast scope:** All sessions of the owner (BroadcastToSameUser) + all members of all groups the recipe is shared to (broadcastRecipeToGroups).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, invalid UUID, or empty title |
| `not_found` | 404 | Recipe not found or not owned by user |
| `database_error` | 500 | Database failure |

---

### 4.5 recipe_delete

Deletes a recipe. Only the owner can delete.

**Request:**
```json
{
  "event": "recipe_delete",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Recipe ID |

**Response event:** `recipe_deleted`

**Response payload:**
```json
{
  "event": "recipe_deleted",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Broadcast scope:** All sessions of the owner + all members of all groups the recipe was shared to (groups are resolved before deletion).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe not found or not owned by user |
| `database_error` | 500 | Database failure |

---

### 4.6 recipe_ingredients_update

Replaces all ingredients on a recipe (delete-all + insert-new in one transaction). Only the owner can update.

**Request:**
```json
{
  "event": "recipe_ingredients_update",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ingredients": [
      {
        "name": "Spaghetti",
        "quantity": 400,
        "unit": "g",
        "position": 0
      },
      {
        "name": "Eggs",
        "quantity": 3,
        "unit": null,
        "position": 1
      },
      {
        "name": "Salt",
        "quantity": null,
        "unit": null,
        "position": 2
      }
    ],
    "last_modified_at": 1741427300000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `recipe_id` | string (UUID) | Yes | Recipe ID |
| `ingredients` | array | Yes | Full replacement list |
| `ingredients[].name` | string | Yes | Trimmed; empty names are silently skipped |
| `ingredients[].quantity` | number or null | No | Stored as text in DB. Null means no quantity. |
| `ingredients[].unit` | string or null | No | Null or empty string means no unit. |
| `ingredients[].position` | int32 | Yes | Display order (0-based) |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `recipe_updated`

**Response payload:**
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ingredients": [
      {
        "id": "bbbbbbbb-0000-0000-0000-000000000001",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Spaghetti",
        "quantity": {"String": "400", "Valid": true},
        "unit": {"String": "g", "Valid": true},
        "position": 0,
        "last_modified_at": 1741427300000
      },
      {
        "id": "bbbbbbbb-0000-0000-0000-000000000002",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Eggs",
        "quantity": {"String": "3", "Valid": true},
        "unit": {"String": "", "Valid": false},
        "position": 1,
        "last_modified_at": 1741427300000
      },
      {
        "id": "bbbbbbbb-0000-0000-0000-000000000003",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Salt",
        "quantity": {"String": "", "Valid": false},
        "unit": {"String": "", "Valid": false},
        "position": 2,
        "last_modified_at": 1741427300000
      }
    ]
  }
}
```

**Broadcast scope:** All sessions of the owner + all groups the recipe is shared to.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe not found |
| `forbidden` | 403 | User does not own the recipe |
| `database_error` | 500 | Database failure |

---

### 4.7 recipe_tags_update

Replaces all tags on a recipe (delete-all + insert-new in one transaction). Only the owner can update.

**Request:**
```json
{
  "event": "recipe_tags_update",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tags": ["italian", "pasta", "quick"],
    "last_modified_at": 1741427300000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `recipe_id` | string (UUID) | Yes | Recipe ID |
| `tags` | string[] | Yes | Full replacement list. Each tag is trimmed; empty strings are skipped. |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `recipe_updated`

**Response payload:**
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tags": [
      {
        "id": "dddddddd-0000-0000-0000-000000000001",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "tag": "italian"
      },
      {
        "id": "dddddddd-0000-0000-0000-000000000002",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "tag": "pasta"
      },
      {
        "id": "dddddddd-0000-0000-0000-000000000003",
        "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "tag": "quick"
      }
    ]
  }
}
```

**Broadcast scope:** All sessions of the owner + all groups the recipe is shared to.

**Note:** Tags are returned in alphabetical order.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe not found |
| `forbidden` | 403 | User does not own the recipe |
| `database_error` | 500 | Database failure |

---

### 4.8 recipe_image_delete

Deletes a specific image from a recipe via WebSocket. Only the owner can delete.

**Request:**
```json
{
  "event": "recipe_image_delete",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "image_id": "cccccccc-0000-0000-0000-000000000001"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `recipe_id` | string (UUID) | Yes | Recipe ID |
| `image_id` | string (UUID) | Yes | Image ID to delete |

**Response event:** `recipe_updated`

**Response payload:**
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "deleted_image_id": "cccccccc-0000-0000-0000-000000000001"
  }
}
```

**Broadcast scope:** All sessions of the owner + all groups the recipe is shared to.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe not found, or image not found, or image does not belong to recipe |
| `forbidden` | 403 | User does not own the recipe |
| `database_error` | 500 | Database failure |

---

### 4.9 recipe_save

Saves/bookmarks another user's recipe **and immediately creates a personal copy** of the recipe (including title, instructions, ingredients, tags, and images). You cannot save your own recipe. Saving an already-saved recipe silently succeeds.

The personal copy is a full, independent clone owned by the saving user. It appears in their personal recipe list and can be edited independently.

**Request:**
```json
{
  "event": "recipe_save",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `recipe_id` | string (UUID) | Yes | Recipe ID to save |

**Response event:** `recipe_saved`

**Response payload (first save -- copy created):**
```json
{
  "event": "recipe_saved",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "copied": true
  }
}
```

The `copied: true` field indicates that a personal copy was created. The copy will appear in the user's personal recipe list (via `recipe_list` with no `group_id`). The `recipe_saves` record's `copied_recipe_id` is updated to point to the new clone.

**Response payload (already saved -- idempotent):**
```json
{
  "event": "recipe_saved",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "already_saved": true
  }
}
```

**Broadcast scope:** All sessions of the saving user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, invalid UUID, or trying to save own recipe |
| `not_found` | 404 | Recipe not found |
| `database_error` | 500 | Database failure (includes copy failure) |

---

### 4.10 recipe_saved_list

Lists all recipes the current user has saved (returns the personal copies created by saving).

**Request:**
```json
{
  "event": "recipe_saved_list",
  "data": {}
}
```

No fields required.

**Response event:** `recipe_saved_list_data`

**Response payload:**
```json
{
  "event": "recipe_saved_list_data",
  "data": [
    {
      "id": "cccccccc-0000-0000-0000-000000000001",
      "user_id": "11111111-2222-3333-4444-555555555555",
      "title": "Pasta Carbonara",
      "instructions": "Cook spaghetti...",
      "created_at": "2026-03-08T12:10:00Z",
      "updated_at": "2026-03-08T12:10:00Z",
      "last_modified_at": 1741435800000
    }
  ]
}
```

Returns an array of `Recipe` objects (the personal copies). Empty array if no saved recipes.

**Broadcast scope:** Requesting session only (SendToClient).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `database_error` | 500 | Database failure |

---

### 4.11 recipe_unsave

Removes a saved/bookmarked recipe.

**Request:**
```json
{
  "event": "recipe_unsave",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `recipe_id` | string (UUID) | Yes | Recipe ID to unsave |

**Response event:** `recipe_unsaved`

**Response payload:**
```json
{
  "event": "recipe_unsaved",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Broadcast scope:** All sessions of the user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `database_error` | 500 | Database failure |

---

## 5. WebSocket Events -- Recipe Groups

### 5.1 recipe_group_create

Creates a new recipe group and adds the creator as owner.

**Request:**
```json
{
  "event": "recipe_group_create",
  "data": {
    "name": "Family Recipes",
    "last_modified_at": 1741427200000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Trimmed; must be non-empty |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `recipe_group_created`

**Response payload:** A `RecipeGroup` object.
```json
{
  "event": "recipe_group_created",
  "data": {
    "id": "gggggggg-0000-0000-0000-000000000001",
    "name": "Family Recipes",
    "created_by": "11111111-2222-3333-4444-555555555555",
    "created_at": "2026-03-08T12:00:00Z",
    "updated_at": "2026-03-08T12:00:00Z",
    "last_modified_at": 1741427200000
  }
}
```

**Broadcast scope:** All sessions of the creating user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or empty name |
| `database_error` | 500 | Database failure |

---

### 5.2 recipe_group_list

Lists all groups the user is a member of.

**Request:**
```json
{
  "event": "recipe_group_list",
  "data": {}
}
```

No request fields needed (data can be empty or `{}`).

**Response event:** `recipe_group_list_data`

**Response payload:** An array of `RecipeGroup` objects.
```json
{
  "event": "recipe_group_list_data",
  "data": [
    {
      "id": "gggggggg-0000-0000-0000-000000000001",
      "name": "Family Recipes",
      "created_by": "11111111-2222-3333-4444-555555555555",
      "created_at": "2026-03-08T12:00:00Z",
      "updated_at": "2026-03-08T12:00:00Z",
      "last_modified_at": 1741427200000
    }
  ]
}
```

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `database_error` | 500 | Database failure |

---

### 5.3 recipe_group_member_add

Adds a new member to a group by their email. Only the group owner can add members.

**Request:**
```json
{
  "event": "recipe_group_member_add",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "email": "jane@example.com"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | Yes | Group ID |
| `email` | string | Yes | Trimmed; must be non-empty. Must match an existing user. |

**Response event:** `recipe_group_member_joined`

**Response payload:**
```json
{
  "event": "recipe_group_member_joined",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "member": {
      "id": "mmmmmmmm-0000-0000-0000-000000000001",
      "group_id": "gggggggg-0000-0000-0000-000000000001",
      "user_id": "22222222-3333-4444-5555-666666666666",
      "role": "member",
      "joined_at": "2026-03-08T12:15:00Z"
    },
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com"
  }
}
```

**Broadcast scope:** All members of the group (broadcastToRecipeGroup), including the newly added member.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, invalid UUID, or empty email |
| `forbidden` | 403 | Requester is not in the group, or is not the owner |
| `not_found` | 404 | No user found with that email |
| `database_error` | 500 | Database failure (includes duplicate member) |

---

### 5.4 recipe_group_member_remove

Removes a member from a group. The group owner can remove any non-owner member. A non-owner member can remove themselves (leave).

**Request:**
```json
{
  "event": "recipe_group_member_remove",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "user_id": "22222222-3333-4444-5555-666666666666"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | Yes | Group ID |
| `user_id` | string (UUID) | Yes | User ID to remove |

**Response event:** `recipe_group_member_left`

**Response payload:**
```json
{
  "event": "recipe_group_member_left",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "user_id": "22222222-3333-4444-5555-666666666666"
  }
}
```

**Broadcast scope:** All members of the group BEFORE removal (so the removed user also receives the event).

**Side effect:** Before removal, the server copies any recipes the user had saved/bookmarked from this group into their personal collection (copy-on-leave).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Target member not found in group |
| `forbidden` | 403 | Cannot remove the owner; or requester is not owner and not the target user |
| `database_error` | 500 | Database failure |

---

### 5.5 recipe_group_delete

Deletes a group. Only the group creator (owner) can delete. Before deletion, all members' saved recipes from the group are cloned.

**Request:**
```json
{
  "event": "recipe_group_delete",
  "data": {
    "id": "gggggggg-0000-0000-0000-000000000001"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Group ID |

**Response event:** `recipe_group_deleted`

**Response payload:**
```json
{
  "event": "recipe_group_deleted",
  "data": {
    "id": "gggggggg-0000-0000-0000-000000000001"
  }
}
```

**Broadcast scope:** All members of the group (resolved before deletion).

**Side effect:** Before deletion, the server runs copy-on-leave for every member of the group.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `database_error` | 500 | Database failure (includes: not the creator) |

---

### 5.6 recipe_group_share_recipe

Shares a recipe into a group. The user must own the recipe and be a member of the group.

**Request:**
```json
{
  "event": "recipe_group_share_recipe",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | Yes | Group ID |
| `recipe_id` | string (UUID) | Yes | Recipe ID |

**Response event:** `recipe_group_recipe_shared`

**Response payload:**
```json
{
  "event": "recipe_group_recipe_shared",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "recipe": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "11111111-2222-3333-4444-555555555555",
      "title": "Pasta Carbonara",
      "instructions": "1. Boil pasta...",
      "created_at": "2026-03-08T12:00:00Z",
      "updated_at": "2026-03-08T12:00:00Z",
      "last_modified_at": 1741427200000
    }
  }
}
```

**Broadcast scope:** All members of the group (broadcastToRecipeGroup).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `forbidden` | 403 | User is not a group member, or does not own the recipe |
| `not_found` | 404 | Recipe not found |
| `database_error` | 500 | Database failure |

---

### 5.7 recipe_group_unshare_recipe

Removes a recipe from a group. Only the recipe owner can unshare.

**Request:**
```json
{
  "event": "recipe_group_unshare_recipe",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | Yes | Group ID |
| `recipe_id` | string (UUID) | Yes | Recipe ID |

**Response event:** `recipe_group_recipe_unshared`

**Response payload:**
```json
{
  "event": "recipe_group_recipe_unshared",
  "data": {
    "group_id": "gggggggg-0000-0000-0000-000000000001",
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Broadcast scope:** All members of the group (resolved before unsharing).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Recipe not found |
| `forbidden` | 403 | User does not own the recipe |
| `database_error` | 500 | Database failure |

---

## 6. WebSocket Events -- Meals & Planner

### 6.1 meal_log

Logs a meal (what was eaten).

**Request:**
```json
{
  "event": "meal_log",
  "data": {
    "group_id": "",
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Pasta Carbonara",
    "meal_type": "dinner",
    "eaten_at": "2026-03-08T19:30:00Z",
    "last_modified_at": 1741427200000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | No | Empty = personal. Set = group context (membership verified). |
| `recipe_id` | string (UUID) | No | Optional link to a recipe. |
| `name` | string | Yes | Trimmed; must be non-empty |
| `meal_type` | string or null | No | One of: `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"`, or null/empty. |
| `eaten_at` | string (RFC3339) | No | Defaults to current time if empty/omitted. |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `meal_logged`

**Response payload:** A `Meal` object.
```json
{
  "event": "meal_logged",
  "data": {
    "id": "ffffffff-0000-0000-0000-000000000001",
    "group_id": {"UUID": "00000000-0000-0000-0000-000000000000", "Valid": false},
    "user_id": "11111111-2222-3333-4444-555555555555",
    "recipe_id": {"UUID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Valid": true},
    "name": "Pasta Carbonara",
    "meal_type": {"String": "dinner", "Valid": true},
    "eaten_at": "2026-03-08T19:30:00Z",
    "created_at": "2026-03-08T19:31:00Z",
    "last_modified_at": 1741427200000
  }
}
```

**Broadcast scope:**
- If `group_id` is set: all group members (broadcastToRecipeGroup).
- If personal: all sessions of the user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, empty name, invalid meal_type, invalid date format, invalid UUID |
| `forbidden` | 403 | User is not a member of the specified group |
| `database_error` | 500 | Database failure |

---

### 6.2 meal_delete

Deletes a meal log entry. Only the user who logged it can delete.

**Request:**
```json
{
  "event": "meal_delete",
  "data": {
    "id": "ffffffff-0000-0000-0000-000000000001"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Meal ID |

**Response event:** `meal_deleted`

**Response payload:**
```json
{
  "event": "meal_deleted",
  "data": {
    "id": "ffffffff-0000-0000-0000-000000000001"
  }
}
```

**Broadcast scope:** If the meal was logged in a group context, broadcast to all group members (BroadcastToGroup). If personal, all sessions of the user (BroadcastToSameUser).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `database_error` | 500 | Database failure (includes: meal not found or not owned by user) |

---

### 6.3 meal_list

Lists meal log entries with pagination.

**Request:**
```json
{
  "event": "meal_list",
  "data": {
    "group_id": "",
    "limit": 50,
    "offset": 0
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | No | Empty = personal meals. Set = group meals. |
| `limit` | int32 | No | Default: 50. Range: 1--100. |
| `offset` | int32 | No | Default: 0. Must be >= 0. |

**Response event:** `meal_list_data`

**Response payload:** An array of `Meal` objects.
```json
{
  "event": "meal_list_data",
  "data": [
    {
      "id": "ffffffff-0000-0000-0000-000000000001",
      "group_id": {"UUID": "00000000-0000-0000-0000-000000000000", "Valid": false},
      "user_id": "11111111-2222-3333-4444-555555555555",
      "recipe_id": {"UUID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Valid": true},
      "name": "Pasta Carbonara",
      "meal_type": {"String": "dinner", "Valid": true},
      "eaten_at": "2026-03-08T19:30:00Z",
      "created_at": "2026-03-08T19:31:00Z",
      "last_modified_at": 1741427200000
    }
  ]
}
```

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid group UUID |
| `forbidden` | 403 | User is not a member of the specified group |
| `database_error` | 500 | Database failure |

---

### 6.4 meal_suggestions_get

Gets meal suggestions based on the user's recipes and meal history, using a weighted random algorithm that favors recipes not eaten recently. Supports optional tag-based filtering.

**Request:**
```json
{
  "event": "meal_suggestions_get",
  "data": {
    "group_id": "",
    "meal_type": "",
    "tag": "quick",
    "count": 5
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | No | Empty = personal context. Set = group context. |
| `meal_type` | string | No | Currently accepted but not used for filtering in the algorithm (reserved for future use). |
| `tag` | string | No | When set, only recipes with this tag are included as candidates. Meal history names are excluded from the candidate pool when a tag filter is active (only recipe-based suggestions are returned). Trimmed; empty string means no filter. |
| `count` | int | No | Default: 5. Range: 1--10. |

**Response event:** `meal_suggestions_data`

**Response payload:** An array of suggestion objects.
```json
{
  "event": "meal_suggestions_data",
  "data": [
    {
      "name": "Pasta Carbonara",
      "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    },
    {
      "name": "Leftover Pizza"
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Meal/recipe name |
| `recipe_id` | string (UUID) | Present only if the suggestion is linked to a recipe. Omitted entirely (not null) if no recipe link. |

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid group UUID |
| `forbidden` | 403 | User is not a member of the specified group |
| `database_error` | 500 | Database failure |

---

### 6.5 meal_plan_create

Creates a new meal plan with a configurable duration (default 7 days) starting from a given date.

**Request:**
```json
{
  "event": "meal_plan_create",
  "data": {
    "group_id": "",
    "start_date": "2026-03-09",
    "num_days": 5,
    "last_modified_at": 1741427200000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string (UUID) | No | Empty = personal plan. Set = group plan. |
| `start_date` | string | No | Format: `YYYY-MM-DD`. Defaults to today (UTC). |
| `num_days` | int | No | Duration in days. Range: 1--30. Default: 7. The `end_date` is computed as `start_date + num_days`. |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `meal_plan_created`

**Response payload:** A `MealPlan` object.
```json
{
  "event": "meal_plan_created",
  "data": {
    "id": "pppppppp-0000-0000-0000-000000000001",
    "group_id": {"UUID": "00000000-0000-0000-0000-000000000000", "Valid": false},
    "user_id": "11111111-2222-3333-4444-555555555555",
    "start_date": "2026-03-09T00:00:00Z",
    "end_date": "2026-03-14T00:00:00Z",
    "created_at": "2026-03-08T20:00:00Z",
    "last_modified_at": 1741427200000
  }
}
```

**Broadcast scope:**
- If `group_id` is set: all group members.
- If personal: all sessions of the user.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, invalid UUID, invalid date format, or `num_days` outside 1--30 range |
| `forbidden` | 403 | User is not a member of the specified group |
| `database_error` | 500 | Database failure |

---

### 6.6 meal_plan_get

Fetches a meal plan with all its entries.

**Request:**
```json
{
  "event": "meal_plan_get",
  "data": {
    "id": "pppppppp-0000-0000-0000-000000000001"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (UUID) | Yes | Meal plan ID |

**Response event:** `meal_plan_data`

**Response payload:**
```json
{
  "event": "meal_plan_data",
  "data": {
    "plan": {
      "id": "pppppppp-0000-0000-0000-000000000001",
      "group_id": {"UUID": "00000000-0000-0000-0000-000000000000", "Valid": false},
      "user_id": "11111111-2222-3333-4444-555555555555",
      "start_date": "2026-03-09T00:00:00Z",
      "end_date": "2026-03-16T00:00:00Z",
      "created_at": "2026-03-08T20:00:00Z",
      "last_modified_at": 1741427200000
    },
    "entries": [
      {
        "id": "qqqqqqqq-0000-0000-0000-000000000001",
        "plan_id": "pppppppp-0000-0000-0000-000000000001",
        "date": "2026-03-09T00:00:00Z",
        "meal_type": {"String": "dinner", "Valid": true},
        "recipe_id": {"UUID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Valid": true},
        "name": "Pasta Carbonara",
        "assigned_by": "11111111-2222-3333-4444-555555555555",
        "created_at": "2026-03-08T20:05:00Z",
        "last_modified_at": 1741427200000
      }
    ]
  }
}
```

**Broadcast scope:** Sent only to the requesting client (SendToClient).

**Authorization:** User must be the plan creator or a member of the plan's group.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Plan not found |
| `forbidden` | 403 | User has no access to this plan |
| `database_error` | 500 | Database failure |

---

### 6.7 meal_plan_entry_set

Sets (creates or upserts) a meal plan entry for a specific date + meal type slot.

**Request:**
```json
{
  "event": "meal_plan_entry_set",
  "data": {
    "plan_id": "pppppppp-0000-0000-0000-000000000001",
    "date": "2026-03-10",
    "meal_type": "lunch",
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Pasta Carbonara",
    "last_modified_at": 1741427300000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `plan_id` | string (UUID) | Yes | Meal plan ID |
| `date` | string | Yes | Format: `YYYY-MM-DD` |
| `meal_type` | string or null | No | One of: `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"`, or null/empty. |
| `recipe_id` | string (UUID) | No | Optional recipe link. |
| `name` | string | Yes | Trimmed; must be non-empty |
| `last_modified_at` | int64 | No | Milliseconds since epoch |

**Response event:** `meal_plan_entry_updated`

**Response payload:** A `MealPlanEntry` object.
```json
{
  "event": "meal_plan_entry_updated",
  "data": {
    "id": "qqqqqqqq-0000-0000-0000-000000000002",
    "plan_id": "pppppppp-0000-0000-0000-000000000001",
    "date": "2026-03-10T00:00:00Z",
    "meal_type": {"String": "lunch", "Valid": true},
    "recipe_id": {"UUID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Valid": true},
    "name": "Pasta Carbonara",
    "assigned_by": "11111111-2222-3333-4444-555555555555",
    "created_at": "2026-03-08T20:10:00Z",
    "last_modified_at": 1741427300000
  }
}
```

**Broadcast scope:**
- If the plan has a `group_id`: all group members.
- If personal: all sessions of the user.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON, invalid UUID, empty name, invalid date or meal_type |
| `not_found` | 404 | Plan not found |
| `forbidden` | 403 | User has no access to this plan |
| `database_error` | 500 | Database failure |

---

### 6.8 meal_plan_entry_remove

Removes a meal plan entry.

**Request:**
```json
{
  "event": "meal_plan_entry_remove",
  "data": {
    "plan_id": "pppppppp-0000-0000-0000-000000000001",
    "entry_id": "qqqqqqqq-0000-0000-0000-000000000002"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `plan_id` | string (UUID) | Yes | Meal plan ID (used for access check) |
| `entry_id` | string (UUID) | Yes | Entry ID to remove |

**Response event:** `meal_plan_entry_removed`

**Response payload:**
```json
{
  "event": "meal_plan_entry_removed",
  "data": {
    "plan_id": "pppppppp-0000-0000-0000-000000000001",
    "entry_id": "qqqqqqqq-0000-0000-0000-000000000002"
  }
}
```

**Broadcast scope:**
- If the plan has a `group_id`: all group members.
- If personal: all sessions of the user.

**Error cases:**
| Error Type | Code | Condition |
|------------|------|-----------|
| `invalid_data` | 400 | Malformed JSON or invalid UUID |
| `not_found` | 404 | Plan not found |
| `forbidden` | 403 | User has no access to this plan |
| `database_error` | 500 | Database failure |

---

### 6.9 meal_plan_suggest_slot

Generates meal suggestions for filling a plan slot. This is a thin wrapper that delegates to the same logic as `meal_suggestions_get`.

**Request:** Same as `meal_suggestions_get` (section 6.4), including the optional `tag` field.
```json
{
  "event": "meal_plan_suggest_slot",
  "data": {
    "group_id": "",
    "meal_type": "",
    "tag": "fresh",
    "count": 3
  }
}
```

**Response event:** `meal_suggestions_data` (same as section 6.4).

**Behavior:** Identical to `meal_suggestions_get`, including tag-based filtering. The separate event name exists for semantic clarity in the frontend.

---

## 7. HTTP Endpoints

### 7.1 POST /api/recipes/{id}/images -- Upload Image

Uploads an image for a recipe. The image is decoded, resized (max 1200px on longest side), re-encoded as JPEG (quality 70), and stored on disk.

**URL:** `POST /api/recipes/{id}/images`

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| `X-Google-UID` | Yes | User's Google UID |
| `X-Email` | Yes | User's email |
| `Content-Type` | Yes | `multipart/form-data` |

**Form field:** `image` -- the image file (JPEG or PNG). Max size: 10 MB.

**Success response:** `201 Created`
```json
{
  "id": "cccccccc-0000-0000-0000-000000000001",
  "file_path": "uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg",
  "position": 0
}
```

**Side effect:** A `recipe_updated` WebSocket event is broadcast to the recipe owner's sessions and all group members:
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "image": {
      "id": "cccccccc-0000-0000-0000-000000000001",
      "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "file_path": "uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg",
      "position": 0,
      "created_at": "2026-03-08T12:01:00Z"
    }
  }
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | Invalid recipe ID, invalid image format, failed to read file |
| 401 | Missing or invalid auth headers |
| 403 | User does not own the recipe |
| 404 | Recipe not found |
| 500 | Server error |

---

### 7.2 DELETE /api/recipes/{id}/images/{imageID} -- Delete Image

Deletes an image from a recipe via HTTP.

**URL:** `DELETE /api/recipes/{id}/images/{imageID}`

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| `X-Google-UID` | Yes | User's Google UID |
| `X-Email` | Yes | User's email |

**Success response:** `204 No Content` (empty body).

**Side effect:** A `recipe_updated` WebSocket event is broadcast:
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "deleted_image_id": "cccccccc-0000-0000-0000-000000000001"
  }
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | Invalid recipe ID or image ID |
| 401 | Missing or invalid auth headers |
| 403 | User does not own the recipe |
| 404 | Recipe not found, image not found, or image does not belong to recipe |
| 500 | Server error |

---

### 7.3 PUT /api/recipes/{id}/images/{imageID} -- Replace Image

Replaces the image file content in-place. The DB record (ID, position) remains unchanged; only the file on disk is overwritten with the new image.

**URL:** `PUT /api/recipes/{id}/images/{imageID}`

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| `X-Google-UID` | Yes | User's Google UID |
| `X-Email` | Yes | User's email |
| `Content-Type` | Yes | `multipart/form-data` |

**Form field:** `image` -- the replacement image file (JPEG or PNG). Max size: 10 MB.

**Success response:** `200 OK`
```json
{
  "id": "cccccccc-0000-0000-0000-000000000001",
  "file_path": "uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg",
  "position": 0
}
```

**Side effect:** A `recipe_updated` WebSocket event is broadcast to the recipe owner's sessions and all group members:
```json
{
  "event": "recipe_updated",
  "data": {
    "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "image": {
      "id": "cccccccc-0000-0000-0000-000000000001",
      "recipe_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "file_path": "uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg",
      "position": 0,
      "created_at": "2026-03-08T12:01:00Z"
    }
  }
}
```

**Note:** The image is decoded, resized (max 1200px on longest side), and re-encoded as JPEG (quality 70), same as the upload endpoint. The `file_path` does not change.

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | Invalid recipe ID, invalid image ID, invalid image format, failed to read file |
| 401 | Missing or invalid auth headers |
| 403 | User does not own the recipe |
| 404 | Recipe not found, image not found, or image does not belong to recipe |
| 500 | Server error |

---

### 7.4 GET /uploads/recipes/{recipeID}/{imageID}.jpg -- Serve Image

Static file serving. No authentication required (public URLs).

**URL:** `GET /uploads/recipes/{recipeID}/{imageID}.jpg`

The server uses Go's `http.FileServer` to serve the `uploads/` directory.

**Example URL:** `/uploads/recipes/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cccccccc-0000-0000-0000-000000000001.jpg`

**Note:** The `file_path` field in image objects is the relative path from the server root. To construct the full URL, prepend the server base URL:
```
https://your-server.example.com/{file_path}
```

---

## 8. Data Types Reference

### UUID

Standard UUID v4 format: `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`.

All IDs are UUIDs. When sending a UUID to the server, send it as a plain string.

### Timestamps

All timestamps are serialized as RFC 3339 / ISO 8601 strings:
```
"2026-03-08T12:00:00Z"
```

When sending `eaten_at` to the server, use RFC 3339 format. When sending `start_date` or `date` (date-only fields), use `YYYY-MM-DD` format.

### last_modified_at

A `bigint` representing milliseconds since Unix epoch. Used for conflict resolution and sync ordering. The client should send the current time in milliseconds. If 0 or omitted, the server generates a value from its own clock.

### Nullable Fields

Go's nullable types serialize as structured JSON objects, NOT as simple `null`:

**`uuid.NullUUID`:**
```json
// Present:
{"UUID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Valid": true}

// Absent (null):
{"UUID": "00000000-0000-0000-0000-000000000000", "Valid": false}
```

**`sql.NullString`:**
```json
// Present:
{"String": "dinner", "Valid": true}

// Absent (null):
{"String": "", "Valid": false}
```

**IMPORTANT:** The frontend must check the `Valid` field to determine if a value is present. When `Valid` is `false`, the `UUID` or `String` field contains a zero value and should be ignored.

Fields using `uuid.NullUUID`: `group_id` (on Meal, MealPlan), `recipe_id` (on Meal, MealPlanEntry), `copied_recipe_id` (on RecipeSafe).

Fields using `sql.NullString`: `meal_type` (on Meal, MealPlanEntry), `quantity` (on RecipeIngredient), `unit` (on RecipeIngredient).

### meal_type Enum Values

```
"breakfast" | "lunch" | "dinner" | "snack"
```

Can also be null/absent (the field is optional).

### Group Role Enum Values

```
"owner" | "member"
```

- `owner` -- created the group, can add/remove members, can delete the group.
- `member` -- can view shared recipes, log meals, edit meal plans.

---

## 9. Sharing Model

### Personal Space vs Group Context

- **Personal space:** The user's own recipes, meals, and plans. No `group_id` in requests.
- **Group context:** Recipes shared into a group are visible to all members. Meals and plans can be created in a group context by providing `group_id`.

### How Workspace Switching Works

The frontend should track which context (personal or group) is active and include `group_id` in the relevant events:

- `recipe_list` with `group_id` -- shows recipes shared in that group.
- `recipe_list` without `group_id` -- shows user's own recipes.
- `meal_log` with `group_id` -- logs a meal in the group.
- `meal_list` with `group_id` -- lists meals logged in that group.
- `meal_plan_create` with `group_id` -- creates a group meal plan.
- `meal_suggestions_get` with `group_id` -- suggests from group recipes/history.

### Recipe Ownership and Visibility

- A recipe is always owned by one user (`user_id`).
- The owner can view and edit the recipe always (personal space).
- The recipe becomes visible to group members when it is explicitly shared via `recipe_group_share_recipe`.
- A recipe can be shared to multiple groups simultaneously.
- Only the owner can edit, delete, share, or unshare a recipe.
- Group members can view the recipe and its details (via `recipe_get`) but cannot modify it.

### Save/Bookmark Behavior

- A group member can save/bookmark another user's recipe using `recipe_save`.
- You cannot save your own recipe.
- **Saving immediately creates a personal copy** of the recipe (title, instructions, ingredients, tags, images). The copy is owned by the saving user and appears in their personal recipe list.
- Saving is idempotent (saving an already-saved recipe silently succeeds without creating a duplicate copy).
- Unsaving removes the bookmark link but **keeps the personal copy**. The user retains the cloned recipe in their personal collection.
- Saved recipes are tracked in the `recipe_saves` table, with `copied_recipe_id` pointing to the personal copy.

### Copy-on-Leave Mechanics

When a user is removed from a group (or leaves voluntarily), the server runs copy-on-leave for any saved recipes that do not already have a `copied_recipe_id` (i.e., saves that predate the instant-copy feature). In practice, since saving now always creates an instant copy, this is a no-op for newly saved recipes.

The same logic runs for every member when a group is deleted.

---

## 10. Planner Algorithm

### How Suggestions Work

The suggestion engine (`meal_suggestions_get` / `meal_plan_suggest_slot`) uses weighted random sampling to recommend meals. It favors items that haven't been eaten recently.

### Candidate Pool

Candidates come from two sources:
1. **User's recipes** (or group recipes if in group context) -- each recipe title becomes a candidate with a recipe ID link. If a `tag` filter is provided, only recipes with that tag are included.
2. **Meal history** -- unique meal names from past meal log entries that aren't already in the recipe list. **Note:** When a `tag` filter is active, meal history names are excluded entirely (only recipe-based candidates are used).

### Weight Formula

For each candidate:

```
if never_eaten:
    weight = 200  (maximum)
else:
    days_ago = (now - last_eaten_date) / 24 hours
    weight = min(days_ago ^ 1.5, 200)
```

**Examples:**
| Days Since Last Eaten | Weight |
|----------------------|--------|
| Never eaten | 200.0 |
| 1 day ago | 1.0 |
| 3 days ago | 5.2 |
| 7 days ago | 18.5 |
| 14 days ago | 52.4 |
| 30 days ago | 164.3 |
| 60+ days ago | 200.0 (capped) |

### Exclusions

Meals that are already assigned in the current active meal plan are excluded from suggestions. This prevents suggesting the same meal twice in one plan.

### Sampling

The algorithm uses **weighted random sampling without replacement**:
1. Compute total weight of all candidates.
2. Pick a random number in [0, totalWeight).
3. Select the candidate whose cumulative weight range contains that number.
4. Remove the selected candidate from the pool.
5. Repeat until `count` suggestions are generated or the pool is empty.

This means each call returns different results (randomized), but items not eaten recently are much more likely to appear.

### Meal Plan Structure

- A meal plan has a `start_date` and an `end_date` (both date-only). The duration is configurable via `num_days` (1--30, default 7).
- `end_date` = `start_date` + `num_days` days. The frontend should use `end_date` to determine the plan's date range.
- Entries can be set for any date (no hard enforcement of the date range).
- Each entry has: `date` + `meal_type` + `name` + optional `recipe_id`.

### How to Fill Slots

1. Create a plan: `meal_plan_create` with a start date.
2. For each slot, either:
   - **Manual:** Use `meal_plan_entry_set` with a chosen name/recipe.
   - **Suggested:** Call `meal_plan_suggest_slot` (or `meal_suggestions_get`) to get suggestions, then use `meal_plan_entry_set` to assign the chosen suggestion to a slot.
3. To clear a slot: `meal_plan_entry_remove`.
4. To re-suggest: remove the entry, then call suggestions again.

---

## 11. Error Response Format

All errors use the `connection_error` event:

```json
{
  "event": "connection_error",
  "data": {
    "type": "error_type_string",
    "message": "Human-readable description",
    "code": 400
  }
}
```

### Error Types

| Type | Code | Meaning |
|------|------|---------|
| `invalid_data` | 400 | Malformed JSON, missing required fields, invalid UUIDs, invalid enum values, empty required strings |
| `not_found` | 404 | Requested resource does not exist |
| `forbidden` | 403 | User does not have permission (not owner, not group member) |
| `database_error` | 500 | Internal server error (DB failure) |

---

## 12. Real-time Sync

### Broadcast Rules

| Event | Scope |
|-------|-------|
| `recipe_created` | All sessions of the creating user |
| `recipe_updated` (from update, ingredients, tags, image upload, image replace, image delete) | All sessions of the recipe owner + all members of all groups the recipe is shared to |
| `recipe_deleted` | All sessions of the owner + all members of groups the recipe was shared to |
| `recipe_saved` | All sessions of the saving user (includes `copied: true` on first save) |
| `recipe_unsaved` | All sessions of the user |
| `recipe_group_created` | All sessions of the creating user |
| `recipe_group_deleted` | All members of the group |
| `recipe_group_member_joined` | All members of the group (including new member) |
| `recipe_group_member_left` | All members of the group (including removed member) |
| `recipe_group_recipe_shared` | All members of the group |
| `recipe_group_recipe_unshared` | All members of the group (resolved before unsharing) |
| `meal_logged` | If group: all group members. If personal: all user sessions. |
| `meal_deleted` | If group: all group members. If personal: all user sessions. |
| `meal_plan_created` | If group: all group members. If personal: all user sessions. |
| `meal_plan_entry_updated` | If group plan: all group members. If personal: all user sessions. |
| `meal_plan_entry_removed` | If group plan: all group members. If personal: all user sessions. |

### Query-only Events (no broadcast)

These events return data only to the requesting client:
- `recipe_data` (from `recipe_get`)
- `recipe_list_data` (from `recipe_list`)
- `recipe_group_list_data` (from `recipe_group_list`)
- `recipe_saved_list_data` (from `recipe_saved_list`)
- `meal_list_data` (from `meal_list`)
- `meal_suggestions_data` (from `meal_suggestions_get` / `meal_plan_suggest_slot`)
- `meal_plan_data` (from `meal_plan_get`)

### Handling Updates for the Current View

When the frontend receives a broadcast event (e.g., `recipe_updated` while viewing a recipe detail):

1. **Check the ID** -- does this event match something currently displayed?
2. **Apply the update** -- merge the received data into the local state.
3. **Polymorphic `recipe_updated`** -- this event carries different payloads depending on what changed. Check which fields are present:
   - Has `title`, `instructions`, etc. -- full recipe update.
   - Has `ingredients` array -- ingredients replaced.
   - Has `tags` array -- tags replaced.
   - Has `image` object -- new image uploaded or existing image replaced (same structure for both).
   - Has `deleted_image_id` -- image was deleted.

### Multi-device Sync

All broadcast events go to ALL sessions of the relevant users (using BroadcastToSameUser). This means if a user has the app open on their phone and tablet simultaneously, both devices receive real-time updates.
