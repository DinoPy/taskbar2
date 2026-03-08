const { ipcRenderer } = require("electron");

// =========================================
// Shared context & local state
// =========================================

let ctx = null;
let container = null;
let unsubs = [];

// View modes: "list" | "detail"
let viewMode = "list";
let activeRecipeId = null;
let detailData = null; // { recipe, ingredients, images, tags }

// =========================================
// Helpers
// =========================================

function el(...args) { return ctx.utils.el(...args); }
function send(event, data) { ctx.sendEvent(event, data); }
function toast(msg, type) { ctx.showToast(msg, type); }

function getCurrentUserId() {
	return ipcRenderer.sendSync("get-server-user-id");
}

function isOwner(recipe) {
	return recipe && recipe.user_id === getCurrentUserId();
}

function nullableStr(val) {
	if (!val) return "";
	if (typeof val === "object" && "Valid" in val) return val.Valid ? val.String : "";
	return String(val);
}

// =========================================
// List view
// =========================================

function renderList() {
	container.innerHTML = "";

	const groupId = ctx.state.getState().activeGroupId;
	send("recipe_list", { group_id: groupId || "" });

	// Header
	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "My Recipes"),
		el("div", { class: "rcp-section-actions" },
			el("button", {
				class: "rcp-btn rcp-btn-primary",
				onClick: () => openCreateDialog(),
			}, "+ New Recipe"),
		),
	);
	container.appendChild(header);

	// Grid container
	const grid = el("div", { class: "rcp-card-grid", id: "rcp-recipes-grid" });
	container.appendChild(grid);

	populateGrid();

	const unsub = ctx.state.on("recipes", () => populateGrid());
	unsubs.push(unsub);
}

function populateGrid() {
	const grid = container?.querySelector("#rcp-recipes-grid");
	if (!grid) return;
	grid.innerHTML = "";

	const recipes = ctx.state.getState().recipes;
	if (recipes.size === 0) {
		grid.appendChild(el("div", { class: "rcp-empty-state" },
			el("div", { class: "rcp-empty-state-icon" }, "No recipes yet"),
			el("div", null, "Click \"+ New Recipe\" to create one."),
		));
		return;
	}

	const sorted = [...recipes.values()].sort((a, b) => {
		const da = new Date(b.updated_at || b.created_at);
		const db = new Date(a.updated_at || a.created_at);
		return da - db;
	});

	for (const recipe of sorted) {
		const card = el("div", { class: "rcp-card rcp-card-clickable", onClick: () => openDetail(recipe.id) },
			el("div", { class: "rcp-card-header" },
				el("h3", { class: "rcp-card-title" }, recipe.title || "Untitled"),
			),
			el("div", { class: "rcp-card-footer" },
				el("span", { class: "rcp-text-muted rcp-text-sm" },
					ctx.utils.formatDate(recipe.updated_at || recipe.created_at),
				),
			),
		);
		grid.appendChild(card);
	}
}

// =========================================
// Detail view
// =========================================

function openDetail(recipeId) {
	activeRecipeId = recipeId;
	viewMode = "detail";
	detailData = null;
	send("recipe_get", { id: recipeId });
	renderDetailLoading();
}

function renderDetailLoading() {
	container.innerHTML = "";
	container.appendChild(el("div", { class: "rcp-detail" },
		renderBackButton(),
		el("div", { class: "rcp-empty-state" }, "Loading recipe..."),
	));
}

function renderBackButton() {
	return el("button", { class: "rcp-detail-back", onClick: () => backToList() }, "\u2190 Back to recipes");
}

function backToList() {
	viewMode = "list";
	activeRecipeId = null;
	detailData = null;
	renderList();
}

function renderDetail() {
	if (!detailData || !detailData.recipe) return;
	container.innerHTML = "";

	const { recipe, ingredients, images, tags } = detailData;
	const owner = isOwner(recipe);

	const detail = el("div", { class: "rcp-detail" });

	// Back button
	detail.appendChild(renderBackButton());

	// Title row with actions
	const titleRow = el("div", { class: "rcp-section-header" },
		el("h1", { class: "rcp-detail-title" }, recipe.title),
	);

	const actions = el("div", { class: "rcp-section-actions" });
	if (owner) {
		actions.appendChild(el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => openEditDialog(recipe) }, "Edit"));
		actions.appendChild(el("button", { class: "rcp-btn rcp-btn-danger", onClick: () => confirmDelete(recipe) }, "Delete"));
	} else {
		actions.appendChild(el("button", { class: "rcp-btn rcp-btn-primary", onClick: () => saveRecipe(recipe.id) }, "Save to My Recipes"));
	}
	titleRow.appendChild(actions);
	detail.appendChild(titleRow);

	// Meta
	detail.appendChild(el("div", { class: "rcp-detail-meta" },
		el("span", { class: "rcp-detail-meta-item rcp-text-muted" },
			"Created " + ctx.utils.formatDate(recipe.created_at),
		),
		recipe.updated_at ? el("span", { class: "rcp-detail-meta-item rcp-text-muted" },
			"Updated " + ctx.utils.formatDate(recipe.updated_at),
		) : null,
	));

	// Tags section
	detail.appendChild(renderTagsSection(tags || [], owner, recipe.id));

	// Images section
	detail.appendChild(renderImagesSection(images || [], owner, recipe.id));

	// Ingredients section
	detail.appendChild(renderIngredientsSection(ingredients || [], owner, recipe.id));

	// Instructions section
	if (recipe.instructions) {
		const instrSection = el("div", { class: "rcp-detail-section" },
			el("h3", { class: "rcp-detail-section-title" }, "Instructions"),
			el("div", { class: "rcp-detail-description" }, recipe.instructions),
		);
		detail.appendChild(instrSection);
	}

	container.appendChild(detail);
}

// =========================================
// Tags section
// =========================================

function renderTagsSection(tags, owner, recipeId) {
	const section = el("div", { class: "rcp-detail-section" });
	const titleRow = el("div", { class: "rcp-flex-row rcp-gap-sm", style: { marginBottom: "8px", alignItems: "center" } },
		el("h3", { class: "rcp-detail-section-title", style: { margin: "0" } }, "Tags"),
	);
	section.appendChild(titleRow);

	const tagList = el("div", { class: "rcp-tag-list" });
	for (const t of tags) {
		const tagEl = el("span", { class: "rcp-tag rcp-tag-accent" }, t.tag);
		if (owner) {
			const removeBtn = el("span", { class: "rcp-tag-remove", onClick: () => removeTag(recipeId, tags, t.tag) }, "\u2715");
			tagEl.appendChild(removeBtn);
		}
		tagList.appendChild(tagEl);
	}

	if (owner) {
		const addInput = el("input", {
			class: "rcp-input",
			placeholder: "Add tag...",
			style: { width: "100px", padding: "2px 6px", fontSize: "var(--font-size-xs)" },
		});
		addInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				const val = addInput.value.trim();
				if (!val) return;
				const currentTags = (tags || []).map(t => t.tag);
				if (currentTags.includes(val)) { addInput.value = ""; return; }
				send("recipe_tags_update", {
					recipe_id: recipeId,
					tags: [...currentTags, val],
					last_modified_at: Date.now(),
				});
				addInput.value = "";
			}
		});
		tagList.appendChild(addInput);
	}

	section.appendChild(tagList);
	return section;
}

function removeTag(recipeId, tags, tagToRemove) {
	const remaining = tags.filter(t => t.tag !== tagToRemove).map(t => t.tag);
	send("recipe_tags_update", {
		recipe_id: recipeId,
		tags: remaining,
		last_modified_at: Date.now(),
	});
}

// =========================================
// Images section
// =========================================

function renderImagesSection(images, owner, recipeId) {
	const section = el("div", { class: "rcp-detail-section" },
		el("h3", { class: "rcp-detail-section-title" }, "Images"),
	);

	const gallery = el("div", { class: "rcp-image-gallery" });

	for (const img of images) {
		const thumb = el("div", { class: "rcp-image-thumb" },
			el("img", { src: ctx.utils.imageUrl(img.file_path), alt: "Recipe image" }),
		);
		if (owner) {
			const overlay = el("div", { class: "rcp-image-thumb-overlay" },
				el("button", {
					class: "rcp-btn rcp-btn-danger rcp-btn-sm",
					onClick: (e) => { e.stopPropagation(); deleteImage(recipeId, img.id); },
				}, "Delete"),
			);
			thumb.appendChild(overlay);
		}
		gallery.appendChild(thumb);
	}

	if (owner) {
		const addBtn = el("button", { class: "rcp-image-add", onClick: () => uploadImage(recipeId) }, "+");
		gallery.appendChild(addBtn);
	}

	section.appendChild(gallery);
	return section;
}

function deleteImage(recipeId, imageId) {
	send("recipe_image_delete", { recipe_id: recipeId, image_id: imageId });
}

function uploadImage(recipeId) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/jpeg,image/png";
	input.onchange = async () => {
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 10 * 1024 * 1024) {
			toast("Image must be under 10 MB", "error");
			return;
		}
		try {
			const result = await ipcRenderer.invoke("recipes:upload-image", {
				recipeId,
				filePath: file.path,
			});
			if (result && result.id) {
				send("recipe_get", { id: recipeId });
				toast("Image uploaded", "info");
			} else if (result && result.error) {
				toast(result.error, "error");
			}
		} catch (err) {
			toast("Upload failed: " + err.message, "error");
		}
	};
	input.click();
}

// =========================================
// Ingredients section
// =========================================

function renderIngredientsSection(ingredients, owner, recipeId) {
	const section = el("div", { class: "rcp-detail-section" });

	const titleRow = el("div", { class: "rcp-flex-row rcp-gap-sm", style: { marginBottom: "8px", alignItems: "center", justifyContent: "space-between" } },
		el("h3", { class: "rcp-detail-section-title", style: { margin: "0" } }, "Ingredients"),
	);

	if (owner) {
		titleRow.appendChild(el("button", {
			class: "rcp-btn rcp-btn-secondary rcp-btn-sm",
			onClick: () => openIngredientsEditor(recipeId, ingredients),
		}, "Edit Ingredients"));
	}

	section.appendChild(titleRow);

	if (ingredients.length === 0) {
		section.appendChild(el("div", { class: "rcp-text-muted rcp-text-sm" }, "No ingredients added yet."));
		return section;
	}

	const list = el("ul", { class: "rcp-ingredients-list" });
	for (const ing of ingredients) {
		const qty = nullableStr(ing.quantity);
		const unit = nullableStr(ing.unit);
		const qtyText = qty ? (qty + (unit ? " " + unit : "")) : "";

		list.appendChild(el("li", { class: "rcp-ingredient-item" },
			el("span", { class: "rcp-ingredient-qty" }, qtyText),
			el("span", { class: "rcp-ingredient-name" }, ing.name),
		));
	}
	section.appendChild(list);
	return section;
}

// =========================================
// Ingredients editor dialog
// =========================================

function openIngredientsEditor(recipeId, ingredients) {
	let rows = ingredients.map(ing => ({
		name: ing.name || "",
		quantity: nullableStr(ing.quantity),
		unit: nullableStr(ing.unit),
	}));
	if (rows.length === 0) rows.push({ name: "", quantity: "", unit: "" });

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-header" },
		el("h3", null, "Edit Ingredients"),
		el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u2715"),
	));

	const body = el("div", { class: "rcp-dialog-body rcp-ingredient-editor" });

	function renderRows() {
		body.innerHTML = "";
		rows.forEach((row, i) => {
			const rowEl = el("div", { class: "rcp-ingredient-editor-row" },
				el("input", {
					class: "rcp-input",
					placeholder: "Ingredient name",
					value: row.name,
					onInput: (e) => { rows[i].name = e.target.value; },
				}),
				el("input", {
					class: "rcp-input rcp-input-qty",
					placeholder: "Qty",
					value: row.quantity,
					onInput: (e) => { rows[i].quantity = e.target.value; },
				}),
				el("input", {
					class: "rcp-input rcp-input-unit",
					placeholder: "Unit",
					value: row.unit,
					onInput: (e) => { rows[i].unit = e.target.value; },
				}),
				el("button", {
					class: "rcp-btn rcp-btn-icon",
					onClick: () => { rows.splice(i, 1); if (rows.length === 0) rows.push({ name: "", quantity: "", unit: "" }); renderRows(); },
				}, "\u2715"),
			);
			body.appendChild(rowEl);
		});

		body.appendChild(el("button", {
			class: "rcp-btn rcp-btn-secondary rcp-btn-sm",
			onClick: () => { rows.push({ name: "", quantity: "", unit: "" }); renderRows(); },
		}, "+ Add Ingredient"));
	}

	renderRows();
	dialog.appendChild(body);

	dialog.appendChild(el("div", { class: "rcp-dialog-footer" },
		el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
		el("button", {
			class: "rcp-btn rcp-btn-primary",
			onClick: () => {
				const filtered = rows
					.filter(r => r.name.trim())
					.map((r, i) => ({
						name: r.name.trim(),
						quantity: r.quantity.trim() ? Number(r.quantity.trim()) || r.quantity.trim() : null,
						unit: r.unit.trim() || null,
						position: i,
					}));
				send("recipe_ingredients_update", {
					recipe_id: recipeId,
					ingredients: filtered,
					last_modified_at: Date.now(),
				});
				overlay.remove();
			},
		}, "Save"),
	));

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
}

// =========================================
// Create dialog
// =========================================

function openCreateDialog() {
	let title = "";
	let instructions = "";

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-header" },
		el("h3", null, "New Recipe"),
		el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u2715"),
	));

	const titleInput = el("input", {
		class: "rcp-input",
		placeholder: "Recipe title",
		onInput: (e) => { title = e.target.value; },
	});

	const instrInput = el("textarea", {
		class: "rcp-textarea",
		placeholder: "Instructions (optional)",
		style: { minHeight: "120px" },
		onInput: (e) => { instructions = e.target.value; },
	});

	dialog.appendChild(el("div", { class: "rcp-dialog-body" },
		el("div", { class: "rcp-form-row" },
			el("label", null, "Title"),
			titleInput,
		),
		el("div", { class: "rcp-form-row" },
			el("label", null, "Instructions"),
			instrInput,
		),
	));

	dialog.appendChild(el("div", { class: "rcp-dialog-footer" },
		el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
		el("button", {
			class: "rcp-btn rcp-btn-primary",
			onClick: () => {
				const t = title.trim();
				if (!t) { toast("Title is required", "warning"); return; }
				send("recipe_create", {
					title: t,
					instructions: instructions.trim(),
					last_modified_at: Date.now(),
				});
				overlay.remove();
			},
		}, "Create"),
	));

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
	titleInput.focus();
}

// =========================================
// Edit dialog
// =========================================

function openEditDialog(recipe) {
	let title = recipe.title || "";
	let instructions = recipe.instructions || "";

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-header" },
		el("h3", null, "Edit Recipe"),
		el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u2715"),
	));

	const titleInput = el("input", {
		class: "rcp-input",
		placeholder: "Recipe title",
		value: title,
		onInput: (e) => { title = e.target.value; },
	});

	const instrInput = el("textarea", {
		class: "rcp-textarea",
		placeholder: "Instructions",
		style: { minHeight: "120px" },
		onInput: (e) => { instructions = e.target.value; },
	});
	instrInput.value = instructions;

	dialog.appendChild(el("div", { class: "rcp-dialog-body" },
		el("div", { class: "rcp-form-row" },
			el("label", null, "Title"),
			titleInput,
		),
		el("div", { class: "rcp-form-row" },
			el("label", null, "Instructions"),
			instrInput,
		),
	));

	dialog.appendChild(el("div", { class: "rcp-dialog-footer" },
		el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
		el("button", {
			class: "rcp-btn rcp-btn-primary",
			onClick: () => {
				const t = title.trim();
				if (!t) { toast("Title is required", "warning"); return; }
				send("recipe_update", {
					id: recipe.id,
					title: t,
					instructions: instructions.trim(),
					last_modified_at: Date.now(),
				});
				overlay.remove();
			},
		}, "Save"),
	));

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
	titleInput.focus();
}

// =========================================
// Delete confirmation
// =========================================

function confirmDelete(recipe) {
	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const dialog = el("div", { class: "rcp-dialog" });

	dialog.appendChild(el("div", { class: "rcp-dialog-header" },
		el("h3", null, "Delete Recipe"),
	));

	dialog.appendChild(el("div", { class: "rcp-dialog-body" },
		el("p", { style: { margin: "0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" } },
			"Are you sure you want to delete \"" + recipe.title + "\"? This action cannot be undone.",
		),
	));

	dialog.appendChild(el("div", { class: "rcp-dialog-footer" },
		el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
		el("button", {
			class: "rcp-btn rcp-btn-danger",
			onClick: () => {
				send("recipe_delete", { id: recipe.id });
				overlay.remove();
			},
		}, "Delete"),
	));

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
}

// =========================================
// Save recipe (non-owner)
// =========================================

function saveRecipe(recipeId) {
	send("recipe_save", { recipe_id: recipeId });
	toast("Recipe saved to your collection", "info");
}

// =========================================
// Event handling
// =========================================

function handleEvent(event, data) {
	switch (event) {
		case "recipe_data": {
			if (viewMode === "detail" && data.recipe && data.recipe.id === activeRecipeId) {
				detailData = data;
				renderDetail();
			}
			break;
		}
		case "recipe_updated": {
			if (viewMode !== "detail" || !activeRecipeId) break;

			// Polymorphic: check what changed
			if (data.ingredients && data.recipe_id === activeRecipeId) {
				// Ingredients updated -- re-fetch full detail
				send("recipe_get", { id: activeRecipeId });
			} else if (data.tags && data.recipe_id === activeRecipeId) {
				// Tags updated -- re-fetch full detail
				send("recipe_get", { id: activeRecipeId });
			} else if (data.image && data.recipe_id === activeRecipeId) {
				// Image added -- re-fetch full detail
				send("recipe_get", { id: activeRecipeId });
			} else if (data.deleted_image_id && data.recipe_id === activeRecipeId) {
				// Image deleted -- remove from local detail data
				if (detailData && detailData.images) {
					detailData.images = detailData.images.filter(img => img.id !== data.deleted_image_id);
					renderDetail();
				}
			} else if (data.id === activeRecipeId) {
				// Title/instructions updated -- re-fetch
				send("recipe_get", { id: activeRecipeId });
			}
			break;
		}
		case "recipe_created": {
			// If in list mode, the state listener handles re-render
			// Open the newly created recipe detail
			if (data.id) {
				openDetail(data.id);
			}
			break;
		}
		case "recipe_deleted": {
			if (viewMode === "detail" && data.id === activeRecipeId) {
				toast("Recipe deleted", "info");
				backToList();
			}
			break;
		}
	}
}

// =========================================
// Module exports
// =========================================

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;
	viewMode = "list";
	activeRecipeId = null;
	detailData = null;
	unsubs = [];
	renderList();
}

export function onEvent(event, data) {
	handleEvent(event, data);
}

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	viewMode = "list";
	activeRecipeId = null;
	detailData = null;
}
