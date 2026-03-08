import { el, formatDate, MEAL_TYPES, mealTypeLabel } from "./recipesUtils.js";
import { getState, on } from "./recipesState.js";

let ctx = null;
let container = null;
let unsubs = [];

const PAGE_SIZE = 50;

// =========================================
// Init / Destroy
// =========================================

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
}

// =========================================
// Render entry point
// =========================================

export function render(ct) {
	container = ct;

	// Subscribe to state changes
	unsubs.push(on("meals", () => renderList()));
	unsubs.push(on("recipes", () => renderList()));

	// Request initial data
	fetchMeals(false);

	// Build shell
	container.innerHTML = "";
	container.appendChild(buildHeader());
	container.appendChild(el("div", { class: "rcp-meal-log-list" }));
	container.appendChild(buildLoadMore());

	renderList();
}

// =========================================
// Event handler (called from recipesWindow)
// =========================================

export function onEvent(event, _data) {
	if (event === "meal_logged" || event === "meal_deleted" || event === "meal_list_data") {
		renderList();
	}
}

// =========================================
// Data fetching
// =========================================

function fetchMeals(append) {
	const s = getState();
	const payload = { limit: PAGE_SIZE, offset: append ? s.mealsOffset : 0 };
	if (s.activeGroupId) payload.group_id = s.activeGroupId;
	ctx.sendEvent("meal_list", payload);
}

// =========================================
// Header
// =========================================

function buildHeader() {
	const addBtn = el("button", { class: "rcp-btn rcp-btn-primary", onClick: openLogDialog }, "+ Log Meal");
	return el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Meal Log"),
		el("div", { class: "rcp-section-actions" }, addBtn),
	);
}

// =========================================
// Meal list rendering
// =========================================

function renderList() {
	if (!container) return;
	const listEl = container.querySelector(".rcp-meal-log-list");
	if (!listEl) return;

	const s = getState();
	listEl.innerHTML = "";

	if (s.meals.length === 0) {
		listEl.appendChild(
			el("div", { class: "rcp-empty-state" },
				el("div", { class: "rcp-empty-state-icon" }, "\uD83C\uDF7D\uFE0F"),
				"No meals logged yet. Tap \"+ Log Meal\" to add one.",
			),
		);
		updateLoadMore();
		return;
	}

	for (const meal of s.meals) {
		listEl.appendChild(buildMealCard(meal));
	}

	updateLoadMore();
}

function buildMealCard(meal) {
	const recipe = meal.recipe_id ? getState().recipes.get(meal.recipe_id) : null;

	const badges = [];
	if (meal.meal_type) {
		badges.push(el("span", { class: "rcp-tag rcp-tag-accent" }, mealTypeLabel(meal.meal_type)));
	}
	if (recipe) {
		badges.push(el("span", { class: "rcp-tag" }, recipe.title));
	}

	const dateStr = formatDate(meal.eaten_at || meal.created_at);

	const deleteBtn = el("button", {
		class: "rcp-btn rcp-btn-icon",
		title: "Delete meal",
		onClick: (e) => {
			e.stopPropagation();
			ctx.sendEvent("meal_delete", { id: meal.id });
		},
	}, "\u2715");

	return el("div", { class: "rcp-card", style: { marginBottom: "8px" } },
		el("div", { class: "rcp-card-header" },
			el("h4", { class: "rcp-card-title" }, meal.name),
			deleteBtn,
		),
		el("div", { class: "rcp-card-body rcp-flex-row rcp-gap-sm", style: { flexWrap: "wrap" } },
			...badges,
		),
		el("div", { class: "rcp-card-footer" },
			el("span", { class: "rcp-text-muted rcp-text-sm" }, dateStr),
		),
	);
}

// =========================================
// Load more
// =========================================

function buildLoadMore() {
	const btn = el("button", {
		class: "rcp-btn rcp-btn-secondary rcp-meal-log-loadmore",
		style: { width: "100%", marginTop: "8px" },
		onClick: () => fetchMeals(true),
	}, "Load More");
	const wrapper = el("div", { class: "rcp-meal-log-loadmore-wrap" }, btn);
	return wrapper;
}

function updateLoadMore() {
	if (!container) return;
	const wrap = container.querySelector(".rcp-meal-log-loadmore-wrap");
	if (!wrap) return;
	const s = getState();
	wrap.style.display = s.mealsHasMore && s.meals.length > 0 ? "" : "none";
}

// =========================================
// Log Meal Dialog
// =========================================

function openLogDialog() {
	const overlay = el("div", { class: "rcp-dialog-overlay" });

	const nameInput = el("input", { class: "rcp-input", placeholder: "What did you eat?", type: "text" });

	// Meal type select
	const typeSelect = el("select", { class: "rcp-select" });
	typeSelect.appendChild(el("option", { value: "" }, "No type"));
	for (const t of MEAL_TYPES) {
		typeSelect.appendChild(el("option", { value: t }, mealTypeLabel(t)));
	}

	// Recipe link select
	const recipeSelect = el("select", { class: "rcp-select" });
	recipeSelect.appendChild(el("option", { value: "" }, "None"));
	const s = getState();
	for (const [id, recipe] of s.recipes) {
		recipeSelect.appendChild(el("option", { value: id }, recipe.title));
	}

	const cancelBtn = el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel");
	const saveBtn = el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
		const name = nameInput.value.trim();
		if (!name) {
			nameInput.focus();
			return;
		}
		const payload = { name };
		if (typeSelect.value) payload.meal_type = typeSelect.value;
		if (recipeSelect.value) payload.recipe_id = recipeSelect.value;
		if (s.activeGroupId) payload.group_id = s.activeGroupId;
		ctx.sendEvent("meal_log", payload);
		overlay.remove();
	} }, "Log Meal");

	const dialog = el("div", { class: "rcp-dialog" },
		el("div", { class: "rcp-dialog-header" },
			el("h3", null, "Log a Meal"),
			el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u2715"),
		),
		el("div", { class: "rcp-dialog-body" },
			el("div", { class: "rcp-form-row" },
				el("label", null, "Meal name *"),
				nameInput,
			),
			el("div", { class: "rcp-form-row" },
				el("label", null, "Meal type"),
				typeSelect,
			),
			el("div", { class: "rcp-form-row" },
				el("label", null, "Link to recipe"),
				recipeSelect,
			),
		),
		el("div", { class: "rcp-dialog-footer" }, cancelBtn, saveBtn),
	);

	overlay.appendChild(dialog);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) overlay.remove();
	});
	document.body.appendChild(overlay);

	// Focus name input after mount
	requestAnimationFrame(() => nameInput.focus());
}
