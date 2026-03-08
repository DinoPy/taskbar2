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
    listsController,
    getUserId,
    log,
    requestTaskDeletion,
    requestTaskCompletionConfirmation,
    openCalendarWindow,
    financeController,
    recipesController,
}) {
    const logger = log ?? console.log;
    const RFC3339_TIMESTAMP_REGEX =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

    const isValidRfc3339Timestamp = (value) => {
        if (typeof value !== "string") return false;
        const trimmed = value.trim();
        if (!RFC3339_TIMESTAMP_REGEX.test(trimmed)) return false;
        return !Number.isNaN(Date.parse(trimmed));
    };

    const normalizeApplyScope = (value) => {
        const scope = String(value ?? "")
            .toLowerCase()
            .trim();
        if (scope === "following" || scope === "all") return scope;
        return "single";
    };

    const normalizeScheduleDeleteMode = (value) => {
        const normalized = String(value ?? "")
            .toLowerCase()
            .trim();
        if (
            normalized === "schedule_and_future_occurrences" ||
            normalized === "schedule_and_future_occurrences_after_date"
        ) {
            return normalized;
        }
        return "schedule_only";
    };

    const normalizeRruleInput = (value) => {
        if (value === null || value === undefined) return null;
        let text = String(value).trim();
        if (!text) return null;
        text = text.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n").trim();
        if (!text) return null;
        if (/DTSTART:/i.test(text) && /RRULE:/i.test(text) && !/\n/.test(text)) {
            text = text.replace(/(DTSTART:[\s\S]*?)(RRULE:)/i, "$1\n$2");
        }

        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0) return null;
        const rruleLine =
            lines.find((line) => /^RRULE:/i.test(line)) ??
            lines.find((line) => /^FREQ=/i.test(line)) ??
            null;
        if (!rruleLine) return null;
        let rule = rruleLine.replace(/^RRULE:\s*/i, "").trim();
        if (!rule) return null;
        if (!/^FREQ=/i.test(rule)) return null;
        rule = rule.replace(/\s+/g, "");
        return rule;
    };

    const parseOffsetArray = (value) => {
        if (Array.isArray(value)) {
            return value
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item >= 0)
                .map((item) => Math.round(item));
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return [];
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((item) => Number(item))
                        .filter((item) => Number.isFinite(item) && item >= 0)
                        .map((item) => Math.round(item));
                }
            } catch {
                // Fall through to comma-separated parsing.
            }
            return trimmed
                .split(",")
                .map((token) => Number(token.trim()))
                .filter((item) => Number.isFinite(item) && item >= 0)
                .map((item) => Math.round(item));
        }
        return [];
    };

    const normalizeIncludeCustomized = (value) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            const normalized = value.toLowerCase().trim();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
        }
        return false;
    };
    const OCCURRENCE_SERIES_EDIT_FIELDS = new Set([
        "title",
        "tz",
        "occurs_at",
        "rrule",
        "until_local",
        "show_before_minutes",
        "notify_offsets_min",
        "muted_offsets_min",
        "category",
        "common_language",
        "urgency",
        "is_all_day",
        "all_day_span_days",
        "duration_minutes",
    ]);

    const resolveOccurrenceMutationTarget = (data = {}) => {
        const occurrenceIdRaw =
            data?.occurrence_id ?? data?.occurrenceId ?? data?.id ?? data?.ID;
        const occurrenceId =
            typeof occurrenceIdRaw === "string"
                ? occurrenceIdRaw.trim()
                : occurrenceIdRaw
                    ? String(occurrenceIdRaw).trim()
                    : "";
        if (occurrenceId) {
            return {
                target: {
                    occurrence_id: occurrenceId,
                },
                error: null,
            };
        }
        const scheduleIdRaw =
            data?.schedule_id ??
            data?.scheduleId ??
            data?.ScheduleID ??
            data?.schedule?.id ??
            data?.schedule?.schedule_id ??
            data?.schedule?.ScheduleID;
        const scheduleId =
            typeof scheduleIdRaw === "string"
                ? scheduleIdRaw.trim()
                : scheduleIdRaw
                    ? String(scheduleIdRaw).trim()
                    : "";
        const anchorOccursAt =
            data?.anchor_occurs_at ??
            data?.anchorOccursAt ??
            data?.anchor ??
            data?.occurs_at ??
            data?.occursAt ??
            data?.start;

        if (!scheduleId || !anchorOccursAt) {
            return {
                target: null,
                error:
                    "missing target (expected occurrence_id or schedule_id + anchor_occurs_at)",
            };
        }

        const anchorText =
            anchorOccursAt instanceof Date
                ? anchorOccursAt.toISOString()
                : String(anchorOccursAt).trim();
        if (!isValidRfc3339Timestamp(anchorText)) {
            return {
                target: null,
                error: "anchor_occurs_at must be RFC3339",
            };
        }

        return {
            target: {
                schedule_id: scheduleId,
                anchor_occurs_at: anchorText,
            },
            error: null,
        };
    };

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

    ipc.on("request_hard_refresh", () => {
        sendEvent("request_hard_refresh", "");
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
        const payload = schedulesController?.buildReminderSubmitPayload?.(data) ?? data;
        sendEvent?.("reminder_submit", payload);
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

        if (typeof data.urgency === "string") {
            payload.urgency = data.urgency;
        }

        notificationsController?.snoozeNotification?.(payload);
    });

    const handleScheduleCreate = (data) => {
        if (!data) return;
        const created = schedulesController?.createSchedule?.(data);
        if (!created) {
            logger?.("[schedules] schedule-create rejected: missing required payload fields");
        }
    };

    const handleScheduleEdit = (data) => {
        if (!data) return;
        const edited = schedulesController?.editSchedule?.(data);
        if (!edited) {
            logger?.("[schedules] schedule-edit rejected: missing required payload fields");
        }
    };

    const handleScheduleDelete = (data = {}) => {
        const source =
            data && typeof data === "object"
                ? data
                : {
                    id: data,
                };
        const id =
            source?.id ??
            source?.schedule_id ??
            source?.scheduleId ??
            source?.ID ??
            source?.ScheduleID;
        if (!id) {
            logger?.("[schedules] schedule-delete rejected: missing id");
            return;
        }

        const payload = {
            id: String(id),
            delete_mode: normalizeScheduleDeleteMode(
                source?.delete_mode ?? source?.deleteMode ?? source?.DeleteMode,
            ),
        };
        if (payload.delete_mode === "schedule_and_future_occurrences_after_date") {
            const futureFrom = String(
                source?.future_from ?? source?.futureFrom ?? source?.FutureFrom ?? "",
            ).trim();
            if (!isValidRfc3339Timestamp(futureFrom)) {
                logger?.(
                    "[schedules] schedule-delete rejected: future_from must be RFC3339 when delete_mode=schedule_and_future_occurrences_after_date",
                );
                return;
            }
            payload.future_from = futureFrom;
        }

        const deleted = schedulesController?.deleteSchedule?.(payload);
        if (!deleted) {
            logger?.("[schedules] schedule-delete rejected: invalid payload");
        }
    };

    const handleOccurrenceEdit = (data = {}) => {
        const { target, error } = resolveOccurrenceMutationTarget(data);
        if (!target) {
            logger?.(`[calendar] occurrence-edit rejected: ${error}`);
            return;
        }
        const applyScope = normalizeApplyScope(
            data?.apply_scope ?? data?.applyScope ?? data?.apply_mode,
        );

        const changes = data?.changes && typeof data.changes === "object" && !Array.isArray(data.changes)
            ? { ...data.changes }
            : {};
        if (changes.occurs_at === undefined && changes.occursAt !== undefined) {
            changes.occurs_at = changes.occursAt;
        }
        if (changes.until_local === undefined && changes.untilLocal !== undefined) {
            changes.until_local = changes.untilLocal;
        }
        if (changes.notify_offsets_min === undefined && changes.notifyOffsetsMin !== undefined) {
            changes.notify_offsets_min = changes.notifyOffsetsMin;
        }
        if (changes.muted_offsets_min === undefined && changes.mutedOffsetsMin !== undefined) {
            changes.muted_offsets_min = changes.mutedOffsetsMin;
        }
        if (changes.duration_minutes === undefined && changes.durationMinutes !== undefined) {
            changes.duration_minutes = changes.durationMinutes;
        }
        if (changes.all_day_span_days === undefined && changes.allDaySpanDays !== undefined) {
            changes.all_day_span_days = changes.allDaySpanDays;
        }

        if (applyScope !== "single") {
            Object.keys(changes).forEach((key) => {
                if (!OCCURRENCE_SERIES_EDIT_FIELDS.has(key)) {
                    delete changes[key];
                }
            });
        }

        if (changes.occurs_at !== undefined) {
            const occursAt = String(changes.occurs_at ?? "").trim();
            if (!isValidRfc3339Timestamp(occursAt)) {
                logger?.("[calendar] occurrence-edit rejected: changes.occurs_at must be RFC3339");
                return;
            }
            changes.occurs_at = occursAt;
        }

        if (changes.until_local !== undefined) {
            if (changes.until_local === null || changes.until_local === "") {
                changes.until_local = null;
            } else {
                const untilLocal = String(changes.until_local).trim();
                if (!isValidRfc3339Timestamp(untilLocal)) {
                    logger?.(
                        "[calendar] occurrence-edit rejected: changes.until_local must be RFC3339",
                    );
                    return;
                }
                changes.until_local = untilLocal;
            }
        }

        if (changes.rrule !== undefined) {
            if (changes.rrule === null || String(changes.rrule).trim() === "") {
                changes.rrule = null;
            } else {
                const normalizedRrule = normalizeRruleInput(changes.rrule);
                if (!normalizedRrule) {
                    logger?.(
                        "[calendar] occurrence-edit rejected: changes.rrule must be a valid RRULE string",
                    );
                    return;
                }
                changes.rrule = normalizedRrule;
            }
        }

        if (changes.notify_offsets_min !== undefined) {
            changes.notify_offsets_min = parseOffsetArray(changes.notify_offsets_min);
        }
        if (changes.muted_offsets_min !== undefined) {
            changes.muted_offsets_min = parseOffsetArray(changes.muted_offsets_min);
        }
        if (changes.duration_minutes !== undefined) {
            const duration = Number(changes.duration_minutes);
            if (!Number.isFinite(duration) || duration < 0) {
                logger?.(
                    "[calendar] occurrence-edit rejected: changes.duration_minutes must be >= 0",
                );
                return;
            }
            changes.duration_minutes = Math.round(duration);
        }
        if (changes.all_day_span_days !== undefined) {
            const span = Number(changes.all_day_span_days);
            if (!Number.isFinite(span) || span < 1) {
                logger?.(
                    "[calendar] occurrence-edit rejected: changes.all_day_span_days must be >= 1",
                );
                return;
            }
            changes.all_day_span_days = Math.max(1, Math.round(span));
        }
        if (Object.keys(changes).length === 0) {
            logger?.("[calendar] occurrence-edit rejected: changes must not be empty");
            return;
        }

        const payload = {
            ...target,
            changes,
            apply_scope: applyScope,
            include_customized: normalizeIncludeCustomized(
                data?.include_customized ?? data?.includeCustomized,
            ),
        };
        if (payload.apply_scope !== "single") {
            const expectedSourceRev = Number(
                data?.expected_source_rev ?? data?.expectedSourceRev,
            );
            if (Number.isFinite(expectedSourceRev) && expectedSourceRev >= 0) {
                payload.expected_source_rev = Math.round(expectedSourceRev);
            }
        }
        if (
            payload.apply_scope !== "single" &&
            (payload?.changes?.occurs_at !== undefined || payload?.changes?.rrule !== undefined)
        ) {
            logger?.(
                `[calendar] occurrence-edit outbound (${payload.apply_scope}) changes=${JSON.stringify(
                    payload.changes,
                )}`,
            );
        }
        sendEvent?.("occurrence_edit", payload);
    };

    const handleOccurrenceDelete = (data = {}) => {
        const { target, error } = resolveOccurrenceMutationTarget(data);
        if (!target) {
            logger?.(`[calendar] occurrence-delete rejected: ${error}`);
            return;
        }

        const payload = {
            ...target,
            apply_scope: normalizeApplyScope(
                data?.apply_scope ?? data?.applyScope ?? data?.apply_mode,
            ),
            include_customized: normalizeIncludeCustomized(
                data?.include_customized ?? data?.includeCustomized,
            ),
        };

        if (typeof data?.reason === "string" && data.reason.trim()) {
            payload.reason = data.reason.trim();
        }

        sendEvent?.("occurrence_delete", payload);
    };

    const handleOccurrenceCancel = (data = {}) => {
        const { target, error } = resolveOccurrenceMutationTarget(data);
        if (!target) {
            logger?.(`[calendar] occurrence-cancel rejected: ${error}`);
            return;
        }

        const payload = {
            ...target,
            apply_scope: normalizeApplyScope(
                data?.apply_scope ?? data?.applyScope ?? data?.apply_mode,
            ),
            include_customized: normalizeIncludeCustomized(
                data?.include_customized ?? data?.includeCustomized,
            ),
        };

        if (typeof data?.reason === "string" && data.reason.trim()) {
            payload.reason = data.reason.trim();
        }

        sendEvent?.("occurrence_cancel", payload);
    };

    ipc.on("schedule-create", (_, data) => {
        handleScheduleCreate(data);
    });

    ipc.on("schedule-edit", (_, data) => {
        handleScheduleEdit(data);
    });

    // Backwards-compatible IPC aliases in case a renderer sends underscore names.
    ipc.on("schedule_create", (_, data) => {
        handleScheduleCreate(data);
    });

    ipc.on("schedule_edit", (_, data) => {
        handleScheduleEdit(data);
    });

    ipc.on("schedule-delete", (_, data) => {
        handleScheduleDelete(data);
    });

    ipc.on("schedule_delete", (_, data) => {
        handleScheduleDelete(data);
    });

    ipc.on("schedule-list", () => {
        calendarController?.requestSchedulesList?.();
    });

    ipc.on("schedule_list", () => {
        calendarController?.requestSchedulesList?.();
    });

    ipc.on("user-settings-get", () => {
        calendarController?.requestUserSettings?.();
    });

    ipc.on("user_settings_get", () => {
        calendarController?.requestUserSettings?.();
    });

    ipc.on("user-settings-update", (_, data) => {
        calendarController?.updateUserSettings?.(data);
    });

    ipc.on("user_settings_update", (_, data) => {
        calendarController?.updateUserSettings?.(data);
    });

    ipc.on("calendar-fetch-occurrences", (_, data) => {
        const start = data?.start;
        const end = data?.end;
        if (!start || !end) return;
        calendarController?.requestOccurrences?.({ start, end });
    });

    ipc.on("occurrence-edit", (_, data) => {
        handleOccurrenceEdit(data);
    });

    ipc.on("occurrence_edit", (_, data) => {
        handleOccurrenceEdit(data);
    });

    ipc.on("occurrence-delete", (_, data) => {
        handleOccurrenceDelete(data);
    });

    ipc.on("occurrence_delete", (_, data) => {
        handleOccurrenceDelete(data);
    });

    ipc.on("occurrence-cancel", (_, data) => {
        handleOccurrenceCancel(data);
    });

    ipc.on("occurrence_cancel", (_, data) => {
        handleOccurrenceCancel(data);
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

    // ---- Lists IPC handlers ----

    ipc.on("fetch-all-task-list-status", (_, taskIds) => {
        if (!Array.isArray(taskIds)) return;
        for (const taskId of taskIds) {
            if (!taskId) continue;
            sendEvent?.("lists_fetch", { target: { kind: "task", id: taskId } });
        }
    });

    ipc.on("lists-fetch", (event, data) => {
        const target = data?.target;
        if (!target?.kind) return;
        if (target.kind !== "standalone_home" && !target.id) return;
        const sender = event.sender;
        const windowRef = {
            _id: sender.id,
            _pushFn: (channel, payload) => {
                if (!sender.isDestroyed()) {
                    sender.send(channel, payload);
                }
            },
        };
        const search_text = data?.search_text;
        const status_filter = data?.status_filter;
        listsController?.fetchForTarget?.(target, windowRef, { search_text, status_filter });
    });

    ipc.on("lists-unsubscribe", (event) => {
        const sender = event.sender;
        const windowRef = {
            _id: sender.id,
            _pushFn: (channel, payload) => {
                if (!sender.isDestroyed()) {
                    sender.send(channel, payload);
                }
            },
        };
        listsController?.unsubscribe?.(windowRef);
    });

    ipc.on("lists-mutation", (_, data) => {
        if (!data?.event) return;
        listsController?.sendMutation?.(data.event, data.data ?? {});
    });

    ipc.on("open-list-window", (_, data) => {
        const target = data?.target;
        const props = { ...(data?.props ?? {}), currentUserId: getUserId?.() ?? null };
        windowManager.openListWindow?.({ target, props });
    });

    ipc.handle("get-attach-targets", async () => {
        const targets = [];

        // Get tasks from renderer
        const taskbarWin = windowManager.getTaskbarWindow();
        if (taskbarWin && !taskbarWin.isDestroyed()) {
            try {
                const taskData = await taskbarWin.webContents.executeJavaScript(
                    `(function() {
                        const t = window.__tasks || (typeof tasks !== 'undefined' ? tasks : {});
                        return Object.values(t).map(task => ({ id: task.id, title: task.title })).filter(t => t.id && t.title);
                    })()`
                );
                for (const t of taskData) {
                    targets.push({ kind: "task", id: t.id, label: t.title });
                }
            } catch (err) {
                logger("get-attach-targets: failed to get tasks from renderer:", err);
            }
        }

        // Get schedules from controller
        const schedules = schedulesController?.getAllSchedules?.() ?? [];
        for (const s of schedules) {
            if (s?.id && s?.title) {
                targets.push({ kind: "schedule", id: s.id, label: s.title });
            }
        }

        return targets;
    });

    // ---- Template IPC handlers ----

    ipc.on("open-template-window", () => {
        const win = windowManager.openTemplateWindow?.({
            screenIndex: appState.currentlySelectedScreenIndex ?? 0,
        });
        if (win && !win.isDestroyed()) {
            const send = () => win.webContents.send("template-categories", appState.categories);
            if (win.webContents.isLoading()) {
                win.webContents.once("did-finish-load", send);
            } else {
                send();
            }
        }
    });

    ipc.on("template-create", (_, data) => {
        if (!data) return;
        sendEvent?.("template_create", data);
    });

    ipc.on("template-edit", (_, data) => {
        if (!data) return;
        sendEvent?.("template_edit", data);
    });

    ipc.on("template-delete", (_, data) => {
        if (!data?.id) return;
        sendEvent?.("template_delete", { id: data.id });
    });

    ipc.on("template-list", () => {
        sendEvent?.("template_list", {});
    });

    ipc.on("template-search", (_, data) => {
        sendEvent?.("template_search", data ?? {});
    });

    ipc.on("task-create-from-template", (_, data) => {
        if (!data?.template_use) return;
        sendEvent?.("task_create_from_template", data);
    });

    ipc.on("open-variable-prompt", (_, data) => {
        if (!data?.template) return;
        windowManager.openVariablePromptWindow?.({
            template: data.template,
            mode: data.mode ?? "create_task",
        });
    });

    ipc.on("variable-prompt-close", () => {
        windowManager.closeVariablePromptWindow?.();
    });

    ipc.on("variable-prompt-submit", (_, data) => {
        if (!data?.template_use) return;
        windowManager.closeVariablePromptWindow?.();

        if (data.mode === "schedule") {
            const win = windowManager.openReminderWindow?.({
                screenIndex: appState.currentlySelectedScreenIndex ?? 0,
            });
            if (win && !win.isDestroyed()) {
                const send = () => {
                    win.webContents.send("reminder-categories", appState.categories);
                    win.webContents.send("reminder-template-use", data.template_use);
                };
                if (win.webContents.isLoading()) {
                    win.webContents.once("did-finish-load", send);
                } else {
                    send();
                }
            }
        } else {
            sendEvent?.("task_create_from_template", {
                template_use: data.template_use,
                last_modified_at: Date.now(),
            });
        }
    });

    // ---- Finance IPC handlers ----

    ipc.on("fin-send", (_, data) => {
        if (!data?.event) return;
        financeController?.handleRendererSend?.(data.event, data.data ?? {});
    });

    ipc.on("open-finance-window", () => {
        windowManager.openFinanceWindow?.({
            screenIndex: appState.currentlySelectedScreenIndex ?? 0,
        });
    });

    // ---- Recipes IPC handlers ----

    ipc.on("recipes-send", (_, data) => {
        if (!data?.event) return;
        recipesController?.handleRendererSend?.(data.event, data.data ?? {});
    });

    ipc.on("open-recipes-window", () => {
        windowManager.openRecipesWindow?.({
            screenIndex: appState.currentlySelectedScreenIndex ?? 0,
        });
    });

    ipc.on("get-server-user-id", (event) => {
        event.returnValue = appState.serverUserId ?? null;
    });

    // ---- Recipes image HTTP handlers ----

    function getRecipesHttpBaseUrl() {
        const wsUrl = process.env.APP_STAGE === "production"
            ? "wss://pythonws.dinodev.dev"
            : "ws://localhost:8080";
        return wsUrl.replace("wss://", "https://").replace("ws://", "http://");
    }

    ipc.handle("recipes:upload-image", async (_, { recipeId, filePath, googleUid, email }) => {
        const { net } = require("electron");
        const fs = require("fs");
        const path = require("path");
        const baseUrl = getRecipesHttpBaseUrl();
        const url = `${baseUrl}/api/recipes/${recipeId}/images`;
        const boundary = "----RecipesFormBoundary" + Date.now();
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

        const prefix = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
        );
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([prefix, fileBuffer, suffix]);

        const response = await net.fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "X-Google-UID": googleUid,
                "X-Email": email,
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Upload failed (${response.status}): ${text}`);
        }
        return response.json();
    });

    ipc.handle("recipes:replace-image", async (_, { recipeId, imageId, filePath, googleUid, email }) => {
        const { net } = require("electron");
        const fs = require("fs");
        const path = require("path");
        const baseUrl = getRecipesHttpBaseUrl();
        const url = `${baseUrl}/api/recipes/${recipeId}/images/${imageId}`;
        const boundary = "----RecipesFormBoundary" + Date.now();
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

        const prefix = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
        );
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([prefix, fileBuffer, suffix]);

        const response = await net.fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "X-Google-UID": googleUid,
                "X-Email": email,
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Replace failed (${response.status}): ${text}`);
        }
        return response.json();
    });

    ipc.handle("recipes:delete-image", async (_, { recipeId, imageId, googleUid, email }) => {
        const { net } = require("electron");
        const baseUrl = getRecipesHttpBaseUrl();
        const url = `${baseUrl}/api/recipes/${recipeId}/images/${imageId}`;

        const response = await net.fetch(url, {
            method: "DELETE",
            headers: {
                "X-Google-UID": googleUid,
                "X-Email": email,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Delete failed (${response.status}): ${text}`);
        }
        return { ok: true };
    });
}
