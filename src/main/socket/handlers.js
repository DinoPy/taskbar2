export function createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow,
	notificationsController,
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

		let notifications = data.notifications;
		if (typeof notifications === "string") {
			try {
				notifications = JSON.parse(notifications);
			} catch {
				notifications = [];
			}
		}

		if (!Array.isArray(notifications)) {
			notifications = [];
		}

		notificationsController?.bootstrap?.({
			notifications,
			unseenCount: data.notifications_unseen_count ?? data.notificationsUnseenCount,
		});

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
		notification_created: ({ data }) => {
			if (!data) return;
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					payload = null;
				}
			}
			if (!payload) return;
			notificationsController?.handleNotificationsReemitted?.([payload]);
		},
		notifications_batch: ({ data }) => {
			if (!data) return;
			let notifications = data.notifications;
			if (typeof notifications === "string") {
				try {
					notifications = JSON.parse(notifications);
				} catch {
					notifications = [];
				}
			}
			if (!Array.isArray(notifications)) {
				notifications = [];
			}
			notificationsController?.handleNotificationsBatch?.({
				...data,
				notifications,
			});
		},
		notifications_marked_seen: ({ data }) => {
			let list = data?.notifications;
			if (typeof list === "string") {
				try {
					list = JSON.parse(list);
				} catch {
					list = [];
				}
			}
			if (!Array.isArray(list)) {
				list = [];
			}
			notificationsController?.handleNotificationsMarkedSeen?.(list);
		},
		notification_archived: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					payload = null;
				}
			}
			if (!payload) return;
			notificationsController?.handleNotificationArchived?.(payload);
		},
		notification_snoozed: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					payload = null;
				}
			}
			if (!payload) return;
			notificationsController?.handleNotificationSnoozed?.(payload);
		},
		notifications_reemitted: ({ data }) => {
			let list = data?.notifications;
			if (typeof list === "string") {
				try {
					list = JSON.parse(list);
				} catch {
					list = [];
				}
			}
			if (!Array.isArray(list)) {
				list = [];
			}
			notificationsController?.handleNotificationsReemitted?.(list);
		},
		notifications_unseen_count: ({ data }) => {
			const count = data?.count ?? data;
			notificationsController?.handleUnseenCountUpdate?.(count);
		},
	};

	return {
		handleSocketConnect,
		handleSocketDisconnect,
		eventHandlers,
	};
}
