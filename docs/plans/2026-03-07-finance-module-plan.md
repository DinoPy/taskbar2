# Finance Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full personal finance module with accounts, transactions, transfers, subscriptions, budgets, reports, payees, and categories — all synced via WebSocket.

**Architecture:** Single Electron window with sidebar navigation, thin main-process controller forwarding `fin_*` WebSocket events via a single IPC channel pair (`fin-send` / `fin-event`), modular renderer files per section with shared state store and pub/sub reactivity.

**Tech Stack:** Vanilla JS, Electron BrowserWindow, WebSocket (existing `ws.js`), CSS with existing design tokens from `variables.css`, hand-rolled SVG charts.

---

### Task 1: Window Factory and HTML Template

**Files:**
- Create: `src/main/windows/financeWindow.js`
- Create: `src/html/finance.html`

**Step 1: Create the window factory**

Follow the pattern from `src/main/windows/calendarWindow.js`. Create `src/main/windows/financeWindow.js`:

```js
import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export function createFinanceWindow({ screenIndex, onClose } = {}) {
	const allDisplays = screen.getAllDisplays();
	const normalizedIndex = Number.isInteger(screenIndex)
		? Math.min(Math.max(screenIndex, 0), allDisplays.length - 1)
		: 0;
	const targetDisplay = allDisplays[normalizedIndex] || screen.getPrimaryDisplay();
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 900,
		minHeight: 550,
		movable: true,
		show: true,
		frame: false,
		resizable: true,
		title: "Finance",
		backgroundColor: "#121B22",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/finance.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
```

**Step 2: Create the HTML template**

Create `src/html/finance.html` with the sidebar + content area shell. Link to `../styles/variables.css` and `../styles/finance.css`. Script tag loads `../js/finance/financeWindow.js` as module.

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Finance</title>
	<link rel="stylesheet" href="../styles/variables.css" />
	<link rel="stylesheet" href="../styles/finance.css" />
</head>
<body>
	<div class="fin-app">
		<nav class="fin-sidebar" id="fin-sidebar">
			<div class="fin-sidebar-header">
				<span class="fin-sidebar-title">Finance</span>
				<button class="fin-close-btn" id="fin-close-btn" title="Close">&times;</button>
			</div>
			<ul class="fin-nav-list" id="fin-nav-list">
				<!-- Nav items rendered by JS -->
			</ul>
		</nav>
		<main class="fin-content" id="fin-content">
			<!-- Active section renders here -->
		</main>
	</div>
	<script type="module" src="../js/finance/financeWindow.js"></script>
</body>
</html>
```

**Step 3: Commit**

```
git add src/main/windows/financeWindow.js src/html/finance.html
git commit -m "feat(finance): add window factory and HTML template"
```

---

### Task 2: Finance CSS

**Files:**
- Create: `src/styles/finance.css`

**Step 1: Create the stylesheet**

Create `src/styles/finance.css` with styles for the shell layout (sidebar, content area, nav items), plus base component styles that all sections share (cards, tables, forms, buttons, progress bars). Use CSS variables from `variables.css`. Dense dashboard aesthetic: tighter spacing, smaller font sizes where appropriate.

Key classes to define:
- `.fin-app` — full viewport flex container
- `.fin-sidebar` — 180px fixed width, dark bg
- `.fin-sidebar-header` — title + close button
- `.fin-nav-list` / `.fin-nav-item` — nav items with icon + label
- `.fin-nav-item.active` — accent highlight
- `.fin-content` — flex-grow scrollable area
- `.fin-close-btn` — frameless window close
- `.fin-section-header` — section title bar
- `.fin-card` — generic card component
- `.fin-table` — dense data table
- `.fin-form` — form layout for create/edit panels
- `.fin-form-row` — label + input row
- `.fin-input`, `.fin-select`, `.fin-textarea` — form controls
- `.fin-btn`, `.fin-btn-primary`, `.fin-btn-secondary`, `.fin-btn-danger` — buttons
- `.fin-progress-bar` — budget progress bars
- `.fin-amount-positive`, `.fin-amount-negative` — colored amounts
- `.fin-empty-state` — empty content placeholder
- `.fin-filter-bar` — filter controls row
- `.fin-badge` — status badges
- `.fin-tabs` / `.fin-tab` — tab navigation (for reports)
- `.fin-chart-container` — SVG chart wrapper
- `.fin-modal-overlay` / `.fin-modal` — inline modal for confirmations

Use the frontend-design skill guidelines: match existing dark theme, dense layout, accent color for active states. No generic fonts — use system font stack that matches the rest of the app.

**Step 2: Commit**

```
git add src/styles/finance.css
git commit -m "feat(finance): add finance stylesheet"
```

---

### Task 3: Finance Controller (Main Process)

**Files:**
- Create: `src/main/controllers/financeController.js`

**Step 1: Create the controller**

Thin event-forwarding controller. All `fin_*` server events get forwarded to the finance window. The renderer sends events via a single `fin-send` IPC channel.

```js
export function createFinanceController({ windowManager, sendEvent }) {
	const FIN_SERVER_EVENTS = [
		"fin_account_created", "fin_account_updated", "fin_account_archived",
		"fin_account_deleted", "fin_accounts_list", "fin_accounts_reordered",
		"fin_transaction_created", "fin_transaction_updated", "fin_transaction_deleted",
		"fin_transactions_list", "fin_transfer_created",
		"fin_transaction_split_updated", "fin_transaction_splits_list",
		"fin_payee_created", "fin_payee_updated", "fin_payee_deleted",
		"fin_payees_list", "fin_payee_results",
		"fin_subscription_created", "fin_subscription_updated", "fin_subscription_deleted",
		"fin_subscriptions_list", "fin_subscription_confirmed",
		"fin_subscriptions_upcoming", "fin_subscriptions_summary",
		"fin_budget_updated", "fin_budget_category_updated", "fin_budget_category_deleted",
		"fin_budget_data",
		"fin_report_spending_by_category", "fin_report_income_vs_expense",
		"fin_report_net_worth", "fin_report_spending_trends", "fin_report_top_payees",
		"fin_categories_updated", "fin_categories_data",
	];

	const forwardToFinanceWindow = (event, data) => {
		const win = windowManager.getFinanceWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("fin-event", { event, data });
		}
	};

	const getSocketEventHandlers = () => {
		const handlers = {};
		for (const eventName of FIN_SERVER_EVENTS) {
			handlers[eventName] = ({ data }) => forwardToFinanceWindow(eventName, data);
		}
		return handlers;
	};

	const handleRendererSend = (eventName, data) => {
		sendEvent?.(eventName, data);
	};

	return {
		getSocketEventHandlers,
		handleRendererSend,
		forwardToFinanceWindow,
	};
}
```

**Step 2: Commit**

```
git add src/main/controllers/financeController.js
git commit -m "feat(finance): add finance controller for event forwarding"
```

---

### Task 4: Wire Controller into Main Process

**Files:**
- Modify: `main.js` (import, create controller, pass to windowManager, register IPC, add to socket handlers, add to devtools, add to close handler)
- Modify: `src/main/controllers/windowManager.js` (add finance window state + open/close/get methods)
- Modify: `src/main/socket/handlers.js` (spread finance event handlers into eventHandlers)
- Modify: `src/main/ipc/registerHandlers.js` (add `fin-send` IPC listener)
- Modify: `src/main/menus/index.js` (add "Finance" menu item)

**Step 1: Add finance to windowManager**

In `src/main/controllers/windowManager.js`:
- Add `createFinanceWindow` to the factory function parameter (line 1)
- Add `finance: null` to `state` object (after line 35)
- Add `openFinanceWindow`, `getFinanceWindow`, `closeFinanceWindow` methods (follow the `openCalendarWindow` pattern, lines 215-238)

**Step 2: Update main.js**

- Import `createFinanceWindow` factory (after line 21, follow the pattern)
- Import `createFinanceController` (after line 36)
- Pass `createFinanceWindow` to `createWindowManager` (after line 120)
- Create `financeController` after `listsController` (around line 232):
  ```js
  const financeController = createFinanceController({
  	windowManager,
  	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
  });
  ```
- Pass `financeController` to `createSocketHandlers` (after line 368)
- Pass `financeController` to `registerIpcHandlers` (after line 413)
- Add `windowManager.getFinanceWindow()?.webContents.openDevTools()` in the devtools shortcut (after line 503)
- Add `windowManager.closeFinanceWindow()` in `handleCloseAppRequest` (after line 449)
- Add an `openFinanceWindow` function similar to `openCalendarWindowOnFocusedScreen` (after line 720)
- Pass `openFinanceWindow` to `showMainContextMenu` (line 313 area)

**Step 3: Update socket handlers**

In `src/main/socket/handlers.js`:
- Add `financeController` to the destructured parameters (line 12)
- Spread finance event handlers into `eventHandlers` object (before `return` at line 665):
  ```js
  ...(financeController?.getSocketEventHandlers?.() ?? {}),
  ```
- Also forward `connection_error` to financeController (in the `connection_error` handler, around line 204):
  ```js
  financeController?.forwardToFinanceWindow?.("connection_error", normalized);
  ```

**Step 4: Update IPC handlers**

In `src/main/ipc/registerHandlers.js`:
- Add `financeController` to the destructured parameters (line 1)
- Add IPC listener near the end:
  ```js
  ipc.on("fin-send", (_, data) => {
  	if (!data?.event) return;
  	financeController?.handleRendererSend?.(data.event, data.data ?? {});
  });
  ```

**Step 5: Update menus**

In `src/main/menus/index.js`:
- Add `openFinanceWindow` to `showMainContextMenu` parameters (line 15 area)
- Add "Finance" menu item in the WINDOWS section (after "Templates" menu item, around line 156):
  ```js
  menu.append(
  	new MenuItem({
  		label: "Finance",
  		toolTip: "Open the personal finance manager",
  		click: () => openFinanceWindow?.(),
  	})
  );
  ```

**Step 6: Commit**

```
git add main.js src/main/controllers/windowManager.js src/main/socket/handlers.js src/main/ipc/registerHandlers.js src/main/menus/index.js
git commit -m "feat(finance): wire controller into main process pipeline"
```

---

### Task 5: Finance State Store

**Files:**
- Create: `src/js/finance/financeState.js`

**Step 1: Create the state module**

Simple pub/sub state store. Sections subscribe to state keys and get notified on changes.

```js
const state = {
	accounts: new Map(),
	transactions: [],
	transactionsHasMore: true,
	transactionsOffset: 0,
	payees: new Map(),
	subscriptions: new Map(),
	budget: null,
	budgetCategories: [],
	categories: [],
	reports: {},
};

const listeners = new Map();

export function getState() { return state; }

export function on(key, callback) {
	if (!listeners.has(key)) listeners.set(key, new Set());
	listeners.get(key).add(callback);
	return () => listeners.get(key).delete(callback);
}

export function emit(key) {
	const cbs = listeners.get(key);
	if (cbs) cbs.forEach(cb => cb(state[key]));
}

export function setAccounts(list) {
	state.accounts.clear();
	for (const a of list) state.accounts.set(a.id, a);
	emit("accounts");
}

export function upsertAccount(account) {
	state.accounts.set(account.id, account);
	emit("accounts");
}

export function removeAccount(id) {
	state.accounts.delete(id);
	emit("accounts");
}

export function setTransactions(list, append = false) {
	if (append) {
		state.transactions.push(...list);
	} else {
		state.transactions = list;
		state.transactionsOffset = 0;
	}
	state.transactionsOffset = state.transactions.length;
	state.transactionsHasMore = list.length >= 50;
	emit("transactions");
}

export function upsertTransaction(tx) {
	const idx = state.transactions.findIndex(t => t.id === tx.id);
	if (idx >= 0) state.transactions[idx] = tx;
	else state.transactions.unshift(tx);
	emit("transactions");
}

export function removeTransaction(id) {
	state.transactions = state.transactions.filter(t => t.id !== id);
	emit("transactions");
}

export function setPayees(list) {
	state.payees.clear();
	for (const p of list) state.payees.set(p.id, p);
	emit("payees");
}

export function upsertPayee(payee) {
	state.payees.set(payee.id, payee);
	emit("payees");
}

export function removePayee(id) {
	state.payees.delete(id);
	emit("payees");
}

export function setSubscriptions(list) {
	state.subscriptions.clear();
	for (const s of list) state.subscriptions.set(s.id, s);
	emit("subscriptions");
}

export function upsertSubscription(sub) {
	state.subscriptions.set(sub.id, sub);
	emit("subscriptions");
}

export function removeSubscription(id) {
	state.subscriptions.delete(id);
	emit("subscriptions");
}

export function setBudget(budget, categories) {
	state.budget = budget;
	state.budgetCategories = categories || [];
	emit("budget");
}

export function setCategories(categories) {
	state.categories = typeof categories === "string"
		? categories.split(",").map(c => c.trim()).filter(Boolean)
		: (categories || []);
	emit("categories");
}

export function setReport(reportName, data) {
	state.reports[reportName] = data;
	emit("reports");
}
```

**Step 2: Commit**

```
git add src/js/finance/financeState.js
git commit -m "feat(finance): add state store with pub/sub"
```

---

### Task 6: Finance Utilities

**Files:**
- Create: `src/js/finance/financeUtils.js`

**Step 1: Create the utilities module**

Shared helpers for cents conversion, currency formatting, date formatting, and SVG chart primitives.

Key exports:
- `centsToDisplay(cents)` — returns string like "1,234.56"
- `displayToCents(str)` — parses display string back to integer cents
- `formatCurrency(cents, currency)` — returns "1,234.56 RON"
- `formatDate(rfc3339)` — returns "Mar 7, 2026"
- `formatDateShort(rfc3339)` — returns "Mar 7"
- `formatDateISO(date)` — returns "2026-03-07T00:00:00Z"
- `getMonthRange(year, month)` — returns { dateFrom, dateTo } RFC3339 strings
- `getCurrentMonthRange()` — convenience for current month
- `svgBar({ x, y, width, height, fill, rx })` — returns SVG `<rect>` string
- `svgLine({ points, stroke, strokeWidth })` — returns SVG `<polyline>` string
- `svgText({ x, y, text, fill, fontSize, anchor })` — returns SVG `<text>` string
- `buildBarChart({ data, width, height, labelKey, valueKey, colorFn })` — returns full SVG string
- `buildLineChart({ data, width, height, xKey, yKey, stroke })` — returns full SVG string
- `buildHorizontalBarChart({ data, width, height, labelKey, valueKey, colorFn })` — returns full SVG string
- `el(tag, attrs, ...children)` — DOM element factory helper

**Step 2: Commit**

```
git add src/js/finance/financeUtils.js
git commit -m "feat(finance): add utility functions and SVG chart helpers"
```

---

### Task 7: Finance Window Entry Point

**Files:**
- Create: `src/js/finance/financeWindow.js`

**Step 1: Create the entry point**

This is the main renderer module. It:
1. Listens for `fin-event` IPC messages and dispatches to state + active section
2. Renders the sidebar navigation
3. Handles section switching (calls `destroy()` on old section, `render()` on new)
4. Sends events to main process via `ipcRenderer.send("fin-send", { event, data })`
5. Handles the close button
6. On initial load, fetches accounts and categories

Section modules are imported statically. The `NAV_ITEMS` array defines order, label, icon (simple text/emoji or SVG inline), and section module reference.

Sections: dashboard, accounts, transactions, transfers, subscriptions, budgets, reports, payees, categories.

Key structure:
```js
const { ipcRenderer } = require("electron");

import * as state from "./financeState.js";
import * as dashboard from "./financeDashboard.js";
import * as accounts from "./financeAccounts.js";
// ... etc

const NAV_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: "grid", module: dashboard },
	{ id: "accounts", label: "Accounts", icon: "wallet", module: accounts },
	// ...
];

const sendEvent = (event, data) => ipcRenderer.send("fin-send", { event, data });

const ctx = { state, sendEvent, ...utils };

// Init all modules
NAV_ITEMS.forEach(item => item.module.init(ctx));

// IPC listener dispatches to state and active section
ipcRenderer.on("fin-event", (_, { event, data }) => {
	// Update state based on event
	handleStateEvent(event, data);
	// Forward to active section
	activeSection?.onEvent(event, data);
});
```

The `handleStateEvent` function maps each `fin_*` server event to the correct state mutation (e.g., `fin_accounts_list` → `state.setAccounts(data)`).

**Step 2: Commit**

```
git add src/js/finance/financeWindow.js
git commit -m "feat(finance): add window entry point with sidebar navigation"
```

---

### Task 8: Dashboard Section

**Files:**
- Create: `src/js/finance/financeDashboard.js`

**Step 1: Implement the dashboard**

Renders the overview layout:
- Top banner: net worth (if data available), total assets, total liabilities
- 2x2 grid:
  - Account cards (from state.accounts) showing name, type icon, balance
  - Upcoming subscriptions (fetches `fin_subscriptions_upcoming` with days_ahead: 14)
  - Recent transactions (fetches `fin_transactions_fetch` with limit: 5)
  - Income vs expense for current month (fetches `fin_report_income_vs_expense`)

On `render()`:
- Build the DOM structure
- Fetch all 4 data sources via `sendEvent`
- Register state listeners for `accounts`, `subscriptions`, `transactions`, `reports`

On `onEvent()`:
- Handle `fin_subscriptions_upcoming` → render upcoming list
- Handle `fin_transactions_list` → render recent (only if dashboard is requesting the short list)
- Handle `fin_report_income_vs_expense` → render bar comparison

Clicking cards navigates to the respective section via a callback.

**Step 2: Commit**

```
git add src/js/finance/financeDashboard.js
git commit -m "feat(finance): add dashboard section"
```

---

### Task 9: Accounts Section

**Files:**
- Create: `src/js/finance/financeAccounts.js`

**Step 1: Implement accounts**

Card grid layout showing all accounts. Each card shows:
- Color indicator (from account.color)
- Icon (account.icon)
- Account name
- Account type badge
- Computed balance (formatted with currency)
- Archived badge if `is_archived`

Actions:
- "Add Account" button opens inline form panel at top
- Click card → toggles edit form
- Archive/unarchive button
- Delete button (with confirmation)
- Drag-to-reorder (HTML5 drag events → `fin_account_reorder`)

Form fields: name, account_type (dropdown), currency, initial_balance, icon, color, notes.

On `render()`:
- If accounts empty, fetch via `fin_accounts_fetch`
- Render grid from state.accounts

On `onEvent()`:
- `fin_account_created` / `fin_account_updated` / `fin_account_archived` → state already updated by main dispatcher, re-render cards
- `fin_account_deleted` → remove from display
- `fin_accounts_reordered` → update positions and re-sort

**Step 2: Commit**

```
git add src/js/finance/financeAccounts.js
git commit -m "feat(finance): add accounts section with CRUD"
```

---

### Task 10: Transactions Section

**Files:**
- Create: `src/js/finance/financeTransactions.js`

**Step 1: Implement transactions**

Table-based layout with filter bar and infinite scroll.

Filter bar:
- Account dropdown (from state.accounts, "All" option)
- Date range: from/to date inputs
- Category dropdown (from state.categories, "All" option)
- Search text input
- Apply / Clear filters buttons

Table columns: Date, Description, Category, Payee, Amount (color-coded), Split indicator.

"Add Transaction" button opens form panel above table.

Form fields: account_id (dropdown), transaction_type (income/expense), amount, date, description, category (dropdown), payee (searchable dropdown using `fin_payee_search`), tags (comma input), notes.

Infinite scroll: attach scroll listener to content area. When near bottom and `transactionsHasMore`, fetch next page with current filters + offset.

Split support: if `is_split`, show expand icon. On click, fetch `fin_transaction_splits_fetch` and display split rows below.

On `render()`:
- Fetch initial transactions with default filters
- Render filter bar + table

On `onEvent()`:
- `fin_transactions_list` → render table rows (handle append for pagination)
- `fin_transaction_created` → prepend to table if matches current filters
- `fin_transaction_updated` → update in-place
- `fin_transaction_deleted` → remove row (+ peer if transfer)
- `fin_transaction_split_updated` → update split display
- `fin_transaction_splits_list` → render split detail rows
- `fin_payee_results` → populate payee search dropdown

**Step 2: Commit**

```
git add src/js/finance/financeTransactions.js
git commit -m "feat(finance): add transactions section with filters and infinite scroll"
```

---

### Task 11: Transfers Section

**Files:**
- Create: `src/js/finance/financeTransfers.js`

**Step 1: Implement transfers**

Simple form for creating transfers between accounts.

Layout:
- Source account dropdown (shows name + balance)
- Arrow indicator
- Target account dropdown (shows name + balance)
- Amount input
- Date input
- Description input
- Notes textarea
- Submit button

Validation: source != target, amount > 0, both accounts selected.

On submit: send `fin_transfer_create` with `from_account_id`, `to_account_id`, `amount` (converted to cents), `date`, `description`, `notes`.

On `onEvent()`:
- `fin_transfer_created` → show success message, clear form, refetch accounts for updated balances

Recent transfers list below the form (filter transactions where `transaction_type === "transfer"`).

**Step 2: Commit**

```
git add src/js/finance/financeTransfers.js
git commit -m "feat(finance): add transfers section"
```

---

### Task 12: Subscriptions Section

**Files:**
- Create: `src/js/finance/financeSubscriptions.js`

**Step 1: Implement subscriptions**

Card list grouped by status: active, paused, cancelled (collapsible groups).

Summary bar at top: fetch `fin_subscriptions_summary` → show total monthly/yearly costs.

Each subscription card shows:
- Icon (from sub.icon) with color (sub.color)
- Name
- Amount + frequency label (e.g., "49.99 RON/month")
- Next due date (with "due in X days" relative text)
- Status badge
- Action buttons: Confirm Payment (active only), Pause/Resume, Cancel, Edit, Delete

"Add Subscription" button opens inline form panel.

Form fields: name, amount, currency, frequency (dropdown), frequency_interval, next_due_date, category, account_id (optional dropdown), payee_id (optional searchable), notes, auto_create_transaction (checkbox), icon, color.

On `render()`:
- Fetch `fin_subscriptions_fetch` + `fin_subscriptions_summary`
- Render grouped card list

On `onEvent()`:
- `fin_subscriptions_list` → render all cards
- `fin_subscription_created` / `fin_subscription_updated` → upsert in state, re-render
- `fin_subscription_deleted` → remove card
- `fin_subscription_confirmed` → update subscription + optionally show "Transaction created" toast
- `fin_subscriptions_summary` → update summary bar

**Step 2: Commit**

```
git add src/js/finance/financeSubscriptions.js
git commit -m "feat(finance): add subscriptions section"
```

---

### Task 13: Budgets Section

**Files:**
- Create: `src/js/finance/financeBudgets.js`

**Step 1: Implement budgets**

Month picker at top: year/month navigation with prev/next arrows.

Budget categories table:
- Category name
- Budgeted amount (editable inline — click to edit, blur to save via `fin_budget_category_set`)
- Actual spent (from `actual_amount`)
- Remaining (budgeted - actual, or budgeted + rollover - actual)
- Progress bar (percentage, color-coded: green < 80%, yellow 80-100%, red > 100%)
- Rollover checkbox
- Delete button

"Add Category" row: dropdown of available categories + amount input.

Action buttons:
- "Copy from Previous Month" → `fin_budget_copy_previous`
- "Create Budget" (if no budget exists for selected month) → `fin_budget_set`

On `render()`:
- Fetch `fin_budget_fetch` for current year/month
- If budget is null, show "No budget for this month" with Create button

On `onEvent()`:
- `fin_budget_data` → render budget table
- `fin_budget_updated` → update budget header
- `fin_budget_category_updated` → upsert category row
- `fin_budget_category_deleted` → remove category row

**Step 2: Commit**

```
git add src/js/finance/financeBudgets.js
git commit -m "feat(finance): add budgets section"
```

---

### Task 14: Reports Section

**Files:**
- Create: `src/js/finance/financeReports.js`

**Step 1: Implement reports**

Tab sub-navigation for 5 report types. Shared date range picker (from/to).

**Tab 1: Spending by Category**
- SVG vertical bar chart (categories on x-axis, amounts on y-axis)
- Data table below: Category, Total Amount, Transaction Count
- Fetch: `fin_report_spending_by_category`

**Tab 2: Income vs Expense**
- SVG stacked/grouped bar chart (income vs expense)
- Summary: Total Income, Total Expense, Net (difference)
- Fetch: `fin_report_income_vs_expense`

**Tab 3: Net Worth**
- SVG line chart (net worth over time from snapshots)
- Current summary: Total Assets, Total Liabilities, Net Worth
- Account breakdown table from latest snapshot
- Fetch: `fin_report_net_worth`

**Tab 4: Spending Trends**
- SVG line chart (monthly totals over time)
- Data table: Year, Month, Total Amount
- Fetch: `fin_report_spending_trends`

**Tab 5: Top Payees**
- SVG horizontal bar chart
- Data table: Payee Name, Total Amount, Transaction Count
- Fetch: `fin_report_top_payees` with limit: 10

On `render()`:
- Render tab bar + date range picker
- Fetch active tab's report

On tab switch or date range change:
- Clear chart area
- Fetch new report data

On `onEvent()`:
- Each `fin_report_*` → render corresponding chart + table

**Step 2: Commit**

```
git add src/js/finance/financeReports.js
git commit -m "feat(finance): add reports section with SVG charts"
```

---

### Task 15: Payees Section

**Files:**
- Create: `src/js/finance/financePayees.js`

**Step 1: Implement payees**

Searchable list with inline create/edit.

Search input at top: types and sends `fin_payee_search` (debounced 300ms). Shows results from `fin_payee_results`.

Full list below (from `fin_payees_fetch`):
- Each row: Name, Notes (truncated), Edit button, Delete button
- Click Edit → inline form replaces the row (name input, notes textarea, save/cancel)
- Delete → confirmation inline ("Are you sure?" with confirm/cancel)

"Add Payee" button at top opens inline form.

On `render()`:
- Fetch `fin_payees_fetch`
- Render search bar + list

On `onEvent()`:
- `fin_payees_list` → render full list
- `fin_payee_results` → render search results
- `fin_payee_created` → add to list
- `fin_payee_updated` → update in list
- `fin_payee_deleted` → remove from list

**Step 2: Commit**

```
git add src/js/finance/financePayees.js
git commit -m "feat(finance): add payees section"
```

---

### Task 16: Categories Section

**Files:**
- Create: `src/js/finance/financeCategories.js`

**Step 1: Implement categories**

Simple list editor for user-defined finance categories.

Layout:
- List of category items, each with name and remove button
- "Add Category" input + button at bottom
- Categories are stored as comma-separated string

On load: fetch `fin_categories_fetch` if not already in state.

On add: append to list, send `fin_categories_update` with full comma-joined string.

On remove: filter out, send `fin_categories_update`.

On `onEvent()`:
- `fin_categories_data` → parse and render list
- `fin_categories_updated` → update state and re-render

**Step 2: Commit**

```
git add src/js/finance/financeCategories.js
git commit -m "feat(finance): add categories section"
```

---

### Task 17: Add Finance as Custom Command

**Files:**
- Modify: `src/js/finance/financeWindow.js` (or wherever custom commands are bootstrapped)

This task registers a custom command so the user can open finance from `Cmd+Shift+Z` commands window. The actual mechanism depends on how commands work:

**Step 1: Add IPC handler for opening finance**

In `src/main/ipc/registerHandlers.js`, add:
```js
ipc.on("open-finance-window", () => {
	const win = windowManager.openFinanceWindow?.({
		screenIndex: appState.currentlySelectedScreenIndex ?? 0,
	});
});
```

This allows the renderer or other windows to open finance via IPC.

**Step 2: Commit**

```
git add src/main/ipc/registerHandlers.js
git commit -m "feat(finance): add IPC handler for opening finance window"
```

---

### Task 18: Reconnect Handling

**Files:**
- Modify: `src/js/finance/financeWindow.js`
- Modify: `src/main/socket/handlers.js`

**Step 1: Handle reconnect in socket handlers**

In the `connected` handler in `src/main/socket/handlers.js` (`setUpTasks` function), add a call to notify the finance window of reconnection so it can re-fetch visible data:

```js
financeController?.forwardToFinanceWindow?.("fin_reconnected", {});
```

**Step 2: Handle reconnect in renderer**

In `financeWindow.js`, when receiving `fin_reconnected`:
- Re-fetch accounts (`fin_accounts_fetch`)
- Re-fetch categories (`fin_categories_fetch`)
- Call active section's `render()` to re-fetch its data

**Step 3: Commit**

```
git add src/js/finance/financeWindow.js src/main/socket/handlers.js
git commit -m "feat(finance): handle WebSocket reconnect with data re-fetch"
```

---

### Task 19: Polish and Integration Test

**Files:**
- All finance files

**Step 1: Manual testing**

Run `npm start` and verify:
1. Finance opens from context menu
2. Sidebar navigation works (all 9 sections render)
3. Account CRUD works (create, edit, archive, delete, reorder)
4. Transaction list loads with filters and infinite scroll
5. Transfer form creates linked transactions
6. Subscriptions display, CRUD, confirm payment
7. Budget month navigation, category add/edit/delete, progress bars
8. All 5 report types render charts and tables
9. Payee search and CRUD
10. Category list editor
11. Dashboard shows all 4 data panels
12. Close button works
13. WebSocket reconnect re-fetches data

**Step 2: Fix any issues found**

**Step 3: Final commit**

```
git add -A
git commit -m "feat(finance): polish and fixes from integration testing"
```
