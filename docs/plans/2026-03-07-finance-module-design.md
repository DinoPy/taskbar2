# Finance Module Design

## Overview

A personal finance module for Taskbar2, implemented as a single resizable Electron window with sidebar navigation across 9 sections. All data syncs via WebSocket using the `fin_*` event protocol defined in `frontend_finance_ws_contract.md`.

## Window & Navigation

- Single resizable window (~1200x800 default), dark theme matching existing app
- Dense dashboard-style layout (tighter spacing, smaller type where appropriate)
- Fixed sidebar (~180px) with icon + label per section, accent highlight on active
- Content area: scrollable, section renders into `#content` container
- Opened via context menu item + custom command (no global shortcut)
- Managed by WindowManager singleton

### Sections (sidebar order)

1. Dashboard
2. Accounts
3. Transactions
4. Transfers
5. Subscriptions
6. Budgets
7. Reports
8. Payees
9. Categories

## Main Process Architecture

### financeController.js

Thin event-forwarding controller:
- Registers all `fin_*` socket event handlers
- Forwards server events to finance window via IPC
- Exposes `sendEvent(event, data)` for renderer-initiated actions
- Tracks no state

### IPC Pattern

```
Renderer -> Main:  ipc.send("fin-send", { event, data })
Main -> Renderer:  win.webContents.send("fin-event", { event, data })
```

Single IPC channel pair. Controller wraps/unwraps WebSocket envelope.

### Integration Points

- `main.js`: Create financeController, pass to windowManager and registerHandlers
- `socket/handlers.js`: Register `fin_*` events to forward to financeController
- `ipc/registerHandlers.js`: Register `fin-send` listener
- `menus/index.js`: Add "Finance" menu item
- `windowManager.js`: Add `openFinanceWindow()` / `closeFinanceWindow()`

## Renderer Module Architecture

### Files in `src/js/finance/`

| File | Purpose |
|------|---------|
| `financeWindow.js` | Entry point, IPC listener, sidebar nav, event dispatch |
| `financeState.js` | Shared state store with pub/sub |
| `financeUtils.js` | Cents conversion, date/currency formatting, SVG chart helpers |
| `financeDashboard.js` | Dashboard overview |
| `financeAccounts.js` | Account CRUD, card grid |
| `financeTransactions.js` | Transaction list, filters, infinite scroll, forms |
| `financeTransfers.js` | Transfer creation form |
| `financeSubscriptions.js` | Subscription management |
| `financeBudgets.js` | Monthly budget with category allocations |
| `financeReports.js` | 5 report types with SVG charts + data tables |
| `financePayees.js` | Payee CRUD and search |
| `financeCategories.js` | Category list editor |

### Module Interface

Each section exports:
```js
export function init(ctx) {}        // receive shared context
export function render(container) {} // render into content area
export function onEvent(event, data) {} // handle WebSocket events
export function destroy() {}        // cleanup on section switch
```

### State

Simple pub/sub object holding accounts (Map), transactions (array), payees (Map), subscriptions (Map), budgets, categories. Sections subscribe to state changes.

## Section Designs

### Dashboard

Top banner: net worth with assets/liabilities breakdown.
2x2 grid: account cards with balances, upcoming subscriptions (14 days), recent transactions (5), income vs expense bar for current month.
Click any card to navigate to its section.

### Accounts

Card grid, color-coded by account type. Create/edit via inline panel. Archive toggle. Drag-to-reorder support.

### Transactions

Filterable table: account, date range, category, search text. Columns: date, description, category, payee, amount (color-coded). Add button opens form panel. Infinite scroll pagination. Split indicator with expandable detail.

### Transfers

Form: source account -> target account -> amount -> date -> description. Shows both account balances for reference.

### Subscriptions

Card list grouped by status (active/paused/cancelled). Card shows: name, amount, frequency, next due, icon. Actions: pause/resume/cancel/confirm. Summary bar with monthly/yearly totals.

### Budgets

Month picker. Category rows: name, budgeted (editable), actual, remaining, progress bar. Colors: green (under), yellow (near limit), red (over). Copy from previous month button.

### Reports

Tab sub-navigation for 5 report types. Shared date range picker.
- Spending by category: SVG bar chart + table
- Income vs expense: stacked bars + summary
- Net worth: line chart + snapshot table
- Spending trends: line chart by month
- Top payees: horizontal bar chart + table

### Payees

Searchable list with name and notes. Inline create/edit. Delete with confirmation.

### Categories

Comma-separated list editor. Add/remove/reorder.

## Data Rules

- All amounts stored as bigint (cents). Display as `amount / 100` with 2 decimal places.
- Currency default: RON
- Fetch data on demand when entering finance module (not on app boot)
- Re-fetch on WebSocket reconnect for any visible surface
- Account balances are computed on-read; refetch after transaction mutations
- Transfers create two linked transactions; handle both on create/delete
