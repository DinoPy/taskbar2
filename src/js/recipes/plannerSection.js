let ctx = null;
let container = null;
let unsubs = [];
let fillSlotOverlay = null;
let createPlanOverlay = null;

// =========================================
// Helpers
// =========================================

function send(event, data) { ctx.sendEvent(event, data); }
function s() { return ctx.state.getState(); }
function el(...args) { return ctx.utils.el(...args); }

/** Extract YYYY-MM-DD from an ISO/RFC-3339 date string. */
function toDateKey(dateStr) {
	if (!dateStr) return "";
	return dateStr.slice(0, 10);
}

/** Extract meal_type string from the nullable wrapper {String, Valid}. */
function mealTypeStr(mt) {
	if (!mt) return "";
	if (typeof mt === "string") return mt;
	return mt.Valid ? mt.String : "";
}

/** Build a lookup: "YYYY-MM-DD|meal_type" -> entry */
function buildEntryLookup() {
	const map = new Map();
	for (const entry of s().planEntries.values()) {
		const key = toDateKey(entry.date) + "|" + mealTypeStr(entry.meal_type);
		map.set(key, entry);
	}
	return map;
}

/** Iterate days from start_date to end_date (exclusive). */
function planDays(plan) {
	const days = [];
	const start = toDateKey(plan.start_date);
	const end = toDateKey(plan.end_date);
	let current = start;
	const safety = 60;
	let i = 0;
	while (current <= end && i < safety) {
		days.push(current);
		current = ctx.utils.addDays(current, 1);
		i++;
	}
	return days;
}

// =========================================
// Lifecycle
// =========================================

export function init(sharedCtx) { ctx = sharedCtx; }

export function render(ct) {
	container = ct;
	unsubs.push(ctx.state.on("plan", () => renderContent()));
	unsubs.push(ctx.state.on("suggestions", () => renderSuggestionsPanel()));

	// If no plan in state, try to load the last known plan from localStorage
	if (!s().currentPlan) {
		const lastPlanId = localStorage.getItem("recipes_last_plan_id");
		if (lastPlanId) {
			send("meal_plan_get", { id: lastPlanId });
		}
	}

	renderContent();
}

export function onEvent(event, _data) {
	switch (event) {
		case "meal_plan_created":
		case "meal_plan_data": {
			const plan = s().currentPlan;
			if (plan && plan.id) {
				localStorage.setItem("recipes_last_plan_id", plan.id);
			}
			renderContent();
			break;
		}
		case "meal_plan_entry_updated":
		case "meal_plan_entry_removed":
			renderContent();
			break;
		case "meal_suggestions_data":
			renderSuggestionsPanel();
			break;
	}
}

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	closeFillSlotDialog();
	closeCreatePlanDialog();
	container = null;
}

// =========================================
// Main render
// =========================================

function renderContent() {
	if (!container) return;
	container.innerHTML = "";

	// Header
	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Meal Planner"),
		el("div", { class: "rcp-section-actions" },
			el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => openCreatePlanDialog() }, "+ New Plan"),
		),
	);
	container.appendChild(header);

	const plan = s().currentPlan;
	if (!plan) {
		container.appendChild(
			el("div", { class: "rcp-empty-state" },
				el("div", { class: "rcp-empty-state-icon" }, "\uD83D\uDCC5"),
				el("div", null, "No meal plan yet. Create one to get started!"),
			),
		);
		return;
	}

	// Plan info
	const startLabel = ctx.utils.dayLabel(toDateKey(plan.start_date));
	const endLabel = ctx.utils.dayLabel(toDateKey(plan.end_date));
	container.appendChild(
		el("div", { class: "rcp-plan-info", style: { marginBottom: "12px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" } },
			startLabel + " \u2013 " + endLabel,
		),
	);

	// Grid
	container.appendChild(renderGrid(plan));

	// Suggestions panel
	const suggestionsContainer = el("div", { class: "rcp-plan-suggestions" });
	container.appendChild(suggestionsContainer);
	renderSuggestionsPanel(suggestionsContainer);
}

// =========================================
// Plan grid
// =========================================

function renderGrid(plan) {
	const days = planDays(plan);
	const lookup = buildEntryLookup();
	const mealTypes = ctx.utils.MEAL_TYPES;

	const grid = el("div", { class: "rcp-plan-grid" });

	// Style the grid for columns: day-label + one per meal type
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "120px " + mealTypes.map(() => "1fr").join(" ");
	grid.style.gap = "1px";

	// Header row: empty corner + meal type headers
	grid.appendChild(el("div", { class: "rcp-plan-header rcp-plan-corner" }));
	for (const mt of mealTypes) {
		grid.appendChild(
			el("div", { class: "rcp-plan-header" }, ctx.utils.mealTypeLabel(mt)),
		);
	}

	// Day rows
	for (const day of days) {
		// Day label
		grid.appendChild(
			el("div", { class: "rcp-plan-day-label" }, ctx.utils.dayLabel(day)),
		);

		// Cells for each meal type
		for (const mt of mealTypes) {
			const key = day + "|" + mt;
			const entry = lookup.get(key);
			grid.appendChild(renderCell(plan, day, mt, entry));
		}
	}

	return grid;
}

function renderCell(plan, day, mealType, entry) {
	if (entry) {
		// Filled cell
		const cell = el("div", {
			class: "rcp-plan-cell rcp-plan-cell--filled",
			title: "Click to remove",
			onClick: () => {
				if (confirm("Remove \"" + entry.name + "\" from this slot?")) {
					send("meal_plan_entry_remove", {
						plan_id: plan.id,
						entry_id: entry.id,
					});
				}
			},
		}, entry.name);
		return cell;
	}

	// Empty cell
	const cell = el("div", {
		class: "rcp-plan-cell rcp-plan-cell--empty",
		onClick: () => openFillSlotDialog(plan, day, mealType),
	}, "+");
	return cell;
}

// =========================================
// Fill Slot Dialog
// =========================================

let fillSlotSuggestions = [];

function openFillSlotDialog(plan, day, mealType) {
	closeFillSlotDialog();
	fillSlotSuggestions = [];

	const nameInput = el("input", { class: "rcp-input", type: "text", placeholder: "Meal name..." });

	// Recipe select
	const recipeSelect = el("select", { class: "rcp-select" });
	recipeSelect.appendChild(el("option", { value: "" }, "No linked recipe"));
	for (const recipe of s().recipes.values()) {
		recipeSelect.appendChild(el("option", { value: recipe.id }, recipe.title));
	}

	// Suggest button
	const suggestBtn = el("button", { class: "rcp-btn rcp-btn-secondary rcp-btn-sm", onClick: () => {
		const groupId = s().activeGroupId;
		const payload = { count: 5 };
		if (groupId) payload.group_id = groupId;
		send("meal_plan_suggest_slot", payload);
	} }, "Suggest");

	// Suggestion chips container
	const chipsContainer = el("div", { class: "rcp-suggestion-chips", style: { marginTop: "8px" } });

	// We listen for suggestions via state
	const unsubSuggestions = ctx.state.on("suggestions", () => {
		fillSlotSuggestions = s().suggestions;
		renderFillSlotChips(chipsContainer, nameInput, recipeSelect);
	});

	const saveBtn = el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
		const name = nameInput.value.trim();
		if (!name) {
			ctx.showToast("Please enter a meal name", "error");
			return;
		}
		const payload = {
			plan_id: plan.id,
			date: day,
			meal_type: mealType,
			name,
			last_modified_at: Date.now(),
		};
		const recipeId = recipeSelect.value;
		if (recipeId) payload.recipe_id = recipeId;
		send("meal_plan_entry_set", payload);
		closeFillSlotDialog();
	} });
	saveBtn.textContent = "Save";

	const cancelBtn = el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => closeFillSlotDialog() }, "Cancel");

	const overlay = el("div", { class: "rcp-dialog-overlay", onClick: (e) => { if (e.target === overlay) closeFillSlotDialog(); } },
		el("div", { class: "rcp-dialog" },
			el("div", { class: "rcp-dialog-header" },
				el("h3", null, "Fill Slot: " + ctx.utils.mealTypeLabel(mealType) + " - " + ctx.utils.dayLabel(day)),
			),
			el("div", { class: "rcp-dialog-body" },
				el("div", { class: "rcp-form-row" },
					el("label", null, "Meal Name"),
					nameInput,
				),
				el("div", { class: "rcp-form-row" },
					el("label", null, "Link Recipe (optional)"),
					recipeSelect,
				),
				el("div", { class: "rcp-form-row" },
					el("label", null, "Get Suggestions"),
					suggestBtn,
					chipsContainer,
				),
			),
			el("div", { class: "rcp-dialog-footer" },
				cancelBtn,
				saveBtn,
			),
		),
	);

	fillSlotOverlay = { overlay, unsubSuggestions };
	document.body.appendChild(overlay);
	nameInput.focus();
}

function renderFillSlotChips(chipsContainer, nameInput, recipeSelect) {
	chipsContainer.innerHTML = "";
	for (const suggestion of fillSlotSuggestions) {
		const chip = el("button", {
			class: "rcp-chip",
			onClick: () => {
				nameInput.value = suggestion.name;
				if (suggestion.recipe_id) {
					recipeSelect.value = suggestion.recipe_id;
				}
			},
		}, suggestion.name);
		chipsContainer.appendChild(chip);
	}
}

function closeFillSlotDialog() {
	if (fillSlotOverlay) {
		fillSlotOverlay.unsubSuggestions();
		fillSlotOverlay.overlay.remove();
		fillSlotOverlay = null;
	}
}

// =========================================
// Create Plan Dialog
// =========================================

function openCreatePlanDialog() {
	closeCreatePlanDialog();

	const today = ctx.utils.formatDateISO(new Date());
	const dateInput = el("input", { class: "rcp-input", type: "date", value: today });
	const daysInput = el("input", { class: "rcp-input", type: "number", min: "1", max: "30", value: "7" });

	const createBtn = el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => {
		const startDate = dateInput.value;
		const numDays = parseInt(daysInput.value, 10);
		if (!startDate) {
			ctx.showToast("Please select a start date", "error");
			return;
		}
		if (isNaN(numDays) || numDays < 1 || numDays > 30) {
			ctx.showToast("Days must be between 1 and 30", "error");
			return;
		}
		const payload = { start_date: startDate, num_days: numDays, last_modified_at: Date.now() };
		const groupId = s().activeGroupId;
		if (groupId) payload.group_id = groupId;
		send("meal_plan_create", payload);
		closeCreatePlanDialog();
	} }, "Create Plan");

	const cancelBtn = el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => closeCreatePlanDialog() }, "Cancel");

	const overlay = el("div", { class: "rcp-dialog-overlay", onClick: (e) => { if (e.target === overlay) closeCreatePlanDialog(); } },
		el("div", { class: "rcp-dialog" },
			el("div", { class: "rcp-dialog-header" },
				el("h3", null, "Create Meal Plan"),
			),
			el("div", { class: "rcp-dialog-body" },
				el("div", { class: "rcp-form-row" },
					el("label", null, "Start Date"),
					dateInput,
				),
				el("div", { class: "rcp-form-row" },
					el("label", null, "Number of Days"),
					daysInput,
				),
			),
			el("div", { class: "rcp-dialog-footer" },
				cancelBtn,
				createBtn,
			),
		),
	);

	createPlanOverlay = overlay;
	document.body.appendChild(overlay);
	dateInput.focus();
}

function closeCreatePlanDialog() {
	if (createPlanOverlay) {
		createPlanOverlay.remove();
		createPlanOverlay = null;
	}
}

// =========================================
// Suggestions Panel
// =========================================

function renderSuggestionsPanel(targetContainer) {
	const panel = targetContainer || (container && container.querySelector(".rcp-plan-suggestions"));
	if (!panel) return;

	const plan = s().currentPlan;
	if (!plan) {
		panel.innerHTML = "";
		return;
	}

	panel.innerHTML = "";
	panel.style.marginTop = "20px";

	const tagInput = el("input", { class: "rcp-input", type: "text", placeholder: "Filter by tag..." });
	const getBtn = el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => {
		const payload = { count: 5 };
		const tag = tagInput.value.trim();
		if (tag) payload.tag = tag;
		const groupId = s().activeGroupId;
		if (groupId) payload.group_id = groupId;
		send("meal_suggestions_get", payload);
	} }, "Get Suggestions");

	const header = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" } },
		el("strong", { style: { color: "var(--color-text-primary)", fontSize: "var(--font-size-sm)" } }, "Suggestions"),
		tagInput,
		getBtn,
	);
	panel.appendChild(header);

	// Render current suggestions as chips
	const chips = el("div", { class: "rcp-suggestion-chips" });
	const suggestions = s().suggestions || [];
	if (suggestions.length === 0) {
		chips.appendChild(el("span", { style: { color: "var(--color-text-tertiary)", fontSize: "var(--font-size-xs)" } },
			"Click \"Get Suggestions\" to see meal ideas."));
	} else {
		for (const suggestion of suggestions) {
			chips.appendChild(el("button", {
				class: "rcp-chip",
				title: suggestion.recipe_id ? "Linked to recipe" : "From meal history",
			}, suggestion.name));
		}
	}
	panel.appendChild(chips);
}
