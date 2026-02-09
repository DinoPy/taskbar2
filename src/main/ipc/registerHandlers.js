export function registerIpcHandlers({
    ipc,
    appState,
    windowManager,
    commandsController,
    tasksController,
    sendEvent,
    createEditWindow,
    createTaskSplitWindow,
    syncCustomCommandsWindow,
    forwardToRenderer,
    scheduleCompletedTasksRefresh,
    openEditWindowForTask,
    handleTaskComplete,
    handleTaskCreate,
    handleTaskToggle,
    handleSwitchScreen,
    toggleAlwaysOnTop,
    notificationsController,
    schedulesController,
    calendarController,
    log,
    requestTaskDeletion,
    requestTaskCompletionConfirmation,
    openCalendarWindow,
}) {
    const logger = log ?? console.log;

    ipc.on("edit-submission-event-from-edit-popup", (e, { categories, ...data }) => {
        forwardToRenderer("msg-redirected-to-parent", data);
        if (JSON.stringify(categories) !== JSON.stringify(appState.categories)) {
            sendEvent("user_updated_categories", categories);
        }
        appState.categories = categories;
        windowManager.closeEditWindow();
        appState.openTaskProps = null;
        if (appState.fromCompleted && windowManager.getCompletedTasksWindow()) {
            scheduleCompletedTasksRefresh();
            appState.fromCompleted = false;
        }
    });

    ipc.on("completed_task_date_updated", (e, data) => {
        appState.fromCompletedData = data;
        sendEvent("get_completed_tasks", data);
    });

    ipc.on("new_command_added", (_, data) => {
        if (!commandsController.addCommand(data)) return;
        const snapshot = commandsController.getCommandsSnapshot();
        sendEvent("new_command_added", JSON.stringify(snapshot));
        syncCustomCommandsWindow();
    });

    ipc.on("command_removed", (_, data) => {
        commandsController.removeCommand(data.key);
        const snapshot = commandsController.getCommandsSnapshot();
        sendEvent("command_removed", JSON.stringify(snapshot));
        syncCustomCommandsWindow();
    });

    ipc.on("task_complete", (_, data) => {
        handleTaskComplete(data);
    });

    ipc.on("task_create", (_, data) => {
        handleTaskCreate(data);
    });

    ipc.on("task_toggle", (_, data) => {
        handleTaskToggle(data);
    });

    ipc.on("task_edit", (_, data) => {
        sendEvent("task_edit", data);
        appState.fromCompleted = false;
    });

    ipc.on("task_delete", (_, data) => {
        sendEvent("task_delete", data);
    });

    ipc.on("toggle_current_task_edit", (_, data) => {
        windowManager.closeEditWindow();
        openEditWindowForTask(data);
    });

    ipc.on("toggle_given_task_edit", (_, data) => {
        appState.fromCompleted = true;
        windowManager.closeEditWindow();
        openEditWindowForTask(data);
    });

    ipc.on("duplicate-task", (_, data) => {
        tasksController.duplicateTask({ id: data.id });
    });

    ipc.on("request-task-delete", (_, data) => {
        const tasks = Array.isArray(data?.tasks) ? data.tasks : [data];
        requestTaskDeletion?.(tasks.filter(Boolean));
    });


    ipc.on("request-task-completion", (_, payload) => {
        if (!payload) return;
        const candidateTasks = Array.isArray(payload?.tasks)
            ? payload.tasks
            : payload?.task
                ? [payload.task]
                : [payload];
        candidateTasks
            .filter((task) => task && task.id)
            .forEach((task) => {
                if (appState.confirmCompletionBeforeComplete && requestTaskCompletionConfirmation) {
                    requestTaskCompletionConfirmation(task);
                } else {
                    tasksController.completeTask(task);
                }
            });
    });

    ipc.on("delete-confirmation-confirmed", (_, data) => {
        const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
        const ids = tasks
            .map((task) => task?.id)
            .filter((id, index, array) => id && array.indexOf(id) === index);

        ids.forEach((id) => {
            if (appState.openTaskProps?.id === id) {
                windowManager.closeEditWindow();
                appState.openTaskProps = null;
            }
            tasksController.deleteTask({ id });
        });

        windowManager.closeDeleteConfirmWindow();
    });

    ipc.on("delete-confirmation-cancelled", () => {
        windowManager.closeDeleteConfirmWindow();
    });

    ipc.on("complete-task", (_, data) => {
        tasksController.completeTask({ id: data.id });
    });

    ipc.on("delete-task", (_, data) => {
        tasksController.deleteTask({ id: data.id });
    });

    ipc.on("open-add-due-window", (_, taskData) => {
        windowManager.openAddDueWindow({ task: taskData });
    });

    ipc.on("add-due-submit", (_, data) => {
        if (data?.id) {
            forwardToRenderer("msg-redirected-to-parent", data);
        }
        windowManager.closeAddDueWindow();
    });

    ipc.on("add-due-close", () => {
        windowManager.closeAddDueWindow();
    });

    ipc.on("open-task-split", (_, data) => {
        createTaskSplitWindow(data.taskData);
    });

    ipc.on("open-calendar-window", () => {
        openCalendarWindow?.();
    });

    ipc.on("toggle-show-all-tasks", () => {
        appState.showAllTasks = !appState.showAllTasks;
        forwardToRenderer("toggle-show-all-tasks", { showAllTasks: appState.showAllTasks });
    });

    ipc.on("notifications-toggle", () => {
        notificationsController?.toggleWindow();
    });

    ipc.on("notifications-window-ready", () => {
        notificationsController?.sendSnapshotToNotificationsWindow();
    });

    ipc.on("notifications-window-resize", (_, data) => {
        notificationsController?.setWindowHeight?.({
            height: data?.height ?? 0,
            visible: Boolean(data?.visible),
        });
    });

    ipc.on("notifications-acknowledge", (_, data) => {
        if (!data?.id) return;
        notificationsController?.acknowledgeNotification?.(String(data.id));
    });

    ipc.on("notifications-acknowledge-all", () => {
        notificationsController?.acknowledgeAll?.();
    });

    ipc.on("notifications-history-visibility", (_, data) => {
        notificationsController?.setHistoryVisibility?.(Boolean(data?.show));
    });

    ipc.on("notifications-load-more", () => {
        notificationsController?.loadMoreHistory?.();
    });

    ipc.on("notifications-snoozed-visibility", (_, data) => {
        notificationsController?.setSnoozedVisibility?.(Boolean(data?.show));
    });

    ipc.on("notifications-archived-visibility", (_, data) => {
        notificationsController?.setArchivedVisibility?.(Boolean(data?.show));
    });

    ipc.on("notifications-load-more-snoozed", () => {
        notificationsController?.loadMoreSnoozed?.();
    });

    ipc.on("notifications-load-more-archived", () => {
        notificationsController?.loadMoreArchived?.();
    });

    ipc.on("notifications-archive", (_, data) => {
        if (!data?.id) return;
        notificationsController?.archiveNotification?.(String(data.id));
    });

    ipc.on("open-reminder-window", () => {
        const win = windowManager.openReminderWindow({
            screenIndex: appState.currentlySelectedScreenIndex ?? 0,
        });
        // Send categories once window is loaded
        win.webContents.once("did-finish-load", () => {
            win.webContents.send("reminder-categories", appState.categories);
        });
    });

    ipc.on("reminder-close-window", () => {
        windowManager.closeReminderWindow();
    });

    ipc.on("reminder-submit", (_, data) => {
        if (!data) return;
        sendEvent?.("reminder_submit", data);
        windowManager.closeReminderWindow();
    });

    ipc.on("notifications-snooze", (_, data = {}) => {
        if (!data?.id) return;
        const payload = {
            id: String(data.id),
        };

        if (data.minutes !== undefined) {
            const minutes = Number(data.minutes);
            if (!Number.isNaN(minutes)) {
                payload.minutes = minutes;
            }
        }

        if (data.until) {
            payload.until = data.until;
        }

        notificationsController?.snoozeNotification?.(payload);
    });

    ipc.on("schedule-delete", (_, data) => {
        if (!data?.id) return;
        schedulesController?.deleteSchedule?.(data.id);
    });

    ipc.on("calendar-fetch-occurrences", (_, data) => {
        const start = data?.start;
        const end = data?.end;
        if (!start || !end) return;
        calendarController?.requestOccurrences?.({ start, end });
    });

    ipc.on("switch-screen", (_, data) => {
        handleSwitchScreen(data);
    });

    ipc.on("close-children-window", () => {
        windowManager.closeEditWindow();
        windowManager.closeTaskSplitWindow();
        appState.openTaskProps = null;
    });

    ipc.on("task-split-submission", (_, data) => {
        logger(`Task ${data.task_id} is being split`);
        sendEvent("task_split", data);
        windowManager.closeTaskSplitWindow();
        if (tasksController.refreshCompletedTasksIfOpen()) {
            logger("triggering refresh for tasks after split");
        }
    });

    ipc.on("toggle-always-on-top", () => {
        toggleAlwaysOnTop();
    });

    ipc.on("close-completed-list-window", () => {
        windowManager.closeCompletedTasksWindow();
    });

    ipc.on("duplicate_completed_task", (_, data) => {
        sendEvent("task_duplicate", { task_id: data.id });
        if (tasksController.refreshCompletedTasksIfOpen()) {
            logger("triggering refresh for tasks after duplicate");
        }
    });

    ipc.on("split_completed_task", (_, data) => {
        windowManager.closeTaskSplitWindow();
        createTaskSplitWindow({
            id: data.id,
            title: data.title,
            description: data.description,
            category: data.category,
            tags: data.tags,
            duration: data.duration,
        });
    });

    ipc.on("delete_completed_task", (_, data) => {
        sendEvent("task_delete", { id: data.id });
        if (tasksController.refreshCompletedTasksIfOpen()) {
            logger("triggering refresh for tasks after delete");
        }
    });
}
