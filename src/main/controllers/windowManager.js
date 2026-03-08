export function createWindowManager({
	createTaskbarWindow,
	createEditWindow,
	createCompletedTasksWindow,
	createHelpWindow,
	createCustomCommandsWindow,
	createTaskSplitWindow,
	createKenbanWindow,
	createKeyWindow,
	createNotificationsWindow,
	createReminderWindow,
	createDeleteConfirmWindow,
	createCompletionConfirmWindow,
	createCalendarWindow,
	createAddDueWindow,
	createListWindow,
	createTemplateWindow,
	createVariablePromptWindow,
	createFinanceWindow,
	createRecipesWindow,
}) {
	const state = {
		taskbar: null,
		edit: null,
		completed: null,
		help: null,
		customCommands: null,
		taskSplit: null,
		kenban: null,
		notifications: null,
		reminder: null,
		completion: null,
		deleteConfirm: null,
		addDue: null,
		calendar: null,
		template: null,
		variablePrompt: null,
		finance: null,
		recipes: null,
		commandWindows: new Map(),
		listWindows: new Map(),
	};

	const attachLifecycle = (win, key, onClose) => {
		if (!win) return;
		win.on("closed", () => {
			if (key) {
				state.commandWindows.delete(key);
			}
			onClose?.();
		});
	};

	return {
		createTaskbarWindow(options) {
			if (state.taskbar && !state.taskbar.isDestroyed()) {
				return state.taskbar;
			}
			state.taskbar = createTaskbarWindow(options);
			state.taskbar.on("closed", () => {
				state.taskbar = null;
			});
			return state.taskbar;
		},

		openCompletionConfirmWindow(options = {}) {
			if (state.completion && !state.completion.isDestroyed()) {
				state.completion.focus();
				return state.completion;
			}
			state.completion = createCompletionConfirmWindow({
				...options,
				onClose: () => {
					state.completion = null;
					options?.onClose?.();
				},
			});
			return state.completion;
		},

		closeCompletionConfirmWindow() {
			if (state.completion && !state.completion.isDestroyed()) {
				state.completion.close();
			}
		},

		getTaskbarWindow() {
			return state.taskbar;
		},

		getEditWindow() {
			return state.edit;
		},

		openEditWindow({ props, onDataPrepared, onReadyToShow, onClose }) {
			if (state.edit && !state.edit.isDestroyed()) {
				state.edit.focus();
				state.edit.webContents.send("data-from-parent", props);
				return state.edit;
			}
			state.edit = createEditWindow({
				props,
				onDataPrepared,
				onReadyToShow,
				onClose: () => {
					state.edit = null;
					onClose?.();
				},
			});
			return state.edit;
		},

		closeEditWindow() {
			if (state.edit && !state.edit.isDestroyed()) {
				state.edit.close();
			}
		},

		openCompletedTasksWindow({ onDidFinishLoad, onClose }) {
			if (state.completed && !state.completed.isDestroyed()) {
				state.completed.focus();
				return state.completed;
			}
			state.completed = createCompletedTasksWindow({
				onDidFinishLoad,
				onClose: () => {
					state.completed = null;
					onClose?.();
				},
			});
			return state.completed;
		},

		closeCompletedTasksWindow() {
			if (state.completed && !state.completed.isDestroyed()) {
				state.completed.close();
			}
		},

		getCompletedTasksWindow() {
			return state.completed;
		},

		getCompletionConfirmWindow() {
			return state.completion;
		},

		openHelpWindow() {
			if (state.help && !state.help.isDestroyed()) {
				state.help.focus();
				return state.help;
			}
			state.help = createHelpWindow({
				onClose: () => {
					state.help = null;
				},
			});
			return state.help;
		},

		getHelpWindow() {
			return state.help;
		},

		openCustomCommandsWindow({ commands, reservedKeys, onClose }) {
			if (state.customCommands && !state.customCommands.isDestroyed()) {
				state.customCommands.focus();
				state.customCommands.webContents.send("data-from-parent", {
					commands,
					reserved_keys: reservedKeys,
				});
				return state.customCommands;
			}
			state.customCommands = createCustomCommandsWindow({
				commands,
				reservedKeys,
				onClose: () => {
					state.customCommands = null;
					onClose?.();
				},
			});
			return state.customCommands;
		},

		closeCustomCommandsWindow() {
			if (state.customCommands && !state.customCommands.isDestroyed()) {
				state.customCommands.close();
			}
		},

		getCustomCommandsWindow() {
			return state.customCommands;
		},

		openNotificationsWindow(options = {}) {
			if (state.notifications && !state.notifications.isDestroyed()) {
				return state.notifications;
			}
			state.notifications = createNotificationsWindow({
				...options,
				onClose: () => {
					state.notifications = null;
					options?.onClose?.();
				},
			});
			return state.notifications;
		},

		getNotificationsWindow() {
			return state.notifications;
		},

		closeNotificationsWindow() {
			if (state.notifications && !state.notifications.isDestroyed()) {
				state.notifications.close();
			}
		},

		openCalendarWindow(options = {}) {
			if (state.calendar && !state.calendar.isDestroyed()) {
				state.calendar.focus();
				return state.calendar;
			}
			state.calendar = createCalendarWindow({
				...options,
				onClose: () => {
					state.calendar = null;
					options?.onClose?.();
				},
			});
			return state.calendar;
		},

		getCalendarWindow() {
			return state.calendar;
		},

		closeCalendarWindow() {
			if (state.calendar && !state.calendar.isDestroyed()) {
				state.calendar.close();
			}
		},

		openReminderWindow(options = {}) {
			if (state.reminder && !state.reminder.isDestroyed()) {
				state.reminder.focus();
				return state.reminder;
			}
			state.reminder = createReminderWindow({
				...options,
				onClose: () => {
					state.reminder = null;
					options?.onClose?.();
				},
			});
			return state.reminder;
		},

		getReminderWindow() {
			return state.reminder;
		},

		closeReminderWindow() {
			if (state.reminder && !state.reminder.isDestroyed()) {
				state.reminder.close();
			}
		},

		openDeleteConfirmWindow(options = {}) {
			if (state.deleteConfirm && !state.deleteConfirm.isDestroyed()) {
				state.deleteConfirm.focus();
				state.deleteConfirm.webContents.send("delete-confirm-data", {
					tasks: options?.tasks ?? [],
				});
				return state.deleteConfirm;
			}
			state.deleteConfirm = createDeleteConfirmWindow({
				...options,
				onClose: () => {
					state.deleteConfirm = null;
					options?.onClose?.();
				},
			});
			return state.deleteConfirm;
		},

		getDeleteConfirmWindow() {
			return state.deleteConfirm;
		},

		closeDeleteConfirmWindow() {
			if (state.deleteConfirm && !state.deleteConfirm.isDestroyed()) {
				state.deleteConfirm.close();
			}
		},

		openAddDueWindow(options = {}) {
			if (state.addDue && !state.addDue.isDestroyed()) {
				state.addDue.focus();
				state.addDue.webContents.send("add-due-data", options?.task);
				return state.addDue;
			}
			state.addDue = createAddDueWindow({
				...options,
				onClose: () => {
					state.addDue = null;
					options?.onClose?.();
				},
			});
			return state.addDue;
		},

		getAddDueWindow() {
			return state.addDue;
		},

		closeAddDueWindow() {
			if (state.addDue && !state.addDue.isDestroyed()) {
				state.addDue.close();
			}
		},

		openTaskSplitWindow({ props, onClose }) {
			if (state.taskSplit && !state.taskSplit.isDestroyed()) {
				state.taskSplit.focus();
				state.taskSplit.webContents.send("data-from-parent", props);
				return state.taskSplit;
			}
			state.taskSplit = createTaskSplitWindow({
				props,
				onClose: () => {
					state.taskSplit = null;
					onClose?.();
				},
			});
			return state.taskSplit;
		},

		closeTaskSplitWindow() {
			if (state.taskSplit && !state.taskSplit.isDestroyed()) {
				state.taskSplit.close();
			}
		},

		getTaskSplitWindow() {
			return state.taskSplit;
		},

		openKenbanWindow() {
			if (state.kenban && !state.kenban.isDestroyed()) {
				state.kenban.focus();
				return state.kenban;
			}
			state.kenban = createKenbanWindow({
				onClose: () => {
					state.kenban = null;
				},
			});
			return state.kenban;
		},

		getKenbanWindow() {
			return state.kenban;
		},

		openCommandWindow({ key, url }) {
			const existing = state.commandWindows.get(key);
			if (existing && !existing.isDestroyed()) {
				existing.focus();
				return existing;
			}
			const win = createKeyWindow({
				url,
				onClose: () => {
					state.commandWindows.delete(key);
				},
			});
			state.commandWindows.set(key, win);
			return win;
		},

		closeCommandWindow(key) {
			const win = state.commandWindows.get(key);
			if (win && !win.isDestroyed()) {
				win.close();
			}
		},

		getAllCommandWindows() {
			return Array.from(state.commandWindows.values()).filter(win => win && !win.isDestroyed());
		},

		openListWindow({ target, props, onClose }) {
			const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
			const existing = state.listWindows.get(key);
			if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }
			const win = createListWindow({
				props: { target, ...props },
				onClose: () => { state.listWindows.delete(key); onClose?.(); },
			});
			state.listWindows.set(key, win);
			return win;
		},

		getListWindow(target) {
			const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
			const win = state.listWindows.get(key);
			if (win && !win.isDestroyed()) return win;
			state.listWindows.delete(key);
			return null;
		},

		closeListWindow(target) {
			const key = target.kind === "standalone_home" ? "standalone_home" : `${target.kind}:${target.id}`;
			const win = state.listWindows.get(key);
			if (win && !win.isDestroyed()) win.close();
		},

		closeAllListWindows() {
			for (const [, win] of state.listWindows) {
				if (win && !win.isDestroyed()) win.close();
			}
		},

		getAllListWindows() {
			return Array.from(state.listWindows.values()).filter(w => w && !w.isDestroyed());
		},

		openTemplateWindow(options = {}) {
			if (state.template && !state.template.isDestroyed()) {
				state.template.focus();
				return state.template;
			}
			state.template = createTemplateWindow({
				...options,
				onClose: () => {
					state.template = null;
					options?.onClose?.();
				},
			});
			return state.template;
		},

		getTemplateWindow() {
			return state.template;
		},

		closeTemplateWindow() {
			if (state.template && !state.template.isDestroyed()) {
				state.template.close();
			}
		},

		openVariablePromptWindow(options = {}) {
			if (state.variablePrompt && !state.variablePrompt.isDestroyed()) {
				state.variablePrompt.focus();
				state.variablePrompt.webContents.send("variable-prompt-data", {
					template: options?.template,
					mode: options?.mode ?? "create_task",
				});
				return state.variablePrompt;
			}
			state.variablePrompt = createVariablePromptWindow({
				...options,
				onClose: () => {
					state.variablePrompt = null;
					options?.onClose?.();
				},
			});
			return state.variablePrompt;
		},

		getVariablePromptWindow() {
			return state.variablePrompt;
		},

		closeVariablePromptWindow() {
			if (state.variablePrompt && !state.variablePrompt.isDestroyed()) {
				state.variablePrompt.close();
			}
		},

		openFinanceWindow(options = {}) {
			if (state.finance && !state.finance.isDestroyed()) {
				state.finance.focus();
				return state.finance;
			}
			state.finance = createFinanceWindow({
				...options,
				onClose: () => {
					state.finance = null;
					options?.onClose?.();
				},
			});
			return state.finance;
		},

		getFinanceWindow() {
			return state.finance;
		},

		closeFinanceWindow() {
			if (state.finance && !state.finance.isDestroyed()) {
				state.finance.close();
			}
		},

		openRecipesWindow(options = {}) {
			if (state.recipes && !state.recipes.isDestroyed()) {
				state.recipes.focus();
				return state.recipes;
			}
			state.recipes = createRecipesWindow({
				...options,
				onClose: () => {
					state.recipes = null;
					options?.onClose?.();
				},
			});
			return state.recipes;
		},

		getRecipesWindow() {
			return state.recipes;
		},

		closeRecipesWindow() {
			if (state.recipes && !state.recipes.isDestroyed()) {
				state.recipes.close();
			}
		},
	};
}
