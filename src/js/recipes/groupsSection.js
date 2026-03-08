const { ipcRenderer } = require("electron");

let ctx = null;
let container = null;

// ------------------------------------
// Internal state
// ------------------------------------

let viewMode = "list"; // "list" | "detail"
let selectedGroupId = null;
let groupMembers = []; // members for the currently viewed group
let sharedRecipes = []; // recipes shared into the currently viewed group
let unsubs = [];

// ------------------------------------
// Helpers
// ------------------------------------

function getCurrentUserId() {
	try {
		return ipcRenderer.sendSync("get-server-user-id");
	} catch {
		return null;
	}
}

function isOwner(group) {
	return group && group.created_by === getCurrentUserId();
}

function memberDisplayName(m) {
	const parts = [m.first_name, m.last_name].filter(Boolean);
	return parts.length > 0 ? parts.join(" ") : (m.email || "Unknown");
}

function memberInitial(m) {
	if (m.first_name) return m.first_name.charAt(0).toUpperCase();
	if (m.email) return m.email.charAt(0).toUpperCase();
	return "?";
}

// ------------------------------------
// List view
// ------------------------------------

function renderList() {
	const { el } = ctx.utils;
	const s = ctx.state.getState();
	container.innerHTML = "";

	// Header
	const header = el("div", { class: "rcp-section-header" },
		el("h2", { class: "rcp-section-title" }, "Groups"),
		el("div", { class: "rcp-section-actions" },
			el("button", { class: "rcp-btn rcp-btn-primary", onClick: showCreateDialog }, "+ New Group"),
		),
	);
	container.appendChild(header);

	// Card grid
	const groups = Array.from(s.groups.values());
	if (groups.length === 0) {
		container.appendChild(el("div", { class: "rcp-empty-state" },
			el("div", { class: "rcp-empty-state-icon" }, "\uD83D\uDC65"),
			"No groups yet. Create one to start sharing recipes.",
		));
		return;
	}

	const grid = el("div", { class: "rcp-card-grid" });
	for (const group of groups) {
		const owner = isOwner(group);
		const card = el("div", { class: "rcp-card rcp-card-clickable", onClick: () => openDetail(group.id) },
			el("div", { class: "rcp-card-header" },
				el("h3", { class: "rcp-card-title" }, group.name),
				owner ? el("span", { class: "rcp-tag rcp-tag-accent" }, "Owner") : null,
			),
			el("div", { class: "rcp-card-body rcp-text-muted rcp-text-sm" },
				"Created " + ctx.utils.formatDate(group.created_at),
			),
		);
		grid.appendChild(card);
	}
	container.appendChild(grid);
}

// ------------------------------------
// Detail view
// ------------------------------------

function openDetail(groupId) {
	selectedGroupId = groupId;
	viewMode = "detail";
	// Request members and shared recipes from server
	// The server should respond via events; we also re-request group list to be safe
	ctx.sendEvent("recipe_group_list", {});
	renderDetail();
}

function renderDetail() {
	const { el } = ctx.utils;
	const s = ctx.state.getState();
	const group = s.groups.get(selectedGroupId);

	if (!group) {
		backToList();
		return;
	}

	container.innerHTML = "";
	const owner = isOwner(group);
	const userId = getCurrentUserId();

	// Back button
	container.appendChild(
		el("button", { class: "rcp-detail-back", onClick: backToList }, "\u2190 Back to Groups"),
	);

	// Title row
	const titleRow = el("div", { class: "rcp-section-header", style: { marginTop: "var(--spacing-sm)" } },
		el("h2", { class: "rcp-detail-title" }, group.name),
		el("div", { class: "rcp-section-actions" },
			owner
				? el("button", { class: "rcp-btn rcp-btn-danger rcp-btn-sm", onClick: () => confirmDeleteGroup(group) }, "Delete Group")
				: el("button", { class: "rcp-btn rcp-btn-secondary rcp-btn-sm", onClick: () => leaveGroup(group) }, "Leave Group"),
		),
	);
	container.appendChild(titleRow);

	// Meta
	container.appendChild(
		el("div", { class: "rcp-detail-meta" },
			el("span", { class: "rcp-detail-meta-item rcp-text-muted" }, "Created " + ctx.utils.formatDate(group.created_at)),
		),
	);

	// Members section
	const membersSection = el("div", { class: "rcp-detail-section" });
	membersSection.appendChild(el("h3", { class: "rcp-detail-section-title" }, "Members"));

	// Add member input (owner only)
	if (owner) {
		const emailInput = el("input", {
			class: "rcp-input",
			type: "email",
			placeholder: "Add member by email...",
			style: { width: "100%", marginBottom: "var(--spacing-sm)" },
		});
		const addRow = el("div", { class: "rcp-form-row horizontal", style: { marginBottom: "var(--spacing-sm)" } },
			emailInput,
			el("button", { class: "rcp-btn rcp-btn-primary rcp-btn-sm", onClick: () => addMember(emailInput) }, "Add"),
		);
		emailInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addMember(emailInput);
			}
		});
		membersSection.appendChild(addRow);
	}

	// Members list
	const membersList = el("div", { class: "rcp-members-list" });
	const members = ctx.state.getState().groupMembers.get(selectedGroupId) || [];
	if (members.length === 0) {
		membersList.appendChild(el("div", { class: "rcp-text-muted rcp-text-sm", style: { padding: "var(--spacing-xs) var(--spacing-sm)" } }, "No members loaded yet."));
	}
	for (const m of members) {
		const mRole = m.member ? m.member.role : m.role;
		const mUserId = m.member ? m.member.user_id : m.user_id;
		const isOwnerMember = mRole === "owner";

		const memberItem = el("div", { class: "rcp-member-item" },
			el("div", { class: "rcp-member-avatar" }, memberInitial(m)),
			el("div", { class: "rcp-member-info" },
				el("div", { class: "rcp-member-name" }, memberDisplayName(m)),
				el("div", { class: "rcp-member-role" }, isOwnerMember ? "Owner" : "Member"),
			),
		);

		// Owner can remove non-owners
		if (owner && !isOwnerMember && mUserId !== userId) {
			memberItem.appendChild(
				el("button", {
					class: "rcp-btn rcp-btn-danger rcp-btn-sm",
					onClick: () => removeMember(mUserId),
				}, "Remove"),
			);
		}

		membersList.appendChild(memberItem);
	}
	membersSection.appendChild(membersList);
	container.appendChild(membersSection);

	// Shared recipes section
	const recipesSection = el("div", { class: "rcp-detail-section" });
	recipesSection.appendChild(el("h3", { class: "rcp-detail-section-title" }, "Shared Recipes"));

	// Share recipe controls (any member who owns recipes can share)
	const myRecipes = Array.from(s.recipes.values()).filter(r => r.user_id === userId);
	// Filter out already-shared recipes
	const alreadySharedIds = new Set(sharedRecipes.map(r => r.id));
	const shareable = myRecipes.filter(r => !alreadySharedIds.has(r.id));

	if (shareable.length > 0) {
		const recipeSelect = el("select", { class: "rcp-select", style: { flex: "1" } });
		recipeSelect.appendChild(el("option", { value: "" }, "Select a recipe to share..."));
		for (const r of shareable) {
			recipeSelect.appendChild(el("option", { value: r.id }, r.title));
		}
		const shareRow = el("div", { class: "rcp-form-row horizontal", style: { marginBottom: "var(--spacing-sm)" } },
			recipeSelect,
			el("button", { class: "rcp-btn rcp-btn-primary rcp-btn-sm", onClick: () => shareRecipe(recipeSelect) }, "Share"),
		);
		recipesSection.appendChild(shareRow);
	}

	// Shared recipes list
	if (sharedRecipes.length === 0) {
		recipesSection.appendChild(
			el("div", { class: "rcp-text-muted rcp-text-sm", style: { padding: "var(--spacing-xs) var(--spacing-sm)" } }, "No recipes shared in this group yet."),
		);
	} else {
		const recipeList = el("div", { class: "rcp-members-list" });
		for (const recipe of sharedRecipes) {
			const recipeOwner = recipe.user_id === userId;
			const item = el("div", { class: "rcp-member-item" },
				el("div", { class: "rcp-member-info" },
					el("div", { class: "rcp-member-name" }, recipe.title),
					el("div", { class: "rcp-member-role" }, recipeOwner ? "Your recipe" : "Shared"),
				),
			);
			// Recipe owner can unshare
			if (recipeOwner) {
				item.appendChild(
					el("button", {
						class: "rcp-btn rcp-btn-secondary rcp-btn-sm",
						onClick: () => unshareRecipe(recipe.id),
					}, "Unshare"),
				);
			}
			recipeList.appendChild(item);
		}
		recipesSection.appendChild(recipeList);
	}
	container.appendChild(recipesSection);
}

// ------------------------------------
// Actions
// ------------------------------------

function showCreateDialog() {
	const { el } = ctx.utils;

	const overlay = el("div", { class: "rcp-dialog-overlay" });
	const nameInput = el("input", { class: "rcp-input", type: "text", placeholder: "Group name", style: { width: "100%" } });

	const doCreate = () => {
		const name = nameInput.value.trim();
		if (!name) {
			ctx.showToast("Group name is required", "error");
			return;
		}
		ctx.sendEvent("recipe_group_create", {
			name,
			last_modified_at: Date.now(),
		});
		overlay.remove();
	};

	const dialog = el("div", { class: "rcp-dialog" },
		el("div", { class: "rcp-dialog-header" },
			el("h3", null, "New Group"),
			el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u00D7"),
		),
		el("div", { class: "rcp-dialog-body" },
			el("div", { class: "rcp-form-row" },
				el("label", null, "Name"),
				nameInput,
			),
		),
		el("div", { class: "rcp-dialog-footer" },
			el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
			el("button", { class: "rcp-btn rcp-btn-primary", onClick: doCreate }, "Create"),
		),
	);

	nameInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			doCreate();
		}
	});

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
	nameInput.focus();
}

function addMember(emailInput) {
	const email = emailInput.value.trim();
	if (!email) return;
	ctx.sendEvent("recipe_group_member_add", {
		group_id: selectedGroupId,
		email,
	});
	emailInput.value = "";
}

function removeMember(userId) {
	ctx.sendEvent("recipe_group_member_remove", {
		group_id: selectedGroupId,
		user_id: userId,
	});
}

function leaveGroup(group) {
	const userId = getCurrentUserId();
	if (!userId) return;
	ctx.sendEvent("recipe_group_member_remove", {
		group_id: group.id,
		user_id: userId,
	});
}

function confirmDeleteGroup(group) {
	const { el } = ctx.utils;
	const overlay = el("div", { class: "rcp-dialog-overlay" });

	const dialog = el("div", { class: "rcp-dialog" },
		el("div", { class: "rcp-dialog-header" },
			el("h3", null, "Delete Group"),
			el("button", { class: "rcp-btn rcp-btn-icon", onClick: () => overlay.remove() }, "\u00D7"),
		),
		el("div", { class: "rcp-dialog-body" },
			el("p", { style: { margin: "0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" } },
				"Are you sure you want to delete \"" + group.name + "\"? Members' saved recipes will be copied to their personal collections.",
			),
		),
		el("div", { class: "rcp-dialog-footer" },
			el("button", { class: "rcp-btn rcp-btn-secondary", onClick: () => overlay.remove() }, "Cancel"),
			el("button", { class: "rcp-btn rcp-btn-danger", onClick: () => {
				ctx.sendEvent("recipe_group_delete", { id: group.id });
				overlay.remove();
			} }, "Delete"),
		),
	);

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
}

function shareRecipe(selectEl) {
	const recipeId = selectEl.value;
	if (!recipeId) return;
	ctx.sendEvent("recipe_group_share_recipe", {
		group_id: selectedGroupId,
		recipe_id: recipeId,
	});
	selectEl.value = "";
}

function unshareRecipe(recipeId) {
	ctx.sendEvent("recipe_group_unshare_recipe", {
		group_id: selectedGroupId,
		recipe_id: recipeId,
	});
}

// ------------------------------------
// Navigation
// ------------------------------------

function backToList() {
	viewMode = "list";
	selectedGroupId = null;
	groupMembers = [];
	sharedRecipes = [];
	renderList();
}

function rerender() {
	if (!container) return;
	if (viewMode === "detail") {
		renderDetail();
	} else {
		renderList();
	}
}

// ------------------------------------
// Lifecycle
// ------------------------------------

export function init(sharedCtx) {
	ctx = sharedCtx;
}

export function render(ct) {
	container = ct;
	viewMode = "list";
	selectedGroupId = null;
	groupMembers = [];
	sharedRecipes = [];

	// Subscribe to state changes
	unsubs.push(ctx.state.on("groups", () => rerender()));
	unsubs.push(ctx.state.on("groupMembers", () => {
		if (viewMode === "detail") renderDetail();
	}));

	// Request data
	ctx.sendEvent("recipe_group_list", {});

	renderList();
}

export function onEvent(event, data) {
	switch (event) {
		case "recipe_group_created":
			if (viewMode === "list") renderList();
			break;
		case "recipe_group_deleted":
			if (viewMode === "detail" && selectedGroupId === data.id) {
				backToList();
			} else if (viewMode === "list") {
				renderList();
			}
			break;
		case "recipe_group_member_joined":
			if (viewMode === "detail" && selectedGroupId === data.group_id) {
				renderDetail();
			}
			break;
		case "recipe_group_member_left": {
			const userId = getCurrentUserId();
			// If we were removed / left, go back to list
			if (data.user_id === userId && selectedGroupId === data.group_id) {
				backToList();
				ctx.showToast("You left the group", "info");
			} else if (viewMode === "detail" && selectedGroupId === data.group_id) {
				renderDetail();
			}
			break;
		}
		case "recipe_group_recipe_shared":
			if (data.group_id === selectedGroupId && data.recipe) {
				sharedRecipes.push(data.recipe);
				if (viewMode === "detail") renderDetail();
			}
			break;
		case "recipe_group_recipe_unshared":
			if (data.group_id === selectedGroupId) {
				sharedRecipes = sharedRecipes.filter(r => r.id !== data.recipe_id);
				if (viewMode === "detail") renderDetail();
			}
			break;
	}
}

export function destroy() {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	container = null;
	viewMode = "list";
	selectedGroupId = null;
	groupMembers = [];
	sharedRecipes = [];
}
