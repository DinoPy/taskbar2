# Unified Light Theme Design

## Goal

Migrate all 16+ window CSS files to a consistent warm light theme by centralizing
color tokens in `variables.css` and replacing hardcoded dark colors throughout.

## Design Decisions

### Theme Direction
- **Light theme** with warm olive/sage character
- Base hue: OKLCH hue 80 (current green/olive) stays
- Orange accent system stays for CTAs, active states, urgency
- Font: Nunito everywhere (replacing Inter, SF Pro, system-ui stacks)

### ADHD-Friendly UX Principles
- High contrast between states (active task, urgency, selection must pop on light bg)
- No information hiding: badges, counts, statuses always visible
- Consistent interactive patterns: buttons, inputs, hover states identical across windows
- Visual anchoring: headers, borders, section dividers for scanability

## Color Token Architecture (variables.css)

### Background Tiers
- `--color-bg-base`: page/window background (warm white, ~0.97 lightness)
- `--color-bg-primary`: main content area (very light sage, ~0.95 lightness)
- `--color-bg-secondary`: hover/zebra rows (light sage, ~0.90 lightness)
- `--color-bg-tertiary`: stronger contrast areas (medium sage, ~0.85 lightness)
- `--color-bg-elevated`: cards/panels (white or near-white, ~0.98 lightness)
- `--color-bg-hover`: interactive hover (dark sage, ~0.45 lightness)

### Text Tiers
- `--color-text-primary`: darkest (for headings, primary content)
- `--color-text-secondary`: medium (for labels, secondary info)
- `--color-text-tertiary`: lighter (for hints, placeholders)
- `--color-text-white`: white (for use on dark/accent backgrounds)
- `--color-text-warning`: orange-red (for warnings on light bg)

### Border Tiers
- `--color-border-primary`: default borders (medium sage)
- `--color-border-secondary`: stronger borders (darker sage)
- `--color-border-focus`: focus rings (orange-red accent)
- `--color-border-subtle`: very light borders for card edges

### Accent System (unchanged)
- Orange accent primary/hover/active for buttons and active states
- Status colors (error red, success green, warning orange, info) stay

### New Tokens Needed
- `--color-bg-sidebar`: sidebar panel background
- `--color-bg-header`: header/titlebar background
- `--color-bg-overlay`: modal/dialog backdrop
- `--color-bg-input`: form input background
- `--color-scrollbar-thumb`: scrollbar color
- `--color-scrollbar-track`: scrollbar track

## Font Unification

Replace all font stacks with:
```css
font-family: 'Nunito', sans-serif;
```

Remove from all files:
- `"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- `"SF Pro Text", "SF Pro Display", -apple-system, ...`
- `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

## Migration per Window

### Phase 1: Foundation
1. **variables.css** - Rebuild color tokens for light theme, add new semantic tokens

### Phase 2: Low-effort windows (already close to light)
2. **newStyles.css** (taskbar) - Minor cleanup, ensure all colors use vars
3. **styles.css** (old taskbar) - Same treatment
4. **addDue.css** - Already has light fallbacks, remove fallbacks, use vars
5. **variablePrompt.css** - Already uses vars, minor tweaks
6. **help.css** - Minimal, quick fix

### Phase 3: Medium-effort windows
7. **childrenStyles.css** (edit forms) - Light backgrounds, fix broken var refs
8. **completedTasksList.css** - Remove `color-scheme: dark`, convert inputs
9. **customCommands.css** - Light table/input styling
10. **taskSplit.css** - Remove `color-scheme: dark`, light backgrounds
11. **deleteConfirm.css** - Swap dark card to light card
12. **templates.css** - Replace oklch dark backgrounds with light vars

### Phase 4: High-effort windows (independent dark systems)
13. **calendar.css** - Full rewrite, remove local `:root`, use theme vars
14. **list.css** - Replace ~60 hardcoded dark hex colors
15. **notifications.css** - Replace dark rgba patterns, remove local vars
16. **reminder.css** - Replace local `:root`, full light conversion

## Consistency Checklist (per window)
- [ ] No hardcoded color values (hex, rgb, rgba, oklch)
- [ ] Uses `--color-*` variables from variables.css
- [ ] Font is Nunito
- [ ] `color-scheme: dark` removed
- [ ] No local `:root` color overrides
- [ ] Scrollbar styling uses theme vars
- [ ] Inputs/buttons follow shared pattern
- [ ] Hover/focus states use theme vars
