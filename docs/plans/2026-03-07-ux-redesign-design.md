# UX Redesign: Unified Warm Light Theme + Structural Improvements

**Date:** 2026-03-07
**Branch:** feat/unified-light-theme
**Approach:** Design System + Structural Rework (Approach B)

## 1. Color System

Shift from hue 80 (olive/sage) to hue 65 (true warm) with drastically reduced chroma. Backgrounds should read as "clean off-white with a whisper of warmth." Orange accent (hue 38) for all interactive elements.

### Backgrounds

| Token | New Value |
|-------|-----------|
| `--color-bg-root` | `oklch(0.98 0.005 65)` |
| `--color-bg-primary` | `oklch(0.96 0.008 65)` |
| `--color-bg-secondary` | `oklch(0.93 0.010 65)` |
| `--color-bg-tertiary` | `oklch(0.89 0.012 65)` |
| `--color-bg-elevated` | `oklch(0.99 0.003 65)` |
| `--color-bg-hover` | `oklch(0.95 0.010 65)` |
| `--color-bg-sidebar` | `oklch(0.96 0.006 65)` |
| `--color-bg-header` | `oklch(0.97 0.006 65)` |
| `--color-bg-input` | `oklch(0.99 0.003 65)` |
| `--color-bg-overlay` | `rgba(0, 0, 0, 0.35)` |

### Text

| Token | New Value |
|-------|-----------|
| `--color-text-primary` | `oklch(0.22 0.02 65)` |
| `--color-text-secondary` | `oklch(0.45 0.015 65)` |
| `--color-text-tertiary` | `oklch(0.58 0.01 65)` |
| `--color-text-white` | `oklch(0.98 0.005 65)` |

### Borders

| Token | New Value |
|-------|-----------|
| `--color-border-primary` | `oklch(0.87 0.008 65)` |
| `--color-border-secondary` | `oklch(0.78 0.012 65)` |
| `--color-border-subtle` | `oklch(0.92 0.005 65)` |
| `--color-border-focus` | `oklch(0.65 0.22 38)` |
| `--color-border-table` | `oklch(0.90 0.006 65)` |

### Accent (Orange)

| Token | New Value |
|-------|-----------|
| `--color-accent-primary` | `oklch(0.65 0.22 38)` |
| `--color-accent-hover` | `oklch(0.58 0.22 38)` |
| `--color-accent-active` | `oklch(0.50 0.22 38)` |
| `--color-accent-light` | `oklch(0.78 0.15 38)` |
| `--color-accent-subtle` | `oklch(0.94 0.04 38)` |

### Scrollbar

| Token | New Value |
|-------|-----------|
| `--color-scrollbar-thumb` | `oklch(0.80 0.008 65)` |
| `--color-scrollbar-track` | `oklch(0.94 0.004 65)` |

### BrowserWindow backgroundColor

All windows: `#faf9f7`

## 2. Component Design Language

### Buttons

- **Primary:** accent-primary bg, white text, 8px radius, 36px height
- **Secondary:** transparent bg, 1px border-primary, text-primary. Hover: bg-secondary
- **Danger:** status-error bg, white text. Only for destructive actions.
- Height: always 36px. Font: Nunito 14px, weight 600.

### Cards

- `background: var(--color-bg-elevated)`
- `border: 1px solid var(--color-border-subtle)`
- `border-radius: 10px`
- `padding: 12px 16px`
- No heavy box-shadows.

### Inputs

- 36px height, 10px radius
- bg-input background, border-primary border
- Focus: accent-primary border, `box-shadow: 0 0 0 2px oklch(0.65 0.22 38 / 0.15)`
- Font: Nunito 14px

### Tables

- Card wrapper (elevated bg, subtle border, 10px radius)
- Header: bg-secondary, 11px uppercase tertiary text, bottom border only
- Body: white bg, single bottom border (border-subtle), hover fills bg-hover
- Padding: 12px vertical, 16px horizontal
- No vertical cell borders

### Action Buttons (in-row)

- SVG icons with text tooltips, not emoji
- 28px height, appear on hover, fade in
- Danger actions visually separated

### Spacing

- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px
- Consistent everywhere

## 3. Per-Window Changes

### 3a. Completed Tasks (structural rework)

**Sort order:** Ascending — oldest day first, within each day oldest task first.

**Filter bar:** Single horizontal row:
```
[ Search ] [ Category ] [ Date from ] [ Date to ] [ Tags + Add ]   Tasks: N · Duration: Xh Ym
```
Stats as subtle right-aligned text, no separate box.

**Table columns:**
- Remove ID column
- Title (50%) | Tags (15%) | Category (10%) | Duration (10%) | Completed At (15%)
- Actions appear on row hover, right-aligned within title cell (no actions column)

**Date group headers:** Full-width row, date left-aligned, day stats right-aligned, bg-secondary background.

**Action buttons:** SVG icons (pencil, copy, scissors, trash) with tooltips. No emoji.

**Tags in table:** Small rounded pills, bg-secondary, text-secondary. If >2: "+N more" pill.

### 3b. Notifications (structural rework)

**Items:** Remove 4px border-left urgency indicator. Replace with 8px colored dot next to title. Card stays clean (elevated bg, subtle border).

**Action buttons:** Replace circle icon buttons with visible text links: "Snooze" | "Archive" | "Dismiss". Always visible (ADHD-friendly).

**Tab bar:** Active tab gets orange bottom border (2px), not background fill.

**Urgency pills:** Colored text only, no background fill. Dot already communicates urgency.

**Schedule RRULE:** Show human-readable text. Raw RRULE in tooltip only.

### 3c. Reminder (structural rework)

**Shell:** bg-elevated with subtle border. Body transparent.

**Pills:** Outlined style (border, no fill). Active: orange text + orange border. Completed: checkmark + tertiary text.

**Type selection:** Shrink to radio-style rows (icon + label + description) instead of large cards.

**Step cards:** bg-secondary background (light warm gray).

**Inputs:** Clean white bg, subtle border. Focus: orange border glow.

### 3d. Calendar (alignment fix + polish)

**Time gutter:** 72px width (from 60px). Right-align time text with 8px right padding.

**Grid alignment:** Header and body both use `72px repeat(7, 1fr)`.

**Today:** Orange filled circle on day number, orange text on day label.

**Event colors:** Higher saturation. Schedule=orange, task=blue, reminder=teal. 3px solid left border + subtle tinted bg.

**Current time line:** Orange (not red), small circle at left end.

### 3e. Main Taskbar (polish)

**Empty state:** Replace "NO ACTIVE TASK" with friendly message + keyboard shortcut hint.

**Task cards:** Use card pattern (elevated bg, subtle border).

**Active task:** Orange left border (3px) in addition to existing animation.

### 3f. Edit/Add Window (structural improvement)

**Field grouping:** Visual sections with subtle headers:
- "Task Details" — title, description
- "Timing" — duration, show-before-due
- "Organization" — category, tags

**Textarea:** Reduce min-height from 160px to 80px.

**Inputs:** Consistent 36px height, 10px radius per component language.

### 3g. Task Split, Templates, List, Custom Commands (visual refresh)

Apply new color system and component patterns only. No structural HTML changes.

- New button styles (primary/secondary/danger)
- New input styles (36px, 10px radius)
- New table styles (no vertical borders, generous padding)
- New card wrappers where applicable
- Consistent spacing scale

## 4. Cross-Window Improvements

- **Focus indicators:** Remove all `outline: none` without replacement. Add visible focus rings using accent color.
- **Tooltips:** All icon-only buttons get title attributes.
- **Empty states:** Every list/table gets a helpful empty state message.
- **Font:** Nunito everywhere, no exceptions.
