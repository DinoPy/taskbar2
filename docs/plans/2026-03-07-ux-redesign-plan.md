# UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the color system from muddy olive/sage to clean warm whites with orange accent, then structurally rework the worst windows (completed tasks, notifications, reminder, calendar) and apply consistent component patterns across all remaining windows.

**Architecture:** Foundation-first approach. Update variables.css color tokens, then fix BrowserWindow backgrounds, then rework structural windows (JS+CSS+HTML), then visual-refresh-only windows (CSS only), then cross-window polish.

**Tech Stack:** CSS Custom Properties (OKLCH), Electron BrowserWindow, vanilla JS DOM manipulation, Nunito font.

**Design doc:** `docs/plans/2026-03-07-ux-redesign-design.md`

---

### Task 1: Update color tokens in variables.css

**Files:**
- Modify: `src/styles/variables.css:1-115`

**Step 1: Replace hue parameters (lines 9-17)**

Replace:
```css
--hue-primary: 80;
/* Olive/sage hue */
--hue-secondary: 100;
/* Yellow-green hue */
--hue-accent: 20;
/* Orange-red hue */
--hue-accent-light: 30;
/* Orange hue */
--hue-accent-dark: 15;
/* Red-orange hue */
```

With:
```css
--hue-primary: 65;
/* True warm hue */
--hue-accent: 38;
/* Warm orange hue */
```

Remove `--hue-secondary`, `--hue-accent-light`, `--hue-accent-dark` (unused after this change).

**Step 2: Replace background tokens (lines 21-30)**

```css
--color-bg-root: oklch(0.98 0.005 var(--hue-primary));
--color-bg-primary: oklch(0.96 0.008 var(--hue-primary));
--color-bg-secondary: oklch(0.93 0.010 var(--hue-primary));
--color-bg-tertiary: oklch(0.89 0.012 var(--hue-primary));
--color-bg-elevated: oklch(0.99 0.003 var(--hue-primary));
--color-bg-hover: oklch(0.95 0.010 var(--hue-primary));
--color-bg-sidebar: oklch(0.96 0.006 var(--hue-primary));
--color-bg-header: oklch(0.97 0.006 var(--hue-primary));
--color-bg-overlay: rgba(0, 0, 0, 0.35);
--color-bg-input: oklch(0.99 0.003 var(--hue-primary));
```

**Step 3: Replace text tokens (lines 33-37)**

```css
--color-text-primary: oklch(0.22 0.02 var(--hue-primary));
--color-text-secondary: oklch(0.45 0.015 var(--hue-primary));
--color-text-tertiary: oklch(0.58 0.01 var(--hue-primary));
--color-text-white: oklch(0.98 0.005 var(--hue-primary));
--color-text-warning: oklch(0.50 0.18 var(--hue-accent));
```

**Step 4: Replace border tokens (lines 40-44)**

```css
--color-border-primary: oklch(0.87 0.008 var(--hue-primary));
--color-border-secondary: oklch(0.78 0.012 var(--hue-primary));
--color-border-focus: oklch(0.65 0.22 var(--hue-accent));
--color-border-subtle: oklch(0.92 0.005 var(--hue-primary));
--color-border-table: oklch(0.90 0.006 var(--hue-primary));
```

**Step 5: Replace scrollbar tokens (lines 47-48)**

```css
--color-scrollbar-thumb: oklch(0.80 0.008 var(--hue-primary));
--color-scrollbar-track: oklch(0.94 0.004 var(--hue-primary));
```

**Step 6: Replace accent tokens (lines 51-56)**

```css
--color-accent-primary: oklch(0.65 0.22 var(--hue-accent));
--color-accent-hover: oklch(0.58 0.22 var(--hue-accent));
--color-accent-active: oklch(0.50 0.22 var(--hue-accent));
--color-accent-light: oklch(0.78 0.15 var(--hue-accent));
--color-accent-subtle: oklch(0.94 0.04 var(--hue-accent));
--color-accent-dark: oklch(0.40 0.22 var(--hue-accent));
```

**Step 7: Commit**

```bash
git add src/styles/variables.css
git commit -m "fix(theme): overhaul color system — hue 65, low chroma, orange hue 38"
```

---

### Task 2: Fix all BrowserWindow backgrounds

**Files:**
- Modify: `src/main/windows/editWindow.js` (line with setBackgroundColor "#1b1d23")
- Modify: `src/main/windows/completedTasksWindow.js` (line with setBackgroundColor "#1b1d23")
- Modify: `src/main/windows/customCommandsWindow.js` (line with setBackgroundColor "#1b1d23")
- Modify: `src/main/windows/taskSplitWindow.js` (line with setBackgroundColor "#1b1d23")
- Modify: `src/main/windows/helpWindow.js` (line with setBackgroundColor "#1b1d23")
- Modify: `src/main/windows/notificationsWindow.js` (backgroundColor "#f3f1ec")
- Modify: `src/main/windows/calendarWindow.js` (backgroundColor "#f3f1ec")
- Modify: `src/main/windows/templateWindow.js` (backgroundColor "#f3f1ec")
- Modify: `src/main/windows/listWindow.js` (setBackgroundColor "#f3f1ec")

**Step 1: Replace all backgroundColor values**

Every `"#1b1d23"` and `"#f3f1ec"` → `"#faf9f7"`

**Step 2: Commit**

```bash
git add src/main/windows/
git commit -m "fix(theme): unify all BrowserWindow backgrounds to #faf9f7"
```

---

### Task 3: Rework completed tasks — sort order and table structure (JS)

**Files:**
- Modify: `src/js/completedTasksList.js`

**Step 1: Fix sort order (line 83-85)**

Change date key sort from descending to ascending:
```javascript
// Before: return new Date(b) - new Date(a);
// After:
const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    return new Date(a) - new Date(b);
});
```

**Step 2: Remove ID column from table creation (around line 24-59)**

In `createTableElement()`, remove the `<th>` for ID. The remaining columns should be:
- Title (50%)
- Tags (15%)
- Category (10%)
- Duration (10%)
- Completed At (15%)

Remove any `<td>` that renders the task ID in row creation.

**Step 3: Replace emoji action buttons with SVG icons (lines 148-220)**

Replace emoji characters (`✏️`, `📋`, `✂️`, `🗑️`) with inline SVG or text labels. Add `title` attributes for tooltips:
- Edit: `title="Edit task"`, text content "Edit" or inline SVG pencil
- Duplicate: `title="Duplicate task"`, text content "Copy"
- Split: `title="Split task"`, text content "Split"
- Delete: `title="Delete task"`, text content "Delete"

Remove the `|` separator element.

**Step 4: Move action buttons inside title cell**

Instead of a separate actions column, append action buttons container to the title `<td>` with `position: relative` and actions `position: absolute; right: 8px; top: 50%; transform: translateY(-50%)`. Actions appear on row hover.

**Step 5: Commit**

```bash
git add src/js/completedTasksList.js
git commit -m "fix(ux): completed tasks — ascending sort, remove ID col, text action buttons"
```

---

### Task 4: Rework completed tasks — CSS redesign

**Files:**
- Modify: `src/styles/completedTasksList.css`

**Step 1: Redesign filter container (lines 176-188)**

Replace the two-row filter layout with a single horizontal row:
```css
.filter-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: 10px;
    padding: 8px 16px;
    margin-bottom: var(--spacing-md);
    gap: var(--spacing-sm);
    flex-wrap: wrap;
}
```

Remove `.stats-right` separate box — make stats inline text at right end of filter row:
```css
.stats-right {
    display: flex;
    gap: var(--spacing-md);
    margin-left: auto;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    border: none;
    padding: 0;
    min-width: auto;
}
```

**Step 2: Redesign table styles (lines 98-158)**

Remove vertical cell borders (`border-right` on `th` and `td`). Update header to use component language:
```css
th {
    color: var(--color-text-tertiary);
    background-color: var(--color-bg-secondary);
    font-size: 11px;
    padding: 12px 16px;
    text-transform: uppercase;
    text-align: left;
    border-bottom: 1px solid var(--color-border-subtle);
    border-right: none;
    letter-spacing: 0.04em;
}

td {
    padding: 12px 16px;
    background-color: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border-subtle);
    border-right: none;
    transition: background-color 0.15s;
    vertical-align: middle;
}

tr:hover td {
    background-color: var(--color-bg-hover);
}
```

**Step 3: Redesign action buttons (lines 295-352)**

```css
.action-buttons-row {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
}

tr:hover .action-buttons-row {
    opacity: 1;
}

.action-btn {
    background: none;
    border: none;
    font-size: 11px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.15s ease;
    color: var(--color-text-tertiary);
    font-family: 'Nunito', sans-serif;
    font-weight: 600;
}

.action-btn:hover {
    background-color: var(--color-bg-secondary);
    color: var(--color-text-primary);
}

.delete-btn:hover {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-status-error);
}
```

Remove `.action-separator`.

**Step 4: Redesign date headers (lines 354-385)**

```css
.date-header {
    color: var(--color-text-primary);
    font-weight: 600;
    font-size: var(--font-size-md);
    padding: 10px 16px;
    text-align: left;
    background-color: var(--color-bg-secondary);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.date-stats {
    color: var(--color-text-tertiary);
    font-weight: 400;
    font-size: var(--font-size-sm);
}
```

**Step 5: Style tags as pills in table**

Add new CSS:
```css
.tag-pill {
    display: inline-block;
    padding: 2px 8px;
    background: var(--color-bg-secondary);
    border-radius: 10px;
    font-size: 11px;
    color: var(--color-text-secondary);
    margin: 1px 2px;
}

.tag-pill.more {
    color: var(--color-text-tertiary);
    font-style: italic;
}
```

**Step 6: Commit**

```bash
git add src/styles/completedTasksList.css
git commit -m "fix(ux): completed tasks — redesign table, filters, actions, date headers"
```

---

### Task 5: Rework notifications — item structure and actions (JS)

**Files:**
- Modify: `src/js/notificationsWindow.js`

**Step 1: Replace urgency border-left with dot indicator**

In the `createNotificationItem()` function (around line 477-599), remove the `border-left-width: 4px` approach. Instead add a dot element as the first child of the notification content:
```javascript
const dot = document.createElement('span');
dot.className = `urgency-dot urgency-${urgency}`;
// Insert as first child of content area
```

**Step 2: Replace icon action buttons with text links**

Replace the SVG icon buttons (acknowledge/remind/archive around lines 536-570) with plain text buttons:
```javascript
// Instead of <img src="done.svg">
const ackBtn = document.createElement('button');
ackBtn.className = 'action-text-btn';
ackBtn.textContent = 'Dismiss';

const remindBtn = document.createElement('button');
remindBtn.className = 'action-text-btn';
remindBtn.textContent = 'Snooze';

const archiveBtn = document.createElement('button');
archiveBtn.className = 'action-text-btn';
archiveBtn.textContent = 'Archive';
```

Keep the same event handlers/IPC calls — just change the visual element.

**Step 3: Commit**

```bash
git add src/js/notificationsWindow.js
git commit -m "fix(ux): notifications — urgency dots, text action buttons"
```

---

### Task 6: Rework notifications — CSS redesign

**Files:**
- Modify: `src/styles/notifications.css`

**Step 1: Update notification items**

Remove `border-left-width: 4px` from `.notifications-item`. Add urgency dot styles:
```css
.notifications-item {
    display: grid;
    grid-template-columns: 1fr auto;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: 10px;
    padding: var(--spacing-sm) var(--spacing-md);
    gap: var(--spacing-sm);
}

.urgency-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-right: 6px;
    vertical-align: middle;
}

.urgency-dot.urgency-low { background: #16a34a; }
.urgency-dot.urgency-normal { background: #3b82f6; }
.urgency-dot.urgency-high { background: #f97316; }
.urgency-dot.urgency-max { background: #ef4444; }
.urgency-dot.urgency-ultimate { background: #dc2626; }
```

**Step 2: Update tab bar to bottom-border active style**

```css
.tab-nav {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: 0;
    margin-bottom: var(--spacing-md);
}

.tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-tertiary);
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 0;
    font-size: 12px;
    font-weight: 500;
    transition: color 0.15s ease, border-color 0.15s ease;
}

.tab-btn:hover {
    color: var(--color-text-primary);
    background: transparent;
}

.tab-btn.active {
    background: transparent;
    color: var(--color-accent-primary);
    border-bottom-color: var(--color-accent-primary);
    font-weight: 600;
}
```

**Step 3: Add text action button styles**

```css
.action-text-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.15s ease, color 0.15s ease;
    font-family: 'Nunito', sans-serif;
}

.action-text-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-accent-primary);
}
```

**Step 4: Simplify urgency pills — text only, no background**

```css
.pill.urgency-pill {
    background: none;
    padding: 0;
    font-weight: 600;
}

.pill.urgency-pill.urgency-low { color: #16a34a; }
.pill.urgency-pill.urgency-normal { color: #3b82f6; }
.pill.urgency-pill.urgency-high { color: #ea580c; }
.pill.urgency-pill.urgency-max { color: #dc2626; }
.pill.urgency-pill.urgency-ultimate { color: #b91c1c; }
```

**Step 5: Commit**

```bash
git add src/styles/notifications.css
git commit -m "fix(ux): notifications — clean cards, urgency dots, text actions, tab underline"
```

---

### Task 7: Rework reminder — CSS redesign

**Files:**
- Modify: `src/styles/reminder.css`

**Step 1: Update pills to outlined style**

```css
.pill {
    padding: 4px 12px;
    border-radius: 12px;
    background: transparent;
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-tertiary);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s ease;
}

.pill.active {
    background: transparent;
    border-color: var(--color-accent-primary);
    color: var(--color-accent-primary);
}

.pill.completed {
    color: var(--color-text-tertiary);
    border-color: var(--color-border-subtle);
}
```

**Step 2: Shrink type-option cards to compact rows**

```css
.type-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.type-option {
    position: relative;
    margin: 0;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--color-border-primary);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.type-option:hover,
.type-option:focus {
    border-color: var(--color-border-secondary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    outline: none;
}

.type-option.selected {
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px oklch(0.65 0.22 38 / 0.15);
}

.option-label {
    display: block;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 0;
}

.option-detail {
    display: block;
    font-size: 12px;
    color: var(--color-text-tertiary);
}
```

**Step 3: Clean up step card background**

Ensure `.step` uses `var(--color-bg-secondary)` (already set from previous migration, verify).

**Step 4: Commit**

```bash
git add src/styles/reminder.css
git commit -m "fix(ux): reminder — outlined pills, compact type options, cleaner steps"
```

---

### Task 8: Fix calendar alignment and polish

**Files:**
- Modify: `src/styles/calendar.css`

**Step 1: Increase time gutter width (line 4)**

```css
--time-col-width: 72px;
```

**Step 2: Right-align time text**

Find the time label styles and add:
```css
text-align: right;
padding-right: 8px;
```

**Step 3: Update today indicator colors to orange**

Find `.day-header-cell.today` styles (around line 230) and ensure they use `var(--color-accent-primary)` (should already from migration, verify).

**Step 4: Change current time line from red to orange**

Replace `#ff4d4d` (around lines 517, 530) with `var(--color-accent-primary)`:
```css
.current-time-indicator {
    background: var(--color-accent-primary);
}
.current-time-indicator::before {
    background: var(--color-accent-primary);
}
```

**Step 5: Increase event color saturation**

Update event type colors for better visibility on clean white:
```css
/* Schedule events - orange tint */
.calendar-event--schedule {
    background: rgba(249, 115, 22, 0.12);
    border-left-color: #f97316;
}

/* Reminder events - blue tint */
.calendar-event--reminder {
    background: rgba(59, 130, 246, 0.12);
    border-left-color: #3b82f6;
}

/* Task events - teal tint */
.calendar-event--task {
    background: rgba(20, 184, 166, 0.12);
    border-left-color: #14b8a6;
}
```

**Step 6: Commit**

```bash
git add src/styles/calendar.css
git commit -m "fix(ux): calendar — widen time gutter, orange time line, event color saturation"
```

---

### Task 9: Polish main taskbar

**Files:**
- Modify: `src/styles/newStyles.css`
- Modify: `src/index.html` (if needed for empty state text)

**Step 1: Update empty state (around line 447)**

Change `.noActiveTaskWarning` to be more friendly:
```css
.noActiveTaskWarning {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xl);
    font-weight: 600;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    line-height: 1.6;
}
```

If the HTML text "NO ACTIVE TASK" is hardcoded in `src/index.html`, change it to "No active task" (sentence case, less aggressive).

**Step 2: Add orange left border to active task**

Find `.task.activeTask` styles (around line 283) and add:
```css
border-left: 3px solid var(--color-accent-primary);
```

**Step 3: Commit**

```bash
git add src/styles/newStyles.css src/index.html
git commit -m "fix(ux): taskbar — friendlier empty state, orange active task border"
```

---

### Task 10: Improve edit/add window structure

**Files:**
- Modify: `src/html/child.html`
- Modify: `src/styles/childrenStyles.css`

**Step 1: Add visual section grouping to child.html**

Wrap form fields in section divs with subtle headers. Inside `<main>`, group fields:
```html
<section class="form-section">
    <h3 class="form-section-title">Task Details</h3>
    <!-- title label + input -->
    <!-- description label + textarea -->
</section>

<section class="form-section">
    <h3 class="form-section-title">Timing</h3>
    <!-- priority label + input -->
    <!-- due_at label + input -->
    <!-- show_before_due label + inputs -->
</section>

<section class="form-section">
    <h3 class="form-section-title">Organization</h3>
    <!-- category label + select -->
    <!-- tags label + input + button -->
    <!-- tags list container -->
</section>
```

Keep the dialog, submit button, and close icon outside sections.

**Step 2: Add section styles to childrenStyles.css**

```css
.form-section {
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-md);
    border-bottom: 1px solid var(--color-border-subtle);
}

.form-section:last-of-type {
    border-bottom: none;
}

.form-section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    margin: 0 0 var(--spacing-sm) 0;
}
```

**Step 3: Reduce textarea min-height**

Change textarea from `min-height: 160px; height: 160px` to `min-height: 80px; height: 80px`.

**Step 4: Standardize input sizing**

Ensure all inputs use:
```css
input, select {
    height: 36px;
    border-radius: 10px;
    padding: 0 12px;
    font-size: var(--font-size-md);
}
```

**Step 5: Commit**

```bash
git add src/html/child.html src/styles/childrenStyles.css
git commit -m "fix(ux): edit window — section grouping, smaller textarea, consistent inputs"
```

---

### Task 11: Visual refresh — remaining windows

**Files:**
- Modify: `src/styles/taskSplit.css`
- Modify: `src/styles/templates.css`
- Modify: `src/styles/list.css`
- Modify: `src/styles/customCommands.css`
- Modify: `src/styles/deleteConfirm.css`
- Modify: `src/styles/addDue.css`
- Modify: `src/styles/variablePrompt.css`
- Modify: `src/styles/help.css`

Apply consistent component patterns to all these files. For each:

**Step 1: Update table styles (where applicable)**

Remove `border-right` from `th` and `td`. Update `th` to use:
- `font-size: 11px`, `letter-spacing: 0.04em`, `text-transform: uppercase`
- `color: var(--color-text-tertiary)`, `background: var(--color-bg-secondary)`
- `padding: 12px 16px`

Update `td` to use `padding: 12px 16px`, no `border-right`.

**Step 2: Update button styles**

Ensure all `.btn`, `.submitBtn` use:
- `height: 36px`, `border-radius: 8px`, `font-weight: 600`
- Primary: `background: var(--color-accent-primary)`, `color: var(--color-text-white)`

Ensure all `.cancelBtn` use:
- `background: transparent`, `border: 1px solid var(--color-border-primary)`, `color: var(--color-text-primary)`

**Step 3: Update input styles**

All inputs: `height: 36px`, `border-radius: 10px`, `padding: 0 12px`.

**Step 4: Commit**

```bash
git add src/styles/taskSplit.css src/styles/templates.css src/styles/list.css \
  src/styles/customCommands.css src/styles/deleteConfirm.css src/styles/addDue.css \
  src/styles/variablePrompt.css src/styles/help.css
git commit -m "fix(ux): apply consistent component patterns to all remaining windows"
```

---

### Task 12: Cross-window polish

**Files:**
- Modify: Multiple CSS files (all windows)

**Step 1: Fix focus indicators**

Search all CSS files for `outline: none` without a replacement focus state. For each, add:
```css
:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
}
```

**Step 2: Add tooltips to icon buttons**

Search all JS files for icon-only buttons missing `title` attributes. Add descriptive titles.

**Step 3: Commit**

```bash
git add -A
git commit -m "fix(a11y): add focus indicators and button tooltips across all windows"
```

---

### Task 13: Final visual audit

**Step 1:** Open each window type and verify:
- Clean warm white backgrounds (no muddy olive tint)
- Orange accent pops clearly on buttons, active states, focus rings
- Tables have no vertical cell borders, generous padding
- Action buttons are text-based with hover states
- Inputs are consistent height (36px) and radius (10px)
- Font is Nunito everywhere

**Step 2:** Fix any remaining issues found.

**Step 3:** Final commit.

```bash
git commit -m "fix(theme): final visual audit cleanup"
```
