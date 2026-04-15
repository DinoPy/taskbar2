import { beginFinanceWrite, sendEvent, showToast, switchSection, state, utils } from "./financeWindow.js";
import { resolveSingleReference } from "./financeReferenceState.js";

const { el, formatCurrency, formatDateShort, formatDateISO, displayToCents, centsToDisplay, getCurrentMonthRange } = utils;

let unsubs = [];
let container = null;
let formVisible = false;
let editingTx = null;
let scrollEl = null;
let scrollHandler = null;
let searchTimer = null;
let _initialFetchDone = false;
let _expandedSplits = new Set();
let _splitsData = {};
let _pendingSplitsTxId = null;
let formDraft = null;

// Payee search state
let _payeeResults = [];
let _payeeDropdown = null;

// Filter state
const filters = {
	account_id: "",
	date_from: "",
	date_to: "",
	category: "",
	search: "",
};

// =========================================
// Init
// =========================================

export function init() {}

// =========================================
// Render
// =========================================

export function render(ct) {
	container = ct;

	unsubs.push(state.on("accounts", () => renderContent()));
	unsubs.push(state.on("transactions", () => renderContent()));
	unsubs.push(state.on("categories", () => renderContent()));

	_initialFetchDone = false;
	fetchTransactions(false);
	renderContent();
}

// =========================================
// onEvent
// =========================================

export function onEvent(event, data) {
	if (event === "fin_payee_results") {
		_payeeResults = Array.isArray(data) ? data : [];
		renderPayeeDropdown();
	}
	if (event === "fin_transaction_splits_list") {
		// Server sends a direct array; use the tracked transaction_id
		if (_pendingSplitsTxId) {
			_splitsData[_pendingSplitsTxId] = Array.isArray(data) ? data : [];
			_pendingSplitsTxId = null;
			renderContent();
		}
	}
}

// =========================================
// Destroy
// =========================================

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	if (scrollEl && scrollHandler) {
		scrollEl.removeEventListener("scroll", scrollHandler);
	}
	scrollEl = null;
	scrollHandler = null;
	container = null;
	formVisible = false;
	editingTx = null;
	_initialFetchDone = false;
	_expandedSplits.clear();
	_splitsData = {};
	_pendingSplitsTxId = null;
	_payeeResults = [];
	_payeeDropdown = null;
	formDraft = null;
	if (searchTimer) clearTimeout(searchTimer);
}

function createTransactionDraft(tx) {
	const dateValue = tx?.date
		? new Date(tx.date).toISOString().slice(0, 16)
		: new Date().toISOString().slice(0, 16);

	return {
		account_id: tx?.account_id || "",
		transaction_type: tx?.transaction_type || "income",
		amount: tx ? centsToDisplay(Math.abs(Number(tx.amount || 0))) : "",
		date: dateValue,
		description: tx?.description || "",
		category: tx?.category || "",
		payee_id: tx?.payee_id || "",
		payee_label: tx?.payee_name || "",
		tags: tx?.tags
			? (Array.isArray(tx.tags) ? tx.tags.join(", ") : tx.tags)
			: "",
		notes: tx?.notes || "",
		is_split: !!tx?.is_split,
	};
}

function ensureFormDraft(tx) {
	if (!formDraft) {
		formDraft = createTransactionDraft(tx);
	}
	return formDraft;
}

function openForm(tx = null) {
	editingTx = tx;
	formDraft = createTransactionDraft(tx);
	formVisible = true;
	_payeeResults = [];
	removePayeeDropdown();
	renderContent();
}

function closeForm() {
	formVisible = false;
	editingTx = null;
	formDraft = null;
	_payeeResults = [];
	removePayeeDropdown();
	renderContent();
}

// =========================================
// Fetch transactions
// =========================================

function fetchTransactions(append) {
	const s = state.getState();
	const offset = append ? s.transactionsOffset : 0;

	if (!append) {
		s.transactionsOffset = 0;
	}

	// Signal state store to append the next result
	s.transactionsAppendNext = append;

	const payload = { limit: 50, offset };
	if (filters.account_id) payload.account_id = filters.account_id;
	if (filters.date_from) payload.date_from = filters.date_from + "T00:00:00Z";
	if (filters.date_to) payload.date_to = filters.date_to + "T23:59:59Z";
	if (filters.category) payload.category = filters.category;
	if (filters.search) payload.search_text = filters.search;

	sendEvent("fin_transactions_fetch", payload);
	_initialFetchDone = true;
}

// =========================================
// Render content
// =========================================

function renderContent() {
	if (!container) return;

	// Preserve scroll position across re-renders
	const scrollParent = container.closest(".fin-content");
	const savedScroll = scrollParent ? scrollParent.scrollTop : 0;

	container.innerHTML = "";

	const s = state.getState();

	// Header
	const header = el("div", { class: "fin-section-header" },
		el("h2", {}, "Transactions"),
		el("div", { class: "fin-section-actions" },
			el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
				if (formVisible && !editingTx) closeForm();
				else openForm(null);
			} }, formVisible && !editingTx ? "Cancel" : "+ Add Transaction"),
		),
	);
	container.appendChild(header);

	// Filter bar
	container.appendChild(buildFilterBar(s));

	// Form
	if (formVisible) {
		container.appendChild(buildForm(s, editingTx));
	}

	// Table
	container.appendChild(buildTable(s));

	// Restore scroll position
	if (scrollParent) {
		scrollParent.scrollTop = savedScroll;
	}

	// Setup scroll listener on fin-content
	setupScrollListener();
}

// =========================================
// Filter bar
// =========================================

function buildFilterBar(s) {
	const bar = el("div", { class: "fin-filter-bar" });

	// Account select
	const accSelect = el("select", { class: "fin-select" });
	accSelect.appendChild(el("option", { value: "" }, "All accounts"));
	for (const a of s.accounts.values()) {
		const opt = el("option", { value: a.id }, a.name);
		if (filters.account_id === a.id) opt.selected = true;
		accSelect.appendChild(opt);
	}
	accSelect.addEventListener("change", () => { filters.account_id = accSelect.value; });
	bar.appendChild(accSelect);

	// Date from
	const dateFrom = el("input", { class: "fin-input", type: "date" });
	dateFrom.value = filters.date_from;
	dateFrom.addEventListener("change", () => { filters.date_from = dateFrom.value; });
	bar.appendChild(dateFrom);

	// Date to
	const dateTo = el("input", { class: "fin-input", type: "date" });
	dateTo.value = filters.date_to;
	dateTo.addEventListener("change", () => { filters.date_to = dateTo.value; });
	bar.appendChild(dateTo);

	// Category select
	const catSelect = el("select", { class: "fin-select" });
	catSelect.appendChild(el("option", { value: "" }, "All categories"));
	for (const c of s.categories) {
		const opt = el("option", { value: c }, c);
		if (filters.category === c) opt.selected = true;
		catSelect.appendChild(opt);
	}
	catSelect.addEventListener("change", () => { filters.category = catSelect.value; });
	bar.appendChild(catSelect);

	// Search
	const searchInput = el("input", { class: "fin-input", type: "text", placeholder: "Search..." });
	searchInput.value = filters.search;
	searchInput.addEventListener("input", () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			filters.search = searchInput.value.trim();
		}, 300);
	});
	bar.appendChild(searchInput);

	// Apply
	bar.appendChild(el("button", { class: "fin-btn fin-btn-primary fin-btn-sm", onClick: () => {
		fetchTransactions(false);
	} }, "Apply"));

	// Clear
	bar.appendChild(el("button", { class: "fin-btn fin-btn-secondary fin-btn-sm", onClick: () => {
		filters.account_id = "";
		filters.date_from = "";
		filters.date_to = "";
		filters.category = "";
		filters.search = "";
		fetchTransactions(false);
	} }, "Clear"));

	return bar;
}

// =========================================
// Table
// =========================================

function buildTable(s) {
	const wrapper = el("div", { style: { overflowX: "auto" } });
	const table = el("table", { class: "fin-table" });

	// Header
	const thead = el("thead", {},
		el("tr", {},
			el("th", {}, "Date"),
			el("th", {}, "Account"),
			el("th", {}, "Description"),
			el("th", {}, "Category"),
			el("th", {}, "Payee"),
			el("th", { class: "fin-col-right" }, "Amount"),
			el("th", { class: "fin-col-center" }, ""),
			el("th", {}, ""),
		),
	);
	table.appendChild(thead);

	const tbody = el("tbody", {});
	const txns = s.transactions;

	if (txns.length === 0) {
		const emptyRow = el("tr", {},
			el("td", { colSpan: "8", style: { textAlign: "center", padding: "var(--spacing-lg)", color: "var(--color-text-tertiary)" } }, "No transactions found"),
		);
		tbody.appendChild(emptyRow);
	} else {
		for (const tx of txns) {
			tbody.appendChild(buildTxRow(tx, s));

			// Expanded splits
			if (_expandedSplits.has(tx.id) && _splitsData[tx.id]) {
				for (const split of _splitsData[tx.id]) {
					tbody.appendChild(buildSplitRow(split));
				}
			}
		}
	}

	table.appendChild(tbody);
	wrapper.appendChild(table);
	return wrapper;
}

function buildTxRow(tx, s) {
	const amt = Number(tx.amount || 0);
	const isExpense = tx.transaction_type === "expense";
	const isTransfer = tx.transaction_type === "transfer";
	const isTransferIncoming = tx.transaction_type === "income" && tx.transfer_peer_id;
	const isAnyTransfer = isTransfer || isTransferIncoming;
	let amtClass = "fin-amount-positive";
	if (isExpense || isTransfer) amtClass = "fin-amount-negative";
	else if (isTransferIncoming) amtClass = "fin-text-accent";

	const prefix = (isExpense || isTransfer) ? "-" : "+";
	const account = s.accounts.get(tx.account_id);
	const peerAccount = isAnyTransfer && tx.transfer_account_id ? s.accounts.get(tx.transfer_account_id) : null;

	// Transfer description: "Transfer to/from [account]"
	let description = tx.description || "";
	if (isAnyTransfer && peerAccount) {
		description = (isTransfer ? "Transfer to " : "Transfer from ") + peerAccount.name;
	} else if (isAnyTransfer) {
		description = description || "Transfer";
	}

	// Category: show "Transfer" for transfer transactions
	const category = isAnyTransfer ? "Transfer" : (tx.category || "");

	const splitBtn = tx.is_split
		? el("span", { style: { cursor: "pointer", fontSize: "var(--font-size-xs)" }, title: "View splits", onClick: () => {
			if (_expandedSplits.has(tx.id)) {
				_expandedSplits.delete(tx.id);
			} else {
				_expandedSplits.add(tx.id);
				if (!_splitsData[tx.id]) {
					_pendingSplitsTxId = tx.id;
					sendEvent("fin_transaction_splits_fetch", { transaction_id: tx.id });
				}
			}
			renderContent();
		} }, _expandedSplits.has(tx.id) ? "\u25BC" : "\u25B6")
		: null;

	const row = el("tr", {},
		el("td", {}, tx.date ? formatDateShort(tx.date) : ""),
		el("td", { class: "fin-truncate", style: { maxWidth: "120px" } }, account?.name || ""),
		el("td", { class: "fin-truncate", style: { maxWidth: "200px" } }, description),
		el("td", {}, category),
		el("td", {}, tx.payee_name || ""),
		el("td", { class: "fin-col-right fin-text-mono " + amtClass }, prefix + centsToDisplay(Math.abs(amt))),
		el("td", { class: "fin-col-center" }, splitBtn),
		el("td", {},
			el("div", { class: "fin-flex-row fin-gap-sm" },
				el("button", { class: "fin-btn fin-btn-icon", title: "Edit", onClick: () => {
					openForm(tx);
				} }, "\u270E"),
				el("button", { class: "fin-btn fin-btn-icon", title: "Delete", onClick: (e) => {
					handleDelete(tx, e.currentTarget);
				} }, "\u2715"),
			),
		),
	);

	return row;
}

function buildSplitRow(split) {
	const amt = Number(split.amount || 0);
	return el("tr", { style: { background: "var(--color-bg-secondary)" } },
		el("td", {}),
		el("td", {}),
		el("td", { style: { paddingLeft: "var(--spacing-lg)" } }, split.notes || "Split"),
		el("td", {}, split.category || ""),
		el("td", {}),
		el("td", { class: "fin-col-right fin-text-mono fin-text-sm" }, centsToDisplay(Math.abs(amt))),
		el("td", {}),
		el("td", {}),
	);
}

// =========================================
// Delete handler
// =========================================

function handleDelete(tx, btnEl) {
	if (btnEl.dataset.confirming) {
		beginFinanceWrite("fin_transaction_delete", {
			entityKind: "transaction",
			entityId: tx.id,
			refreshKinds: ["accounts"],
			onSuccess: () => {
				showToast("Transaction deleted", "info");
				fetchTransactions(false);
			},
			onNotFound: () => {
				fetchTransactions(false);
			},
		});
		sendEvent("fin_transaction_delete", { id: tx.id });
		return;
	}
	btnEl.dataset.confirming = "true";
	btnEl.textContent = "?";
	btnEl.title = "Click again to confirm";
	setTimeout(() => {
		if (btnEl.isConnected) {
			delete btnEl.dataset.confirming;
			btnEl.textContent = "\u2715";
			btnEl.title = "Delete";
		}
	}, 3000);
}

// =========================================
// Infinite scroll
// =========================================

function setupScrollListener() {
	// Use the fin-content parent as the scroll container
	scrollEl = container.closest(".fin-content");
	if (!scrollEl) return;

	if (scrollHandler) {
		scrollEl.removeEventListener("scroll", scrollHandler);
	}

	scrollHandler = () => {
		const s = state.getState();
		if (!s.transactionsHasMore) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollEl;
		if (scrollHeight - scrollTop - clientHeight < 200) {
			// Load more
			scrollEl.removeEventListener("scroll", scrollHandler);
			fetchTransactions(true);
		}
	};

	scrollEl.addEventListener("scroll", scrollHandler);
}

// =========================================
// Form
// =========================================

function buildForm(s, editing) {
	const draft = ensureFormDraft(editing);
	const activeAccounts = [...s.accounts.values()]
		.filter(a => !a.is_archived)
		.sort((a, b) => (a.position || 0) - (b.position || 0));
	const activeAccountMap = new Map(activeAccounts.map(account => [account.id, account]));
	const accountRef = resolveSingleReference(draft.account_id, activeAccountMap);
	const payeeRef = resolveSingleReference(draft.payee_id, s.payees);
	const panel = el("div", { class: "fin-card", style: { marginBottom: "var(--spacing-md)" } });
	const title = el("h3", { style: { margin: "0 0 var(--spacing-md) 0", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" } },
		editing ? "Edit Transaction" : "New Transaction",
	);
	panel.appendChild(title);

	const form = el("div", { class: "fin-form" });

	// Account
	const accSelect = el("select", { class: "fin-select" });
	accSelect.appendChild(el("option", { value: "" }, "Select account..."));
	if (accountRef.isStale && draft.account_id) {
		accSelect.appendChild(el("option", { value: draft.account_id, selected: true }, "Unavailable account (stale)"));
	}
	for (const a of activeAccounts) {
		const opt = el("option", { value: a.id }, a.name);
		if (draft.account_id === a.id) opt.selected = true;
		accSelect.appendChild(opt);
	}
	accSelect.addEventListener("change", () => {
		draft.account_id = accSelect.value;
		if (container) renderContent();
	});
	form.appendChild(formRow("Account", accSelect));
	if (accountRef.isStale) {
		form.appendChild(formHint("The selected account is no longer available. Choose another account to continue.", "error"));
	}

	// Type
	const isEditingTransfer = editing && (editing.transaction_type === "transfer" || editing.transfer_peer_id);
	const typeSelect = el("select", { class: "fin-select" });
	const typeOptions = isEditingTransfer ? ["transfer", "income", "expense"] : ["income", "expense"];
	for (const t of typeOptions) {
		const opt = el("option", { value: t }, t.charAt(0).toUpperCase() + t.slice(1));
		if (draft.transaction_type === t) opt.selected = true;
		typeSelect.appendChild(opt);
	}
	if (isEditingTransfer) typeSelect.disabled = true;
	typeSelect.addEventListener("change", () => {
		draft.transaction_type = typeSelect.value;
	});
	form.appendChild(formRow("Type", typeSelect));

	// Amount
	const amtInput = el("input", { class: "fin-input", type: "text", placeholder: "0.00" });
	amtInput.value = draft.amount;
	amtInput.addEventListener("input", () => {
		draft.amount = amtInput.value;
	});
	form.appendChild(formRow("Amount", amtInput));

	// Date
	const dateInput = el("input", { class: "fin-input", type: "datetime-local" });
	dateInput.value = draft.date;
	dateInput.addEventListener("change", () => {
		draft.date = dateInput.value;
	});
	form.appendChild(formRow("Date", dateInput));

	// Description
	const descInput = el("input", { class: "fin-input", type: "text", placeholder: "Description" });
	descInput.value = draft.description;
	descInput.addEventListener("input", () => {
		draft.description = descInput.value;
	});
	form.appendChild(formRow("Description", descInput));

	// Category
	const catSelect = el("select", { class: "fin-select" });
	catSelect.appendChild(el("option", { value: "" }, "Uncategorized"));
	for (const c of s.categories) {
		const opt = el("option", { value: c }, c);
		if (draft.category === c) opt.selected = true;
		catSelect.appendChild(opt);
	}
	catSelect.addEventListener("change", () => {
		draft.category = catSelect.value;
	});
	form.appendChild(formRow("Category", catSelect));

	// Payee (with search)
	const payeeWrapper = el("div", { style: { position: "relative" } });
	const payeeInput = el("input", { class: "fin-input", type: "text", placeholder: "Search payee..." });
	payeeInput.value = draft.payee_label;

	payeeInput.addEventListener("input", () => {
		const q = payeeInput.value.trim();
		draft.payee_label = payeeInput.value;
		draft.payee_id = "";
		if (q.length >= 2) {
			sendEvent("fin_payee_search", { search_query: q });
		} else {
			_payeeResults = [];
			removePayeeDropdown();
		}
	});

	_payeeDropdown = null;
	payeeWrapper.appendChild(payeeInput);
	form.appendChild(formRow("Payee", payeeWrapper));

	// Store refs for payee dropdown rendering
	payeeWrapper._payeeInput = payeeInput;
	payeeWrapper._setPayee = (id, name) => {
		draft.payee_id = id;
		draft.payee_label = name;
		payeeInput.value = name;
		removePayeeDropdown();
		if (container) renderContent();
	};
	form._payeeWrapper = payeeWrapper;
	if (payeeRef.isStale) {
		form.appendChild(formHint("The selected payee is no longer available. Clear it or choose another payee.", "error"));
	}

	// Tags
	const tagsInput = el("input", { class: "fin-input", type: "text", placeholder: "tag1, tag2, ..." });
	tagsInput.value = draft.tags;
	tagsInput.addEventListener("input", () => {
		draft.tags = tagsInput.value;
	});
	form.appendChild(formRow("Tags", tagsInput));

	// Notes
	const notesInput = el("textarea", { class: "fin-textarea", placeholder: "Notes" });
	notesInput.value = draft.notes;
	notesInput.addEventListener("input", () => {
		draft.notes = notesInput.value;
	});
	form.appendChild(formRow("Notes", notesInput));

	// Buttons
	const btns = el("div", { class: "fin-flex-row fin-gap-sm" },
		el("button", { class: "fin-btn fin-btn-primary", onClick: () => {
			const accountId = draft.account_id;
			const currentAccountRef = resolveSingleReference(draft.account_id, activeAccountMap);
			const currentPayeeRef = resolveSingleReference(draft.payee_id, s.payees);
			if (!accountId) {
				showToast("Account is required", "error");
				return;
			}
			if (currentAccountRef.isStale) {
				showToast("Choose a valid account before saving.", "error");
				return;
			}
			if (currentPayeeRef.isStale) {
				showToast("Choose a valid payee or clear the stale payee selection.", "error");
				return;
			}
			const amount = displayToCents(draft.amount);
			if (amount <= 0) {
				showToast("Amount must be positive", "error");
				return;
			}

			const tagStr = draft.tags.trim();
			const tags = tagStr ? tagStr.split(",").map(t => t.trim()).filter(Boolean) : [];

			const payload = {
				account_id: accountId,
				transaction_type: draft.transaction_type,
				amount,
				date: draft.date ? new Date(draft.date).toISOString() : new Date().toISOString(),
				description: draft.description.trim(),
				category: draft.category,
				payee_id: draft.payee_id || null,
				tags,
				notes: draft.notes.trim(),
			};

			if (editing) {
				beginFinanceWrite("fin_transaction_edit", {
					entityKind: "transaction",
					entityId: editing.id,
					refreshKinds: ["accounts", "payees"],
					onSuccess: () => {
						showToast("Transaction updated", "info");
						closeForm();
						fetchTransactions(false);
					},
					onNotFound: () => {
						fetchTransactions(false);
						renderContent();
					},
				});
				payload.id = editing.id;
				payload.is_split = !!editing.is_split;
				payload.last_modified_at = editing.last_modified_at || Date.now();
				sendEvent("fin_transaction_edit", payload);
			} else {
				const createMatcher = (eventName, response) => (
					eventName === "fin_transaction_created" &&
					Number(response?.last_modified_at) === Number(payload.last_modified_at) &&
					response?.account_id === payload.account_id &&
					response?.transaction_type === payload.transaction_type &&
					Number(response?.amount) === Number(payload.amount) &&
					response?.date === payload.date &&
					(response?.description || "") === payload.description
				);
				beginFinanceWrite("fin_transaction_create", {
					entityKind: "transaction",
					refreshKinds: ["accounts", "payees"],
					matches: createMatcher,
					onSuccess: () => {
						showToast("Transaction created", "info");
						closeForm();
						fetchTransactions(false);
					},
					onNotFound: () => {
						renderContent();
					},
				});
				payload.last_modified_at = Date.now();
				sendEvent("fin_transaction_create", payload);
			}
		} }, editing ? "Save" : "Create"),
		el("button", { class: "fin-btn fin-btn-secondary", onClick: () => {
			closeForm();
		} }, "Cancel"),
	);
	form.appendChild(btns);

	panel.appendChild(form);
	return panel;
}

function formRow(label, input) {
	return el("div", { class: "fin-form-row" },
		el("label", {}, label),
		input,
	);
}

function formHint(message, tone = "muted") {
	const color = tone === "error" ? "var(--color-danger, #dc2626)" : "var(--color-text-secondary)";
	return el("div", {
		class: "fin-form-hint",
		style: {
			marginTop: "calc(var(--spacing-xs) * -1)",
			marginBottom: "var(--spacing-sm)",
			fontSize: "var(--font-size-xs)",
			color,
		},
	}, message);
}

// =========================================
// Payee dropdown
// =========================================

function renderPayeeDropdown() {
	removePayeeDropdown();
	if (_payeeResults.length === 0) return;

	// Find the payee wrapper in current DOM
	const wrapper = container?.querySelector("[style*='position: relative']");
	if (!wrapper || !wrapper._setPayee) return;

	const dropdown = el("div", { style: {
		position: "absolute",
		top: "100%",
		left: "0",
		right: "0",
		background: "var(--color-bg-elevated)",
		border: "var(--border-width) solid var(--color-border-primary)",
		borderRadius: "var(--border-radius-md)",
		boxShadow: "var(--shadow-md)",
		zIndex: "50",
		maxHeight: "150px",
		overflowY: "auto",
	} });

	for (const p of _payeeResults) {
		const item = el("div", { style: {
			padding: "6px var(--spacing-sm)",
			cursor: "pointer",
			fontSize: "var(--font-size-sm)",
		} }, p.name || p.id);
		item.addEventListener("mouseenter", () => { item.style.background = "var(--color-bg-hover)"; });
		item.addEventListener("mouseleave", () => { item.style.background = ""; });
		item.addEventListener("click", () => {
			wrapper._setPayee(p.id, p.name || p.id);
		});
		dropdown.appendChild(item);
	}

	wrapper.appendChild(dropdown);
	_payeeDropdown = dropdown;
}

function removePayeeDropdown() {
	if (_payeeDropdown && _payeeDropdown.isConnected) {
		_payeeDropdown.remove();
	}
	_payeeDropdown = null;
}
