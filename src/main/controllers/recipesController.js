export function createRecipesController({ windowManager, sendEvent }) {
	const RECIPES_SERVER_EVENTS = [
		"recipe_created", "recipe_data", "recipe_list_data",
		"recipe_updated", "recipe_deleted",
		"recipe_saved", "recipe_unsaved", "recipe_saved_list_data",
		"recipe_group_created", "recipe_group_list_data",
		"recipe_group_member_joined", "recipe_group_member_left",
		"recipe_group_deleted",
		"recipe_group_recipe_shared", "recipe_group_recipe_unshared",
		"meal_logged", "meal_deleted", "meal_list_data",
		"meal_plan_created", "meal_plan_data",
		"meal_plan_entry_updated", "meal_plan_entry_removed",
		"meal_suggestions_data",
	];

	function normalizeNullable(obj) {
		if (!obj || typeof obj !== "object") return obj;
		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				obj[i] = normalizeNullable(obj[i]);
			}
			return obj;
		}
		for (const key of Object.keys(obj)) {
			const val = obj[key];
			if (val && typeof val === "object" && !Array.isArray(val)) {
				if ("Valid" in val) {
					if ("UUID" in val) {
						obj[key] = val.Valid ? val.UUID : null;
					} else if ("String" in val) {
						obj[key] = val.Valid ? val.String : null;
					} else {
						normalizeNullable(val);
					}
				} else {
					normalizeNullable(val);
				}
			}
		}
		return obj;
	}

	const forwardToRecipesWindow = (event, data) => {
		const win = windowManager.getRecipesWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("recipes-event", { event, data });
		}
	};

	const getSocketEventHandlers = () => {
		const handlers = {};
		for (const eventName of RECIPES_SERVER_EVENTS) {
			handlers[eventName] = ({ data }) => {
				const normalized = normalizeNullable(
					typeof data === "string" ? JSON.parse(data) : data
				);
				forwardToRecipesWindow(eventName, normalized);
			};
		}
		return handlers;
	};

	const handleRendererSend = (eventName, data) => {
		sendEvent?.(eventName, data);
	};

	return {
		getSocketEventHandlers,
		handleRendererSend,
		forwardToRecipesWindow,
	};
}
