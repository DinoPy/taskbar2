let ctx = null;
let container = null;
let unsubscribe = null;

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;

	// Listen for state changes
	unsubscribe = ctx.state.on("savedRecipes", () => renderContent());

	// Fetch saved list
	ctx.sendEvent("recipe_saved_list", {});

	renderContent();
}

function renderContent() {
	if (!container) return;

	const { el, formatDate } = ctx.utils;
	const s = ctx.state.getState();
	const saved = Array.from(s.savedRecipes.values());

	container.innerHTML = "";

	// Header
	const header = el("div", { class: "rcp-section-header" },
		el("h2", null, "Saved Recipes"),
	);
	container.appendChild(header);

	// Empty state
	if (saved.length === 0) {
		container.appendChild(
			el("div", { class: "rcp-empty-state" },
				el("div", { class: "rcp-empty-state-icon" }, "\uD83D\uDD16"),
				el("div", null, "No saved recipes yet. Save recipes from groups to see them here."),
			),
		);
		return;
	}

	// Card grid
	const grid = el("div", { class: "rcp-card-grid" });

	for (const recipe of saved) {
		const card = el("div", { class: "rcp-card rcp-card-clickable" },
			el("div", { class: "rcp-card-header" },
				el("div", { class: "rcp-card-title" }, recipe.title || "Untitled"),
			),
			el("div", { class: "rcp-card-body" },
				el("span", { style: { fontSize: "12px", opacity: "0.7" } },
					recipe.created_at ? formatDate(recipe.created_at) : "",
				),
			),
			el("div", { class: "rcp-card-footer" },
				el("button", {
					class: "rcp-btn rcp-btn-sm rcp-btn-secondary",
					onClick: (e) => {
						e.stopPropagation();
						ctx.sendEvent("recipe_unsave", { recipe_id: recipe.id });
					},
				}, "Unsave"),
			),
		);

		card.addEventListener("click", () => {
			// Switch to recipes section to view the personal copy
			ctx.switchSection("recipes");
		});

		grid.appendChild(card);
	}

	container.appendChild(grid);
}

export function onEvent(event, data) {
	switch (event) {
		case "recipe_saved_list_data":
			// State is already updated by recipesWindow; re-render handled by listener
			break;
		case "recipe_saved":
			if (data.copied) {
				ctx.showToast("Recipe saved!", "info");
				ctx.sendEvent("recipe_saved_list", {});
			} else if (data.already_saved) {
				ctx.showToast("Already saved", "info");
			}
			break;
		case "recipe_unsaved":
			// State is already updated by recipesWindow; re-render handled by listener
			break;
	}
}

export function destroy() {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	container = null;
}
