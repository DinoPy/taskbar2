export function createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow,
	notificationsController,
	schedulesController,
	calendarController,
	listsController,
	financeController,
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
		let payload = data;
		if (typeof payload === "string") {
			try {
				payload = JSON.parse(payload);
			} catch {
				return;
			}
		}
		if (!payload || typeof payload !== "object") return;

		if (Array.isArray(payload.categories)) {
			appState.categories = payload.categories;
			appState.selectedCategories = [];
		} else if (typeof payload.categories === "string" && payload.categories.length > 0) {
			appState.categories = payload.categories.split(",");
			appState.selectedCategories = []; // Show all categories by default
		}

		let tags = payload.tags;
		if (typeof tags === "string") {
			try {
				tags = JSON.parse(tags);
			} catch {
				tags = [];
			}
		}
		if (Array.isArray(tags)) {
			appState.tags = tags;
		}

		let notifications = payload.notifications;
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
			unseenCount: payload.notifications_unseen_count ?? payload.notificationsUnseenCount,
		});

		// Handle schedules
		let schedules = payload.schedules ?? payload.schedule_list ?? [];
		if (typeof schedules === "string") {
			try {
				schedules = JSON.parse(schedules);
			} catch {
				schedules = [];
			}
		}
		if (!Array.isArray(schedules)) schedules = [];
		schedulesController?.bootstrap?.(schedules);
		calendarController?.handleConnectedPayload?.(payload);

		const win = getTaskbarWindow();
		if (win && win.webContents) {
			setTimeout(() => {
				win.webContents.send("refresh_tasks", payload.tasks);
			}, 1000);
			setTimeout(handleSocketConnect, 1000);
		}

		let keyCommands = payload.key_commands;
		if (typeof keyCommands === "string") {
			try {
				keyCommands = JSON.parse(keyCommands);
			} catch {
				keyCommands = [];
			}
		}
		if (!Array.isArray(keyCommands)) {
			keyCommands = [];
		}
		commandsController.replaceCommands(keyCommands);
		syncCustomCommandsWindow();

		listsController?.refetchAllActive?.();

		// Notify finance window to re-fetch visible data
		financeController?.forwardToFinanceWindow?.("fin_reconnected", {});

		// Refetch templates if the template window is open
		const templateWin = windowManager.getTemplateWindow?.();
		if (templateWin && !templateWin.isDestroyed()) {
			templateWin.webContents.send("socket-reconnected");
		}
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
		user_settings: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleUserSettingsUpdated?.(payload);
		},
		user_settings_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleUserSettingsUpdated?.(payload);
		},
		user_settings_update: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleUserSettingsUpdated?.(payload);
		},
		connection_error: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try {
					payload = JSON.parse(payload);
				} catch {
					payload = { message: payload };
				}
			}
			const normalized = payload && typeof payload === "object" ? payload : {};
			calendarController?.handleConnectionError?.(normalized);
			financeController?.forwardToFinanceWindow?.("connection_error", normalized);
			// Forward list-related errors to listsController.
			// Includes list-specific types and generic types that list handlers may emit.
			const listErrorTypes = new Set([
				"invalid_list_target",
				"invalid_list_item_type",
				"list_run_locked",
				"list_owner_locked",
				"task_blocked_by_list",
				"invalid_data",
				"not_found",
				"unauthorized",
				"database_error",
			]);
			if (normalized.type && listErrorTypes.has(normalized.type)) {
				listsController?.handleListError?.(normalized);
			}
			broadcast("socket-connection-error", normalized);
		},
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
		reminder_submit_response: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (payload?.success && payload?.schedule) {
				schedulesController?.handleScheduleUpserted?.(payload.schedule);
				notificationsController?.showWindow?.("manual");
				// Send snapshot with flag to switch to schedules tab
				const win = windowManager.getNotificationsWindow();
				if (win && !win.isDestroyed()) {
					const snapshot = notificationsController?.getSnapshot?.();
					win.webContents.send("notifications-data", {
						...snapshot,
						switchToSchedulesTab: true,
					});
				}
			}
		},
		occurrences_list: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrencesList?.(payload);
		},
		occurrence_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrenceUpdated?.(payload);
		},
		occurrence_deleted: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrenceDeleted?.(payload);
		},
		occurrence_canceled: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrenceCanceled?.(payload);
		},
		occurrence_cancelled: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrenceCanceled?.(payload);
		},
		occurrence_series_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			if (!payload) return;
			calendarController?.handleOccurrenceSeriesUpdated?.(payload);
		},
		schedule_list: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			let schedules = payload?.schedules ?? payload;
			if (typeof schedules === "string") {
				try {
					schedules = JSON.parse(schedules);
				} catch {
					schedules = [];
				}
			}
			if (!Array.isArray(schedules)) return;
			schedulesController?.bootstrap?.(schedules);
			calendarController?.handleSchedulesChanged?.();
			notificationsController?.sendSnapshotToNotificationsWindow?.();
		},
		schedules_list: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			let schedules = payload?.schedules ?? payload;
			if (typeof schedules === "string") {
				try {
					schedules = JSON.parse(schedules);
				} catch {
					schedules = [];
				}
			}
			if (!Array.isArray(schedules)) return;
			schedulesController?.bootstrap?.(schedules);
			calendarController?.handleSchedulesChanged?.();
			notificationsController?.sendSnapshotToNotificationsWindow?.();
		},
		schedule_created: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			const schedule = payload?.schedule ?? payload;
			const scheduleId = schedule?.id ?? schedule?.schedule_id ?? schedule?.uuid;
			if (scheduleId) {
				schedulesController?.handleScheduleUpserted?.(schedule);
				calendarController?.handleSchedulesChanged?.();
				calendarController?.requestVisibleRangeRefetch?.({ includeSchedules: true });
				notificationsController?.sendSnapshotToNotificationsWindow?.();
			}
		},
		schedule_updated: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					return;
				}
			}
			const schedule = payload?.schedule ?? payload;
			const scheduleId = schedule?.id ?? schedule?.schedule_id ?? schedule?.uuid;
			if (scheduleId) {
				schedulesController?.handleScheduleUpserted?.(schedule);
				calendarController?.handleSchedulesChanged?.();
				calendarController?.requestVisibleRangeRefetch?.({ includeSchedules: true });
				notificationsController?.sendSnapshotToNotificationsWindow?.();
			}
		},
		// ---- List events ----
		lists_target: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleListsTarget?.(payload);
		},
		list_created: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_updated: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_deleted: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		lists_reordered: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_created: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_updated: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_item_deleted: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_items_reordered: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleTemplateMutation?.(payload);
		},
		list_run_item_updated: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleRunItemUpdated?.(payload);
		},
		list_run_updated: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleRunUpdated?.(payload);
		},
		standalone_list_attached: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			listsController?.handleStandaloneListAttached?.(payload);
		},
		// ---- Template events ----
		template_created: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			const win = windowManager.getTemplateWindow?.();
			if (win && !win.isDestroyed()) {
				win.webContents.send("template-created", payload);
			}
		},
		template_updated: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			const win = windowManager.getTemplateWindow?.();
			if (win && !win.isDestroyed()) {
				win.webContents.send("template-updated", payload);
			}
		},
		template_deleted: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			if (!payload) return;
			const win = windowManager.getTemplateWindow?.();
			if (win && !win.isDestroyed()) {
				win.webContents.send("template-deleted", payload);
			}
			const templateId = payload?.id;
			if (templateId) {
				windowManager.closeListWindow?.({ kind: "task_template", id: templateId });
			}
		},
		template_list: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			const win = windowManager.getTemplateWindow?.();
			if (win && !win.isDestroyed()) {
				win.webContents.send("template-list", payload);
			}
		},
		template_search: ({ data }) => {
			let payload = data;
			if (typeof payload === "string") {
				try { payload = JSON.parse(payload); } catch { return; }
			}
			const win = windowManager.getTemplateWindow?.();
			if (win && !win.isDestroyed()) {
				win.webContents.send("template-search", payload);
			}
		},
		...(financeController?.getSocketEventHandlers?.() ?? {}),
		schedule_deleted: ({ data }) => {
			let payload = data;
			if (typeof data === "string") {
				try {
					payload = JSON.parse(data);
				} catch {
					payload = data;
				}
			}
			const scheduleId = payload?.schedule_id ?? payload?.id ?? payload;
			if (scheduleId) {
				schedulesController?.handleScheduleDeleted?.(scheduleId);
				calendarController?.handleSchedulesChanged?.();
				calendarController?.requestVisibleRangeRefetch?.({ includeSchedules: true });
				notificationsController?.sendSnapshotToNotificationsWindow?.();
			}
		},
	};

	return {
		handleSocketConnect,
		handleSocketDisconnect,
		eventHandlers,
	};
}
