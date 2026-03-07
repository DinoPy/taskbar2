# Unified Light Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all 16 window CSS files to a consistent warm light theme with centralized OKLCH color tokens in variables.css.

**Architecture:** Redefine `variables.css` as the single source of truth for colors, then systematically replace hardcoded dark colors in each window's CSS. Also update BrowserWindow `backgroundColor` values in window factory files for windows that hardcode dark backgrounds. Font stack unified to Nunito everywhere.

**Tech Stack:** CSS (OKLCH color system), Electron BrowserWindow config

**Design doc:** `docs/plans/2026-03-07-unified-light-theme-design.md`

---

### Important Context

**CSS import chains per window:**

| Window | HTML file | CSS link in HTML | CSS @import |
|--------|-----------|-----------------|-------------|
| Main taskbar | `src/index.html` | variables.css + newStyles.css | newStyles.css imports Nunito |
| Old taskbar | `src/html/test.html` | styles.css (relative) | styles.css imports variables.css + Nunito |
| Edit (child) | `src/html/child.html` | variables.css + childrenStyles.css | childrenStyles.css imports variables.css + Nunito |
| Completed | `src/html/completedTasks.html` | variables.css + completedTasksList.css | completedTasksList.css imports variables.css |
| Calendar | `src/html/calendar.html` | calendar.css ONLY | NO variables.css import |
| Notifications | `src/html/notifications.html` | variables.css + notifications.css | NO @import in notifications.css |
| Custom commands | `src/html/customCommands.html` | variables.css + customCommands.css | customCommands.css imports variables.css |
| Add due | `src/html/addDue.html` | variables.css + addDue.css | none |
| Reminder | `src/html/reminder.html` | reminder.css ONLY | NO variables.css import |
| List | `src/html/list.html` | variables.css + list.css | none |
| Delete confirm | `src/html/deleteConfirm.html` | variables.css + deleteConfirm.css | deleteConfirm.css imports Nunito |
| Task split | `src/html/taskSplit.html` | variables.css + taskSplit.css | taskSplit.css imports variables.css + Nunito |
| Templates | `src/html/templates.html` | variables.css + templates.css | none |
| Variable prompt | `src/html/variablePrompt.html` | variables.css + variablePrompt.css | none |
| Help | `src/html/help.html` | variables.css + help.css | help.css imports variables.css |

**Windows with hardcoded BrowserWindow backgroundColor (need JS change):**
- `src/main/windows/templateWindow.js:29` — `backgroundColor: "#10121a"` (dark)
- `src/main/windows/calendarWindow.js:31` — `backgroundColor: "#10121a"` (dark)
- `src/main/windows/notificationsWindow.js:27` — `backgroundColor: "#1f1f1f"` (dark)

**Transparent windows (body CSS controls bg):** editWindow, deleteConfirmWindow, completionConfirmWindow, addDueWindow, reminderWindow, variablePromptWindow, listWindow, completedTasksWindow, taskSplitWindow

**Verification method:** After each task, run `npm start` and open the affected window(s) to visually verify the light theme is applied correctly. Look for: readable text on light backgrounds, visible borders, correct accent colors, no white-on-white or dark-on-dark text.

---

### Task 1: Rebuild variables.css color tokens for light theme

**Files:**
- Modify: `src/styles/variables.css`

**Step 1: Redefine the color tokens**

Replace the color section of `variables.css` (lines 1-138) with a light-theme-oriented token set. Keep the OKLCH system with hue 80. Key changes:

- `--color-bg-root` becomes warm white (~0.97 lightness) instead of dark (0.25)
- `--color-bg-primary` stays light (~0.95)
- `--color-bg-elevated` stays near-white (~0.98)
- `--color-bg-hover` becomes a medium sage for hover contrast
- Text colors flip: primary becomes dark, white stays for accent backgrounds
- Add new semantic tokens: `--color-bg-sidebar`, `--color-bg-header`, `--color-bg-overlay`, `--color-bg-input`, `--color-border-subtle`, `--color-scrollbar-thumb`, `--color-scrollbar-track`

```css
:root {
	box-sizing: content-box;
	/* ===========================================
	   SYSTEMATIC OKLCH COLOR SYSTEM — LIGHT THEME
	   =========================================== */

	/* Base Color Parameters */
	--hue-primary: 80;
	/* Green/olive hue */
	--hue-secondary: 100;
	/* Yellow-green hue */
	--hue-accent: 20;
	/* Orange-red hue */
	--hue-accent-light: 30;
	/* Orange hue */
	--hue-accent-dark: 15;
	/* Red-orange hue */

	/* Lightness Scale (light theme) */
	--lightness-darkest: 0.25;
	--lightness-darker: 0.35;
	--lightness-dark: 0.45;
	--lightness-medium: 0.55;
	--lightness-light: 0.75;
	--lightness-lighter: 0.90;
	--lightness-lightest: 0.95;

	/* Chroma Scale */
	--chroma-high: 0.15;
	--chroma-medium: 0.10;
	--chroma-low: 0.05;
	--chroma-minimal: 0.02;
	--chroma-intense: 0.20;

	/* ---- Background Colors (light) ---- */
	--color-bg-root: oklch(0.97 0.02 var(--hue-primary));
	--color-bg-primary: oklch(0.95 0.03 var(--hue-primary));
	--color-bg-secondary: oklch(0.90 0.04 var(--hue-primary));
	--color-bg-tertiary: oklch(0.85 0.05 var(--hue-primary));
	--color-bg-elevated: oklch(0.98 0.01 var(--hue-primary));
	--color-bg-hover: oklch(0.88 0.06 var(--hue-primary));

	/* Semantic background tokens */
	--color-bg-sidebar: oklch(0.93 0.03 var(--hue-primary));
	--color-bg-header: oklch(0.94 0.04 var(--hue-primary));
	--color-bg-overlay: rgba(0, 0, 0, 0.35);
	--color-bg-input: oklch(0.98 0.01 var(--hue-primary));

	/* ---- Border Colors ---- */
	--color-border-primary: oklch(0.82 0.05 var(--hue-primary));
	--color-border-secondary: oklch(0.72 0.07 var(--hue-primary));
	--color-border-focus: oklch(0.55 0.15 var(--hue-accent));
	--color-border-subtle: oklch(0.90 0.03 var(--hue-primary));
	--color-border-table: oklch(0.88 0.03 var(--hue-primary));

	/* ---- Text Colors ---- */
	--color-text-primary: oklch(0.25 0.06 var(--hue-primary));
	--color-text-secondary: oklch(0.40 0.05 var(--hue-primary));
	--color-text-tertiary: oklch(0.55 0.04 var(--hue-primary));
	--color-text-white: oklch(0.98 0.01 var(--hue-primary));
	--color-text-warning: oklch(0.45 0.15 var(--hue-accent));

	/* ---- Accent Colors (orange — unchanged logic) ---- */
	--color-accent-primary: oklch(0.55 0.20 var(--hue-accent));
	--color-accent-hover: oklch(0.48 0.20 var(--hue-accent));
	--color-accent-active: oklch(0.40 0.20 var(--hue-accent));
	--color-accent-light: oklch(0.75 0.15 var(--hue-accent-light));
	--color-accent-subtle: oklch(0.90 0.08 var(--hue-accent-light));
	--color-accent-dark: oklch(0.30 0.18 var(--hue-accent-dark));

	/* ---- Component Colors ---- */
	--color-task-bg: var(--color-bg-elevated);
	--color-task-border: var(--color-border-primary);
	--color-task-active-bg: var(--color-accent-primary);
	--color-task-active-border: var(--color-accent-hover);

	/* Input Colors */
	--color-input-bg: var(--color-bg-input);
	--color-input-border: var(--color-border-primary);
	--color-input-outline: var(--color-border-focus);

	/* Button Colors */
	--color-button-primary: var(--color-accent-primary);
	--color-button-primary-hover: var(--color-accent-hover);
	--color-button-primary-active: var(--color-accent-active);
	--color-button-secondary: var(--color-bg-tertiary);
	--color-button-secondary-hover: var(--color-border-secondary);

	/* Hover Colors */
	--color-hover-subtle: var(--color-bg-hover);

	/* Status Colors */
	--color-status-error: #dc2626;
	--color-status-success: #16a34a;
	--color-status-warning: #ea580c;
	--color-status-info: #f97316;

	/* Backward Compatibility */
	--color-primary: var(--color-bg-primary);
	--color-primary-border: var(--color-border-primary);
	--color-bg-base: var(--color-bg-root);

	/* Urgency Colors */
	--color-urgency-low: #4CAF50;
	--color-urgency-medium: #FFC107;
	--color-urgency-medium-high: #FF9800;
	--color-urgency-high: #FF5722;
	--color-urgency-critical: #F44336;

	/* Neon Colors (for active task animation) */
	--color-neon-red: #ff0000;
	--color-neon-orange-red: #ff4500;
	--color-neon-dark-orange: #ff8c00;
	--color-neon-orange: #ffa500;
	--color-neon-yellow: #ffff00;

	/* Dropdown Colors */
	--color-dropdown-edit-bg: var(--color-bg-elevated);
	--color-dropdown-edit-text: var(--color-text-primary);
	--color-dropdown-edit-hover: var(--color-bg-tertiary);

	--color-dropdown-delete-bg: var(--color-bg-root);
	--color-dropdown-delete-text: var(--color-text-primary);
	--color-dropdown-delete-hover: var(--color-bg-hover);

	/* Scrollbar */
	--color-scrollbar-thumb: oklch(0.75 0.05 var(--hue-primary));
	--color-scrollbar-track: oklch(0.92 0.02 var(--hue-primary));

	/* ... rest of variables.css (spacing, sizes, typography, etc.) stays unchanged ... */
```

Note: The spacing, sizes, typography, borders, shadows, animations, and z-index sections (lines 140-280) remain EXACTLY as they are — do not modify them.

**Step 2: Verify the main taskbar**

Run: `npm start`
Expected: The main taskbar should render with a warm light background, dark text, and orange accents. Tasks should be readable. Active task should still pop with orange.

**Step 3: Commit**

```bash
git add src/styles/variables.css
git commit -m "feat(theme): rebuild variables.css color tokens for light theme"
```

---

### Task 2: Update newStyles.css (main taskbar) for light theme

**Files:**
- Modify: `src/styles/newStyles.css`

**Step 1: Fix remaining dark-theme artifacts**

Changes needed:
- Line 122: `.taskListBadge.complete` — hardcoded `oklch(0.55 0.14 145)` → `var(--color-status-success)`
- Line 456: `.noActiveTaskWarning` text-shadow uses `#333333` — update for light bg: `text-shadow: 0px 0px 1px rgba(0,0,0,0.1), 0px 0px 10px rgba(0,0,0,0.05);`
- Line 464: `.noActiveTaskBodyWarning` — uses undefined `--color-button-warning-bg` → `var(--color-accent-subtle)`
- Line 508: `.commandHelp` box-shadow — `rgba(0, 0, 0, 0.3)` → `rgba(0, 0, 0, 0.08)`
- Line 551: `.task.urgency-critical` box-shadow — `rgba(244, 67, 54, 0.3)` → keep as-is (urgency glow is intentional)
- Line 573: `.task::after` text-shadow — `rgba(0, 0, 0, 0.5)` → `rgba(0, 0, 0, 0.3)`

**Step 2: Verify**

Run: `npm start`
Expected: Taskbar looks clean on light bg, urgency indicators visible, active task pops, no dark artifacts.

**Step 3: Commit**

```bash
git add src/styles/newStyles.css
git commit -m "fix(theme): clean up dark artifacts in main taskbar styles"
```

---

### Task 3: Update styles.css (old taskbar) for light theme

**Files:**
- Modify: `src/styles/styles.css`

**Step 1: Fix color references**

- Line 14: `color: var(--color-text-secondary)` → `color: var(--color-text-primary)` (main text should be primary on light bg)
- Line 130: `.firstTaskTimer` `color: var(--color-primary)` — this is meant to be a muted color on top of the green active task. Change to `color: var(--color-text-white)` to match active task text.

No other changes needed — this file already uses variables.

**Step 2: Commit**

```bash
git add src/styles/styles.css
git commit -m "fix(theme): update old taskbar styles for light theme"
```

---

### Task 4: Update addDue.css — remove hardcoded fallbacks

**Files:**
- Modify: `src/styles/addDue.css`

**Step 1: Remove all CSS fallback values**

This file uses `var(--color-bg-elevated, #fff)` pattern throughout. Remove all the fallback values since variables.css is always loaded:

- Replace all `var(--token, #fallback)` with just `var(--token)`
- Line 9: font-family → `'Nunito', sans-serif`
- Line 24: box-shadow `rgba(0, 0, 0, 0.18)` → `rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03)` (lighter shadow for light theme)

**Step 2: Commit**

```bash
git add src/styles/addDue.css
git commit -m "fix(theme): clean up addDue styles, remove fallback values"
```

---

### Task 5: Update variablePrompt.css — minor tweaks

**Files:**
- Modify: `src/styles/variablePrompt.css`

**Step 1: Update shadow and font**

- Line 21: box-shadow → lighter: `0 8px 32px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03)`
- Already uses `'Nunito'` — good.
- Already uses theme vars — good.

**Step 2: Commit**

```bash
git add src/styles/variablePrompt.css
git commit -m "fix(theme): lighten variablePrompt shadows"
```

---

### Task 6: Update help.css

**Files:**
- Modify: `src/styles/help.css`

**Step 1: Ensure light theme**

This file is minimal. Verify it uses `var(--color-primary)` for background (which is now light). No other changes likely needed.

**Step 2: Commit (if changes made)**

```bash
git add src/styles/help.css
git commit -m "fix(theme): update help window for light theme"
```

---

### Task 7: Update childrenStyles.css (edit window)

**Files:**
- Modify: `src/styles/childrenStyles.css`

**Step 1: Fix dark-theme artifacts**

- Line 109: `.tags-item:hover` `color: white` → `color: var(--color-text-white)` (this is on a hover bg, OK to keep)
- Line 113: `.btn.tags-button` has broken var: `var(--color-text-var(--color-text-white))` → `var(--color-text-white)`
- Line 184: `.submitBtn` same broken var → `var(--color-text-white)`
- Line 200: `.cancelBtn` `color: var(--color-text-white)` — this is a cancel button on light bg. Change to: `color: var(--color-text-primary)`, `border-color: var(--color-border-primary)`
- Line 204: `.cancelBtn:hover` `background-color: var(--color-text-secondary)` → `background-color: var(--color-bg-tertiary)`

**Step 2: Verify**

Run: `npm start`, open edit window (Cmd+Shift+E or click edit on a task)
Expected: Light background, readable form fields, buttons visible.

**Step 3: Commit**

```bash
git add src/styles/childrenStyles.css
git commit -m "fix(theme): update edit window for light theme, fix broken var refs"
```

---

### Task 8: Update completedTasksList.css

**Files:**
- Modify: `src/styles/completedTasksList.css`

**Step 1: Remove dark-scheme and fix colors**

- Line 171: `color-scheme: dark` — REMOVE this line
- Line 238: tags `.tags-input` `color-scheme: dark` — REMOVE
- Line 269: `.tags-item:hover` `color: white` → `color: var(--color-text-white)`
- Line 276: `button` `color: var(--color-text-white)` — this is on accent bg, keep

**Step 2: Commit**

```bash
git add src/styles/completedTasksList.css
git commit -m "fix(theme): remove dark color-scheme from completed tasks window"
```

---

### Task 9: Update customCommands.css

**Files:**
- Modify: `src/styles/customCommands.css`

**Step 1: Remove dark-scheme and fix colors**

- Line 27: `color-scheme: dark` — REMOVE this line

No other hardcoded colors — this file uses theme variables throughout.

**Step 2: Commit**

```bash
git add src/styles/customCommands.css
git commit -m "fix(theme): remove dark color-scheme from custom commands window"
```

---

### Task 10: Update taskSplit.css

**Files:**
- Modify: `src/styles/taskSplit.css`

**Step 1: Remove dark-scheme and fix colors**

- Line 192-193: `color-scheme: dark` on `input[type="text"]` and `input[type="time"]` — REMOVE
- Line 270: `.cancelBtn` `background-color: var(--color-status-error)` — change to: `background-color: transparent; color: var(--color-text-primary); border: 1px solid var(--color-border-primary);`
- Line 271: `.cancelBtn:hover` hardcoded `#c0392b` → `background-color: var(--color-bg-tertiary)`

**Step 2: Commit**

```bash
git add src/styles/taskSplit.css
git commit -m "fix(theme): remove dark color-scheme from task split, fix cancel button"
```

---

### Task 11: Update deleteConfirm.css

**Files:**
- Modify: `src/styles/deleteConfirm.css`

**Step 1: Convert dark card to light card**

- Line 21: `.confirm-card` `background: var(--color-bg-root)` — now resolves to light, OK
- Line 28: `border: 1px solid rgba(255, 255, 255, 0.05)` → `border: 1px solid var(--color-border-primary)`
- Line 27: box-shadow `rgba(0, 0, 0, 0.45)` → `rgba(0, 0, 0, 0.08)`
- Line 35: `.confirm-card h1` `color: var(--color-text-white)` → `color: var(--color-text-primary)`
- Line 41: `.confirm-summary` `color: rgba(255, 255, 255, 0.72)` → `color: var(--color-text-secondary)`
- Line 50: `.confirm-task-list` `color: rgba(255, 255, 255, 0.88)` → `color: var(--color-text-primary)`
- Line 75: `.confirm-button` `color: var(--color-text-white)` → keep (buttons are on accent bg)
- Line 78-79: `.confirm-button.cancel` `background: rgba(255, 255, 255, 0.08)` → `background: var(--color-bg-secondary); border-color: var(--color-border-primary);`
- Line 82: `.cancel:hover` `rgba(255, 255, 255, 0.18)` → `var(--color-bg-tertiary)`
- Line 77: `.confirm-button.cancel` `color` — add `color: var(--color-text-primary);`
- Line 117-118: `.list-status-header` `color: rgba(255, 255, 255, 0.82)` → `color: var(--color-text-primary)`
- All remaining `rgba(255, 255, 255, ...)` patterns → replace with appropriate theme vars

**Step 2: Verify**

Run: `npm start`, trigger delete on a task
Expected: Light card with dark text, red danger button, clean cancel button.

**Step 3: Commit**

```bash
git add src/styles/deleteConfirm.css
git commit -m "fix(theme): convert delete confirm dialog to light theme"
```

---

### Task 12: Update templates.css

**Files:**
- Modify: `src/styles/templates.css`

**Step 1: Replace all oklch dark backgrounds with theme vars**

This file has ~30 hardcoded oklch values. Replace systematically:

- `oklch(0.22 0.08 80)` (titlebar bg) → `var(--color-bg-header)`
- `oklch(0.20 0.06 80)` (input bg) → `var(--color-bg-input)`
- `oklch(0.35 0.05 80)` (input border) → `var(--color-border-primary)`
- `oklch(0.30 0.05 80)` (panel border) → `var(--color-border-secondary)`
- `oklch(0.28 0.06 80)` (card hover) → `var(--color-bg-hover)`
- `oklch(0.32 0.08 80)` (card active) → `var(--color-bg-tertiary)`
- `oklch(0.55 0.03 80)` (placeholder) → `var(--color-text-tertiary)`
- `oklch(0.65 0.04 80)` (label) → `var(--color-text-secondary)`
- `oklch(0.40 0.04 80)` (scrollbar) → `var(--color-scrollbar-thumb)`
- `oklch(0.40 0.05 80)` (dashed border) → `var(--color-border-primary)`
- `oklch(0.30 0.08 80)` (tag bg) → `var(--color-bg-secondary)`
- `oklch(0.40 0.12 20)` (tag hover) → `var(--color-accent-subtle)`
- `oklch(0.60 0.15 20)` (remove btn) → `var(--color-status-error)`
- `oklch(0.30 0.10 20)` (remove btn hover bg) → `rgba(220, 38, 38, 0.1)`
- `oklch(0.50 0.16 145)` (accent btn) → `var(--color-status-success)`
- `oklch(0.55 0.18 145)` (accent btn hover) → keep or use slightly lighter success
- `oklch(0.35 0.12 20)` (danger btn) → `var(--color-status-error)`
- `oklch(0.85 0.10 20)` (danger btn text) → `var(--color-text-white)`
- `oklch(0.70 0.04 80)` (var req label) → `var(--color-text-secondary)`
- `oklch(0.65 0.18 145)` (checkbox accent) → `var(--color-status-success)`
- `rgba(255,255,255,0.1)` patterns → light equivalent like `var(--color-bg-hover)`
- `.tpl-window` `background: var(--color-bg-root)` — already uses var, good
- `.tpl-status` backgrounds → use theme vars
- `color: var(--color-text-white)` → change most to `var(--color-text-primary)` (since bg is now light)

Also add Nunito font import at top if not present.

**Step 2: Update BrowserWindow backgroundColor**

Modify: `src/main/windows/templateWindow.js:29`
- Change `backgroundColor: "#10121a"` → `backgroundColor: "#f3f1ec"` (approximate hex of the light bg-root)

**Step 3: Verify**

Run: `npm start`, open templates window
Expected: Light background, readable labels, inputs visible on light bg.

**Step 4: Commit**

```bash
git add src/styles/templates.css src/main/windows/templateWindow.js
git commit -m "feat(theme): convert templates window to light theme"
```

---

### Task 13: Update calendar.css

**Files:**
- Modify: `src/styles/calendar.css`
- Modify: `src/html/calendar.html` (add variables.css import)
- Modify: `src/main/windows/calendarWindow.js:31` (fix backgroundColor)

**Step 1: Add variables.css to calendar.html**

Add before the calendar.css link:
```html
<link rel="stylesheet" href="../styles/variables.css" />
```

**Step 2: Update BrowserWindow backgroundColor**

Change `backgroundColor: "#10121a"` → `backgroundColor: "#f3f1ec"`

**Step 3: Replace the local :root block and all hardcoded colors**

Remove the entire `:root` block (lines 1-16) and replace all hardcoded colors:

- `var(--bg)` / `#10121a` → `var(--color-bg-root)`
- `var(--surface)` / `#1f2333` → `var(--color-bg-primary)`
- `var(--surface-muted)` / `#2b2f42` → `var(--color-bg-secondary)`
- `var(--border)` / `#343b5b` → `var(--color-border-primary)`
- `var(--text)` / `#f5f6fb` → `var(--color-text-primary)`
- `var(--accent)` / `#7c8cff` → `var(--color-accent-primary)`
- `var(--accent-strong)` / `#9eb4ff` → `var(--color-accent-hover)`
- `var(--summary)` / `#ffc770` → `var(--color-status-warning)`
- `rgba(0, 0, 0, 0.6)` shadow → `rgba(0, 0, 0, 0.06)`
- Font: replace `"Inter", system-ui, ...` → `'Nunito', sans-serif`
- `rgba(255, 255, 255, ...)` patterns → appropriate light-theme equivalents
- `rgba(245, 246, 251, 0.6)` text colors → `var(--color-text-secondary)` or `var(--color-text-tertiary)`
- `rgba(52, 59, 91, 0.3)` hour lines → `var(--color-border-subtle)`
- Event colors: keep the semantic coloring but adjust opacity/contrast for light bg
  - Calendar events: use lighter backgrounds with visible left borders
  - `rgba(124, 140, 255, 0.15)` → `rgba(100, 120, 220, 0.12)` (slightly adjusted for light)
  - `rgba(90, 199, 199, 0.22)` task events → keep similar but test contrast
  - `rgba(255, 186, 110, 0.25)` schedule events → keep similar
- Current time indicator `#ff4d4d` → keep (red line works on any bg)
- Scrollbar: `rgba(255, 255, 255, 0.2)` → `var(--color-scrollbar-thumb)`
- Detail card/overlay: convert from dark glass to light card with shadow
- All `rgba(255, 255, 255, 0.xx)` in detail card → `rgba(0, 0, 0, 0.xx)` or theme vars

Keep the `:root` variables that are layout-only (not colors):
```css
:root {
	--time-col-width: 60px;
	--header-height: 50px;
	--all-day-lane-height: 28px;
	--slot-height: 60px;
}
```

**Step 4: Verify**

Run: `npm start`, open calendar (Cmd+Shift+k area or however it opens)
Expected: Light calendar grid, readable day headers, visible hour lines, colored events pop on light bg.

**Step 5: Commit**

```bash
git add src/styles/calendar.css src/html/calendar.html src/main/windows/calendarWindow.js
git commit -m "feat(theme): convert calendar window to light theme"
```

---

### Task 14: Update list.css

**Files:**
- Modify: `src/styles/list.css`

**Step 1: Replace all hardcoded dark hex colors**

This file has ~60 hardcoded dark colors. Systematic replacements:

**Backgrounds:**
- `#1b1d23` (body bg) → `var(--color-bg-root)`
- `#1e2028` (header/footer bg) → `var(--color-bg-header)`
- `#1a1c22` (sidebar bg) → `var(--color-bg-sidebar)`
- `#20222a` (run item bg) → `var(--color-bg-elevated)`
- `#24262f` (hover bg) → `var(--color-bg-hover)`
- `#262a35` (active/target bg) → `var(--color-bg-tertiary)`
- `#2a2d38` (borders, subtle bg) → `var(--color-border-primary)`
- `#14161c` (dialog input bg) → `var(--color-bg-input)`
- `#3a3d4a` (action hover bg, scrollbar) → `var(--color-bg-tertiary)` / `var(--color-scrollbar-thumb)`

**Text colors:**
- `#e8e8e8` (primary text) → `var(--color-text-primary)`
- `#f0f0f0` (bright text) → `var(--color-text-primary)`
- `#d0d4e0` (item text) → `var(--color-text-primary)`
- `#b0b4c0` (secondary text) → `var(--color-text-secondary)`
- `#8a8f9d` (muted text) → `var(--color-text-tertiary)`
- `#6b7080` (dim text) → `var(--color-text-tertiary)`
- `#c0c4d0` (run title) → `var(--color-text-secondary)`
- `#e0e0e0` (hover text) → `var(--color-text-primary)`

**Status/accent:**
- `#ef4444` / `rgba(220, 38, 38, ...)` → `var(--color-status-error)` / use error var
- `#16a34a` / `rgba(22, 163, 74, ...)` → `var(--color-status-success)` / use success var
- `rgba(76, 175, 80, 0.12)` → keep for green status bg
- `rgba(0, 0, 0, 0.5)` overlay → `var(--color-bg-overlay)`
- `rgba(0, 0, 0, 0.3)` shadow → `rgba(0, 0, 0, 0.06)`
- `rgba(0, 0, 0, 0.5)` shadow → `rgba(0, 0, 0, 0.08)`

**Font:** Already uses `"Inter", system-ui, ...` → change to `'Nunito', sans-serif`

**OKLCH values** that reference variables with fallbacks:
- `oklch(var(--lightness-medium, 0.55) ...)` → remove the fallback values, just use `oklch(var(--lightness-medium) var(--chroma-intense) var(--hue-primary))`

**Step 2: Verify**

Run: `npm start`, open a list window
Expected: Light background, readable sidebar, clear item rows, visible progress bars.

**Step 3: Commit**

```bash
git add src/styles/list.css
git commit -m "feat(theme): convert list window to light theme"
```

---

### Task 15: Update notifications.css

**Files:**
- Modify: `src/styles/notifications.css`
- Modify: `src/main/windows/notificationsWindow.js:27` (fix backgroundColor)

**Step 1: Update BrowserWindow backgroundColor**

Change `backgroundColor: "#1f1f1f"` → `backgroundColor: "#f3f1ec"`

**Step 2: Replace all dark colors**

- Remove `:root` local vars (lines 1-4) or just keep `--notifications-max-height` and `--notifications-width`
- Body: `background: var(--color-bg-root)` (already), `color: var(--color-text-primary)` (was --color-text-white)
- Font: `"Inter", system-ui, ...` → `'Nunito', sans-serif`
- All `rgba(255, 255, 255, ...)` patterns → light-theme equivalents:
  - `rgba(255, 255, 255, 0.05)` bg → `var(--color-bg-elevated)`
  - `rgba(255, 255, 255, 0.1)` border → `var(--color-border-primary)`
  - `rgba(255, 255, 255, 0.08)` subtle → `var(--color-border-subtle)`
  - `rgba(255, 255, 255, 0.6)` text → `var(--color-text-secondary)`
  - `rgba(255, 255, 255, 0.85)` text → `var(--color-text-primary)`
  - `rgba(255, 255, 255, 0.45)` meta → `var(--color-text-tertiary)`
  - `rgba(255, 255, 255, 0.78)` body text → `var(--color-text-secondary)`
  - `rgba(255, 255, 255, 0.9)` → `var(--color-text-primary)`
  - `rgba(255, 255, 255, 0.2)` scrollbar → `var(--color-scrollbar-thumb)`
  - `rgba(255, 255, 255, 0.12)` hover → `var(--color-bg-hover)`
  - `rgba(255, 255, 255, 0.16)` active → `var(--color-bg-tertiary)`
  - `rgba(26, 26, 26, 0.95)` menu bg → `var(--color-bg-elevated)`
  - `rgba(255, 255, 255, 0.06)` input bg → `var(--color-bg-input)`
- `color: var(--color-text-white)` → `color: var(--color-text-primary)` (most instances)
- Keep urgency border colors (rgba green/blue/orange/red) — they work on light bg
- Pill urgency colors: adjust backgrounds to be slightly more visible on light, keep text as the urgency color
- `#000` (badge text) → keep (on orange bg)
- `#fff` → `var(--color-text-white)` where on accent bg
- `rgba(8, 12, 18, 0.62)` overlay → `var(--color-bg-overlay)`
- `rgba(20, 26, 37, 0.98)` dialog → `var(--color-bg-elevated)`
- Shadow values → lighter: `rgba(0, 0, 0, 0.45)` → `rgba(0, 0, 0, 0.08)`
- Schedule section header color → `var(--color-accent-primary)`
- `#81c784` (active status) → `var(--color-status-success)`

**Step 3: Verify**

Run: `npm start`, click notifications bell
Expected: Light notification cards, urgency borders visible, readable text.

**Step 4: Commit**

```bash
git add src/styles/notifications.css src/main/windows/notificationsWindow.js
git commit -m "feat(theme): convert notifications window to light theme"
```

---

### Task 16: Update reminder.css

**Files:**
- Modify: `src/styles/reminder.css`
- Modify: `src/html/reminder.html` (add variables.css import)

**Step 1: Add variables.css to reminder.html**

Add before the reminder.css link:
```html
<link rel="stylesheet" href="../styles/variables.css" />
```

**Step 2: Replace the local :root block and all hardcoded colors**

Remove the entire `:root` block (lines 1-21).

Systematic replacements:
- `var(--surface)` / `rgba(18, 22, 32, 0.78)` → `var(--color-bg-elevated)` with light shadow instead of backdrop blur
- `var(--surface-strong)` / `rgba(28, 33, 47, 0.92)` → `var(--color-bg-primary)`
- `var(--border)` / `rgba(255, 255, 255, 0.08)` → `var(--color-border-primary)`
- `var(--border-hover)` → `var(--color-border-secondary)`
- `var(--text)` / `#f2f5ff` → `var(--color-text-primary)`
- `var(--text-muted)` / `rgba(240, 242, 252, 0.68)` → `var(--color-text-secondary)`
- `var(--accent)` / `#7a9bff` → `var(--color-accent-primary)`
- `var(--accent-strong)` / `#9dc1ff` → `var(--color-accent-hover)`
- `var(--danger)` / `#ff6f7d` → `var(--color-status-error)`
- `var(--ok)` / `#51d1a1` → `var(--color-status-success)`
- `var(--warn)` / `#ffd27f` → `var(--color-status-warning)`
- `var(--pill-bg)` / `rgba(255, 255, 255, 0.08)` → `var(--color-bg-secondary)`
- `var(--pill-active)` / `rgba(255, 255, 255, 0.18)` → `var(--color-bg-tertiary)`
- `var(--input-bg)` → `var(--color-bg-input)`
- `var(--input-border)` → `var(--color-border-primary)`
- `var(--input-border-focus)` → `var(--color-border-focus)`
- `var(--font)` → `'Nunito', sans-serif`
- `var(--shadow)` → `0 24px 60px rgba(0, 0, 0, 0.06)`
- `rgba(255, 255, 255, ...)` patterns → same approach as notifications
- `.reminder-shell` — change `backdrop-filter: blur(30px)` to just a solid light bg with shadow (blur on light is subtle)
- `rgba(24, 28, 40, ...)` / `rgba(12, 15, 24, ...)` backgrounds → `var(--color-bg-primary)` / `var(--color-bg-secondary)`
- `rgba(68, 103, 200, 0.3)` selection shadow → `rgba(var(--hue-accent), 0.15)` or just `rgba(200, 120, 50, 0.15)`
- Preview card colored variants: `.ok` `.info` `.warn` → use lighter tinted versions for light bg

**Step 3: Verify**

Run: `npm start`, create a reminder
Expected: Light card with readable steps, pills visible, type options clear.

**Step 4: Commit**

```bash
git add src/styles/reminder.css src/html/reminder.html
git commit -m "feat(theme): convert reminder window to light theme"
```

---

### Task 17: Final pass — visual audit and cleanup

**Files:**
- All modified CSS files (spot fixes)

**Step 1: Open every window type and check**

Run `npm start` and test each window:
1. Main taskbar — task cards, urgency, active task, timer
2. Edit window (Cmd+Shift+E) — form fields, buttons, tags
3. Completed tasks (Cmd+Shift+C) — table, filters, date headers
4. Calendar — grid, events, detail overlay
5. Notifications — cards, urgency pills, tabs, schedules
6. Custom commands (Cmd+Shift+Z) — table, inputs
7. Task split — form, table
8. Delete confirm — dialog card, buttons
9. Add due — card, input, buttons
10. Reminder — steps, pills, type options
11. Templates — sidebar, editor, tags, variables
12. List — sidebar, items, run view, dialogs
13. Variable prompt — card, inputs
14. Help — content

**Step 2: Fix any issues found**

Common things to look for:
- White text on white background (missed `--color-text-white` → `--color-text-primary` conversion)
- Invisible borders (too light)
- Buttons that lost their text color
- Scrollbars still dark-styled
- Inputs that still say `color-scheme: dark`

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix(theme): visual audit fixes across all windows"
```

---

### Task 18: Commit design docs

**Step 1: Ensure both docs are tracked**

```bash
git add docs/plans/2026-03-07-unified-light-theme-design.md docs/plans/2026-03-07-unified-light-theme-plan.md
git commit -m "docs: add unified light theme design and implementation plan"
```
