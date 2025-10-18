export function createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow,
}) {
	function handleSocketConnect() {
		const win = getTaskbarWindow();
		if (win && win.webContents) {
			win.webContents.send("socket-connected");
		} else {
			setTimeout(handleSocketConnect, 1000);
		}
	}

	function handleSocketDisconnect() {
		const win = getTaskbarWindow();
		if (win && win.webContents) {
			win.webContents.send("socket-disconnected");
		} else {
			setTimeout(handleSocketDisconnect, 1000);
		}
	}

	function setUpTasks(data) {
		if (data.categories) {
			appState.categories = data.categories.split(",");
		}

		const win = getTaskbarWindow();
		if (win && win.webContents) {
			setTimeout(() => {
				win.webContents.send("refresh_tasks", data.tasks);
			}, 1000);
			setTimeout(handleSocketConnect, 1000);
		}

		const keyCommands = JSON.parse(data.key_commands);
		commandsController.replaceCommands(keyCommands);
		syncCustomCommandsWindow();
	}

	function broadcast(channel, payload) {
		forwardToRenderer(channel, payload);
	}

	function handleCompletedTasksResponse(data) {
		const win = windowManager.getCompletedTasksWindow();
		if (win) {
			win.webContents.send("completed-tasks-list", {
				tasks: data,
				categories: appState.categories,
			});
		}
	}

	const eventHandlers = {
		ping: ({ send }) => send("pong", "alive and well"),
		connected: ({ data }) => setUpTasks(data),
		related_task_edited: ({ data }) => broadcast("related_task_edited", data),
		related_task_deleted: ({ data }) => broadcast("related_task_deleted", data),
		related_task_toggled: ({ data }) => broadcast("related_task_toggled", data),
		related_added_command: ({ data }) => {
			const parsed = typeof data === "string" ? JSON.parse(data) : data;
			commandsController.syncCommands(parsed);
			syncCustomCommandsWindow();
		},
		related_removed_command: ({ data }) => {
			const parsed = typeof data === "string" ? JSON.parse(data) : data;
			commandsController.removeMissingCommands(parsed);
			syncCustomCommandsWindow();
		},
		related_updated_categories: ({ data }) => {
			appState.categories = data;
		},
		new_task_created: ({ data }) => broadcast("new_task_from_relative", data),
		tasks_refresher: ({ data }) => broadcast("refresh_tasks", data.tasks),
		get_completed_tasks: ({ data }) => handleCompletedTasksResponse(data),
		request_hard_refresh: ({ data }) => {
			appState.categories = data.categories.split(",");
			broadcast("refresh_tasks", data.tasks);
		},
	};

	return {
		handleSocketConnect,
		handleSocketDisconnect,
		eventHandlers,
	};
}
