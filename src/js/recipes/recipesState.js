const state = {
	recipes: new Map(),
	savedRecipes: new Map(),
	groups: new Map(),
	groupMembers: new Map(),
	meals: [],
	mealsHasMore: true,
	mealsOffset: 0,
	mealsAppendNext: false,
	currentPlan: null,
	planEntries: new Map(),
	suggestions: [],
	activeGroupId: null,
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

export function setRecipes(list) {
	state.recipes.clear();
	for (const r of list) state.recipes.set(r.id, r);
	emit("recipes");
}

export function upsertRecipe(recipe) {
	state.recipes.set(recipe.id, recipe);
	emit("recipes");
}

export function removeRecipe(id) {
	state.recipes.delete(id);
	emit("recipes");
}

export function setSavedRecipes(list) {
	state.savedRecipes.clear();
	for (const r of list) state.savedRecipes.set(r.id, r);
	emit("savedRecipes");
}

export function removeSavedRecipe(id) {
	state.savedRecipes.delete(id);
	emit("savedRecipes");
}

export function setGroups(list) {
	state.groups.clear();
	for (const g of list) state.groups.set(g.id, g);
	emit("groups");
}

export function upsertGroup(group) {
	state.groups.set(group.id, group);
	emit("groups");
}

export function removeGroup(id) {
	state.groups.delete(id);
	if (state.activeGroupId === id) {
		state.activeGroupId = null;
	}
	emit("groups");
}

export function setGroupMembers(groupId, members) {
	state.groupMembers.set(groupId, members);
	emit("groupMembers");
}

export function addGroupMember(groupId, member) {
	const members = state.groupMembers.get(groupId) || [];
	members.push(member);
	state.groupMembers.set(groupId, members);
	emit("groupMembers");
}

export function removeGroupMember(groupId, userId) {
	const members = state.groupMembers.get(groupId) || [];
	state.groupMembers.set(groupId, members.filter(m => m.user_id !== userId));
	emit("groupMembers");
}

export function setMeals(list, append = false) {
	if (append || state.mealsAppendNext) {
		state.meals.push(...list);
	} else {
		state.meals = list;
	}
	state.mealsAppendNext = false;
	state.mealsOffset = state.meals.length;
	state.mealsHasMore = list.length >= 50;
	emit("meals");
}

export function setMealsAppendNext(val) {
	state.mealsAppendNext = !!val;
}

export function addMeal(meal) {
	state.meals.unshift(meal);
	emit("meals");
}

export function removeMeal(id) {
	state.meals = state.meals.filter(m => m.id !== id);
	emit("meals");
}

export function setPlan(plan, entries) {
	state.currentPlan = plan;
	state.planEntries.clear();
	if (entries) {
		for (const e of entries) state.planEntries.set(e.id, e);
	}
	emit("plan");
}

export function upsertPlanEntry(entry) {
	state.planEntries.set(entry.id, entry);
	emit("plan");
}

export function removePlanEntry(entryId) {
	state.planEntries.delete(entryId);
	emit("plan");
}

export function setSuggestions(list) {
	state.suggestions = list || [];
	emit("suggestions");
}

export function setActiveGroup(groupId) {
	state.activeGroupId = groupId || null;
	emit("activeGroup");
}
