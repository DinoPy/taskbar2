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
