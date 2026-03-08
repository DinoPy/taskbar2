# Recipes & Food Planner — Design Document

**Date:** 2026-03-08
**Contract:** `docs/frontend_recipes_ws_contract.md`

## Goal

Add a Recipes & Food Planner module to Taskbar2 — a single-window Electron feature for managing recipes, sharing them in groups, logging meals, planning weekly menus, and getting meal suggestions.

## Architecture

Follow the Finance module pattern: a main-process controller handles WebSocket event routing and payload normalization, a window factory creates the BrowserWindow, and the renderer uses a centralized state store with pub/sub and section modules.

**Tech:** Electron IPC, WebSocket events, vanilla JS (no framework), CSS variables from `variables.css`.

---

## 1. Window: Single Window with Sidebar

- **Layout:** Frameless 1200×800 window with a left sidebar (200px) and main content area.
- **Sidebar sections:**
  1. **My Recipes** — personal recipe CRUD, ingredients, tags, images
  2. **Groups** — group CRUD, member management, shared recipes
  3. **Meal Log** — log meals, browse history
  4. **Planner** — create/view meal plans, fill slots manually or via suggestions
  5. **Saved** — bookmarked recipes (personal copies)
- **Workspace context:** Sidebar shows personal or group context. When a group is selected, recipes/meals/plans scope to that group via `group_id`.

## 2. Main Process: Controller (`recipesController.js`)

### Responsibilities
- Register WebSocket event handlers via `getSocketEventHandlers()` (same pattern as Finance)
- Forward renderer sends to server via `handleRendererSend(eventName, data)`
- **Normalize Go nullable types** in all incoming payloads before forwarding to renderer:
  - `uuid.NullUUID` (`{UUID, Valid}`) → plain string or `null`
  - `sql.NullString` (`{String, Valid}`) → plain string or `null`
  - Affected fields: `group_id`, `recipe_id`, `meal_type`, `quantity`, `unit`
- Route image HTTP requests (upload, replace, delete) through main process to keep credentials out of renderer
- Expose IPC invoke handlers: `recipes:upload-image`, `recipes:replace-image`, `recipes:delete-image`

### WebSocket Events Handled (27 server→client)
| Category | Events |
|----------|--------|
| Recipes | `recipe_created`, `recipe_data`, `recipe_list_data`, `recipe_updated`, `recipe_deleted` |
| Save/Bookmark | `recipe_saved`, `recipe_unsaved`, `recipe_saved_list_data` |
| Groups | `recipe_group_created`, `recipe_group_list_data`, `recipe_group_member_joined`, `recipe_group_member_left`, `recipe_group_deleted`, `recipe_group_recipe_shared`, `recipe_group_recipe_unshared` |
| Meals | `meal_logged`, `meal_deleted`, `meal_list_data` |
| Planner | `meal_plan_created`, `meal_plan_data`, `meal_plan_entry_updated`, `meal_plan_entry_removed` |
| Suggestions | `meal_suggestions_data` |
| Errors | `connection_error` |

### Polymorphic `recipe_updated` Handling
The controller inspects the payload to tag the change type before forwarding:
- Has `ingredients` array → type: `ingredients`
- Has `tags` array → type: `tags`
- Has `image` object → type: `image_added`
- Has `deleted_image_id` → type: `image_deleted`
- Otherwise → type: `metadata` (title/instructions)

## 3. Main Process: Window Factory (`recipesWindow.js`)

- 1200×800, frameless, `titleBarStyle: 'hiddenInset'`
- Preload: standard IPC bridge
- URL: `src/html/recipes.html`

## 4. Renderer Architecture

### State Store (`recipesState.js`)
Centralized state with pub/sub (same pattern as `financeState.js`):
```
state = {
  recipes: Map<id, Recipe>,
  savedRecipes: Map<id, Recipe>,
  groups: Map<id, RecipeGroup>,
  groupMembers: Map<groupId, Member[]>,
  meals: [],
  currentPlan: null,
  planEntries: Map<entryId, MealPlanEntry>,
  suggestions: [],
  activeSection: 'recipes',
  activeGroupId: null,
  selectedRecipeId: null,
  loading: Map<key, boolean>
}
```

### Section Modules
Each section implements `{ init(), render(), onEvent(name, data), destroy() }`:

1. **`recipesSection.js`** — Recipe list, detail view, create/edit form, ingredient editor, tag manager, image gallery
2. **`groupsSection.js`** — Group list, member management, shared recipe list, add-by-email
3. **`mealLogSection.js`** — Log form, meal history list with pagination, optional recipe link
4. **`plannerSection.js`** — Plan creation (date range picker), grid view (days × meal types), slot filling (manual or suggestion), suggestion panel with tag filter
5. **`savedSection.js`** — Saved recipe list, unsave action

### Main Window Module (`recipesWindow.js`)
- Initializes state, sections, IPC listeners
- Routes incoming events to active section's `onEvent`
- Manages sidebar navigation and workspace context switching

## 5. HTTP Image Flow

```
Renderer                    Main Process                  Server
   |                            |                           |
   |-- ipc.invoke               |                           |
   |   'recipes:upload-image'   |                           |
   |   {recipeId, filePath}     |                           |
   |                            |-- POST /api/recipes/      |
   |                            |   {id}/images             |
   |                            |   multipart/form-data     |
   |                            |                           |
   |                            |<-- 201 {image object}     |
   |<-- resolve(image)          |                           |
   |                            |                           |
   |                    (also receives recipe_updated        |
   |                     broadcast via WebSocket)            |
```

Same pattern for PUT (replace) and DELETE.

## 6. Client→Server Events (27 total)

### Recipes (11)
| Event | Purpose |
|-------|---------|
| `recipe_create` | Create recipe (title, instructions, last_modified_at) |
| `recipe_get` | Fetch single recipe with ingredients, images, tags |
| `recipe_list` | List recipes (personal or group context) |
| `recipe_update` | Update title/instructions (owner only) |
| `recipe_delete` | Delete recipe (owner only) |
| `recipe_ingredients_update` | Replace all ingredients (owner only) |
| `recipe_tags_update` | Replace all tags (owner only) |
| `recipe_image_delete` | Delete image via WS (owner only) |
| `recipe_save` | Bookmark recipe (creates personal copy) |
| `recipe_saved_list` | List saved/bookmarked recipes |
| `recipe_unsave` | Remove bookmark (keeps copy) |

### Groups (7)
| Event | Purpose |
|-------|---------|
| `recipe_group_create` | Create group |
| `recipe_group_list` | List user's groups |
| `recipe_group_member_add` | Add member by email (owner only) |
| `recipe_group_member_remove` | Remove member (owner removes any; member can self-remove) |
| `recipe_group_delete` | Delete group with copy-on-leave (owner only) |
| `recipe_group_share_recipe` | Share recipe to group |
| `recipe_group_unshare_recipe` | Remove recipe from group (owner only) |

### Meals & Planner (9)
| Event | Purpose |
|-------|---------|
| `meal_log` | Log a meal (name, meal_type, optional recipe_id) |
| `meal_delete` | Delete meal entry (creator only) |
| `meal_list` | List meals with pagination (limit 1-100) |
| `meal_suggestions_get` | Get weighted random suggestions (tag filter, exclusions) |
| `meal_plan_create` | Create plan (start_date, 1-30 days) |
| `meal_plan_get` | Fetch plan with entries |
| `meal_plan_entry_set` | Upsert plan slot (date + meal_type) |
| `meal_plan_entry_remove` | Clear plan slot |
| `meal_plan_suggest_slot` | Get suggestions for filling a slot |

## 7. Role-Based UI Guards

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| Recipe Owner | Edit, delete, share, manage ingredients/tags/images | — |
| Non-Owner | View, save/bookmark | Edit, delete, share |
| Group Owner | Add/remove members, delete group, unshare recipes | — |
| Group Member | View shared recipes, log meals, edit plans | Add/remove others, delete group |
| Meal Creator | Delete own meals | Delete others' meals |

Frontend should hide/disable controls based on ownership comparisons using `appState.serverUserId`.

## 8. Key Data Structures

### Recipe
`id`, `user_id`, `title`, `instructions`, `created_at`, `updated_at`, `last_modified_at`

### RecipeIngredient
`id`, `recipe_id`, `name`, `quantity` (nullable), `unit` (nullable), `position`

### RecipeImage
`id`, `recipe_id`, `file_path`, `position`, `created_at`

### RecipeTag
`id`, `recipe_id`, `tag` (alphabetical)

### RecipeGroup
`id`, `name`, `created_by`, `created_at`, `updated_at`, `last_modified_at`

### RecipeGroupMember
`id`, `group_id`, `user_id`, `role` ("owner"|"member"), `joined_at`

### Meal
`id`, `group_id` (nullable), `user_id`, `recipe_id` (nullable), `name`, `meal_type` (nullable), `eaten_at`, `created_at`, `last_modified_at`

### MealPlan
`id`, `group_id` (nullable), `user_id`, `start_date`, `end_date`, `created_at`, `last_modified_at`

### MealPlanEntry
`id`, `plan_id`, `date`, `meal_type` (nullable), `recipe_id` (nullable), `name`, `assigned_by`, `created_at`, `last_modified_at`

## 9. Files to Create

```
src/main/controllers/recipesController.js    # Controller
src/main/windows/recipesWindow.js            # Window factory
src/html/recipes.html                        # HTML template
src/styles/recipes.css                       # Styles
src/js/recipes/recipesWindow.js              # Main renderer module
src/js/recipes/recipesState.js               # Centralized state
src/js/recipes/recipesSection.js             # My Recipes section
src/js/recipes/groupsSection.js              # Groups section
src/js/recipes/mealLogSection.js             # Meal Log section
src/js/recipes/plannerSection.js             # Planner section
src/js/recipes/savedSection.js               # Saved section
```

## 10. Files to Modify

```
main.js                                      # Create controller, wire socket events, register window
src/main/ipc/registerHandlers.js             # Add recipes IPC handlers
src/main/socket/handlers.js                  # Spread recipes event handlers
src/main/controllers/windowManager.js        # Add openRecipesWindow method
```

## Coverage Verification

- **27/27 client→server events** covered across sections 1-5
- **27/27 server→client events** handled by controller + state store
- **4/4 HTTP endpoints** routed through main process IPC
- **9/9 data structures** represented in state store
- **8/8 special behaviors** addressed (workspace switching, roles, polymorphic updates, save/copy, copy-on-leave, image routing, suggestions, nullable normalization)
