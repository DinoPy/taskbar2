const { ipcRenderer } = require("electron");

import * as state from "./recipesState.js";
import * as utils from "./recipesUtils.js";
import * as recipes from "./recipesSection.js";
import * as groups from "./groupsSection.js";
import * as mealLog from "./mealLogSection.js";
import * as planner from "./plannerSection.js";
import * as saved from "./savedSection.js";

// =========================================
// Send helper
// =========================================

export const sendEvent = (event, data = {}) => {
	ipcRenderer.send("recipes-send", { event, data });
};

// =========================================
// Navigation config
// =========================================

const NAV_ITEMS = [
	{ id: "recipes", label: "My Recipes", icon: "\uD83C\uDF73" },
	{ id: "groups", label: "Groups", icon: "\uD83D\uDC65" },
	{ id: "mealLog", label: "Meal Log", icon: "\uD83D\uDCDD" },
	{ id: "planner", label: "Planner", icon: "\uD83D\uDCC5" },
	{ id: "saved", label: "Saved", icon: "\uD83D\uDD16" },
];

// =========================================
// Placeholder section module
// =========================================

function createPlaceholder(name) {
	return {
		init() {},
		render(container) {
			container.innerHTML = `<div class="rcp-empty-state">${name} — coming soon</div>`;
		},
		onEvent() {},
		destroy() {},
	};
}

// Section modules
const sections = {};
for (const item of NAV_ITEMS) {
	sections[item.id] = createPlaceholder(item.label);
}
sections["recipes"] = recipes;
sections["groups"] = groups;
sections["mealLog"] = mealLog;
sections["planner"] = planner;
sections["saved"] = saved;

// =========================================
// State
// =========================================

let activeSection = null;
let activeSectionId = null;

// =========================================
// Toast helper
// =========================================

function showToast(message, type = "info") {
	const toast = utils.el("div", { class: "rcp-toast rcp-toast--" + type }, message);
	document.body.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("rcp-toast--visible"));
	setTimeout(() => {
		toast.classList.remove("rcp-toast--visible");
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

// =========================================
// Sidebar rendering
// =========================================

function renderSidebar() {
	const navList = document.getElementById("rcp-nav-list");
	if (!navList) return;

	for (const item of NAV_ITEMS) {
		const li = utils.el("li", { class: "rcp-nav-item", "data-section": item.id },
			utils.el("span", { class: "rcp-nav-icon" }, item.icon),
			utils.el("span", { class: "rcp-nav-label" }, item.label),
		);
		li.addEventListener("click", () => switchSection(item.id));
		navList.appendChild(li);
	}
}

function renderWorkspaceSelector() {
	const footer = document.getElementById("rcp-sidebar-footer");
	if (!footer) return;

	let dropdownOpen = false;

	const switchWorkspace = (groupId) => {
		state.setActiveGroup(groupId || null);
		if (activeSectionId) {
			const contentEl = document.getElementById("rcp-content");
			if (contentEl && activeSection) {
				activeSection.destroy();
				contentEl.innerHTML = "";
				activeSection.render(contentEl);
			}
		}
	};

	const closeDropdown = () => {
		dropdownOpen = false;
		const dd = footer.querySelector(".rcp-workspace-dropdown");
		if (dd) dd.remove();
		document.removeEventListener("click", onOutsideClick, true);
	};

	const onOutsideClick = (e) => {
		if (!footer.contains(e.target)) closeDropdown();
	};

	const openDropdown = () => {
		if (dropdownOpen) { closeDropdown(); return; }
		dropdownOpen = true;

		const s = state.getState();
		const dd = utils.el("div", { class: "rcp-workspace-dropdown" });

		// Personal option
		const personalOpt = utils.el("div", {
			class: "rcp-workspace-option" + (!s.activeGroupId ? " active" : ""),
			onClick: () => { closeDropdown(); switchWorkspace(null); },
		},
			utils.el("span", { class: "rcp-workspace-option-icon" }, "\uD83D\uDC64"),
			utils.el("span", null, "Personal"),
		);
		dd.appendChild(personalOpt);

		// Group options
		for (const [id, group] of s.groups) {
			const opt = utils.el("div", {
				class: "rcp-workspace-option" + (id === s.activeGroupId ? " active" : ""),
				onClick: () => { closeDropdown(); switchWorkspace(id); },
			},
				utils.el("span", { class: "rcp-workspace-option-icon" }, "\uD83D\uDC65"),
				utils.el("span", null, group.name),
			);
			dd.appendChild(opt);
		}

		footer.style.position = "relative";
		dd.style.bottom = "100%";
		dd.style.marginBottom = "4px";
		footer.appendChild(dd);

		setTimeout(() => document.addEventListener("click", onOutsideClick, true), 0);
	};

	const updateSelector = () => {
		closeDropdown();
		footer.innerHTML = "";
		const s = state.getState();

		const activeGroup = s.activeGroupId ? s.groups.get(s.activeGroupId) : null;
		const label = activeGroup ? activeGroup.name : "Personal";
		const icon = activeGroup ? "\uD83D\uDC65" : "\uD83D\uDC64";

		const selector = utils.el("div", { class: "rcp-workspace-selector", onClick: openDropdown },
			utils.el("span", { class: "rcp-workspace-indicator" }),
			utils.el("span", { class: "rcp-workspace-name" }, label),
			utils.el("span", { class: "rcp-workspace-icon" }, icon),
			utils.el("span", { class: "rcp-workspace-chevron" }, "\u25B4"),
		);
		footer.appendChild(selector);
	};

	state.on("groups", updateSelector);
	state.on("activeGroup", updateSelector);
	updateSelector();
}

function updateNavActive(sectionId) {
	const items = document.querySelectorAll(".rcp-nav-item");
	for (const item of items) {
		item.classList.toggle("active", item.dataset.section === sectionId);
	}
}

// =========================================
// Section switching
// =========================================

function switchSection(sectionId) {
	if (sectionId === activeSectionId) return;

	const contentEl = document.getElementById("rcp-content");
	if (!contentEl) return;

	if (activeSection) {
		activeSection.destroy();
	}

	contentEl.innerHTML = "";
	activeSectionId = sectionId;
	activeSection = sections[sectionId] || createPlaceholder(sectionId);
	activeSection.render(contentEl);
	updateNavActive(sectionId);
}

// =========================================
// Event dispatch
// =========================================

function handleStateEvent(event, data) {
	switch (event) {
		case "recipe_list_data":
			state.setRecipes(data);
			break;
		case "recipe_created":
			state.upsertRecipe(data);
			break;
		case "recipe_updated": {
			const existing = state.getState().recipes.get(data.id);
			if (existing && data.title !== undefined) {
				state.upsertRecipe({ ...existing, ...data });
			}
			break;
		}
		case "recipe_deleted":
			state.removeRecipe(data.id);
			break;
		case "recipe_saved_list_data":
			state.setSavedRecipes(data);
			break;
		case "recipe_saved":
			break;
		case "recipe_unsaved":
			state.removeSavedRecipe(data.id || data.recipe_id);
			break;
		case "recipe_group_list_data":
			state.setGroups(data);
			break;
		case "recipe_group_created":
			state.upsertGroup(data);
			break;
		case "recipe_group_deleted":
			state.removeGroup(data.id);
			break;
		case "recipe_group_member_joined":
			state.addGroupMember(data.group_id, data);
			break;
		case "recipe_group_member_left":
			state.removeGroupMember(data.group_id, data.user_id);
			break;
		case "meal_list_data":
			state.setMeals(data);
			break;
		case "meal_logged":
			state.addMeal(data);
			break;
		case "meal_deleted":
			state.removeMeal(data.id);
			break;
		case "meal_plan_created":
			state.setPlan(data, []);
			break;
		case "meal_plan_data":
			state.setPlan(data.plan || data, data.entries);
			break;
		case "meal_plan_entry_updated":
			state.upsertPlanEntry(data);
			break;
		case "meal_plan_entry_removed":
			state.removePlanEntry(data.entry_id || data.id);
			break;
		case "meal_suggestions_data":
			state.setSuggestions(data);
			break;
		case "connection_error":
			showToast(data.message || "Connection error", "error");
			break;
		case "recipes_reconnected":
			sendEvent("recipe_group_list", {});
			if (activeSectionId) {
				const contentEl = document.getElementById("rcp-content");
				if (contentEl && activeSection) {
					activeSection.destroy();
					contentEl.innerHTML = "";
					activeSection.render(contentEl);
				}
			}
			break;
	}
}

// =========================================
// IPC listener
// =========================================

ipcRenderer.on("recipes-event", (_, { event, data }) => {
	handleStateEvent(event, data);
	activeSection?.onEvent?.(event, data);
});

// =========================================
// Close button
// =========================================

document.getElementById("rcp-close-btn").onclick = () => window.close();

// =========================================
// Init
// =========================================

const sharedCtx = { sendEvent, showToast, switchSection, state, utils };
recipes.init(sharedCtx);
groups.init(sharedCtx);
mealLog.init(sharedCtx);
planner.init(sharedCtx);
saved.init(sharedCtx);

renderSidebar();
renderWorkspaceSelector();
switchSection("recipes");

sendEvent("recipe_group_list", {});

export { showToast, switchSection, state, utils };
