const parseList = (value) => {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
};

export function createCalendarController({
	windowManager,
	sendEvent,
	schedulesController,
	log = console.log,
}) {
	const state = {
		lastPayload: null,
		pendingRange: null,
	};

	const getCalendarWindow = () => windowManager.getCalendarWindow && windowManager.getCalendarWindow();

	const forwardToWindow = (payload) => {
		const win = getCalendarWindow();
		if (!win || win.isDestroyed()) return;
		win.webContents.send("calendar-data", payload);
	};

	const enrichPayload = (rawPayload) => {
		if (!rawPayload) return null;
		const occurrences = parseList(rawPayload.occurrences);
		const controllerSchedules = schedulesController?.getAllSchedules?.() ?? [];
		const fallbackSchedules = parseList(rawPayload.schedules);
		const schedules =
			controllerSchedules.length > 0 ? controllerSchedules : fallbackSchedules;
		return {
			start: rawPayload.start,
			end: rawPayload.end,
			range: rawPayload.range,
			occurrences,
			schedules,
		};
	};

	const requestOccurrences = (range) => {
		if (!range?.start || !range?.end) {
			return;
		}
		state.pendingRange = range;
		log(`[CalendarController] Requesting occurrences for range: ${range.start} - ${range.end}`);
		sendEvent?.("occurrences_fetch", range);
	};

	const handleOccurrencesList = (payload) => {
		log(`[CalendarController] Received occurrences list with ${payload?.occurrences?.length || 0} items`);
		const normalized = enrichPayload(payload);
		if (!normalized) {
            log("[CalendarController] Failed to normalize payload");
            return;
        }
		state.lastPayload = normalized;
		forwardToWindow(normalized);
	};

	const handleSchedulesChanged = () => {
		if (!state.lastPayload) return;
        log("[CalendarController] Schedules changed, refreshing window");
		forwardToWindow({
			...state.lastPayload,
			schedules: schedulesController?.getAllSchedules?.() ?? state.lastPayload.schedules,
		});
	};

	return {
		requestOccurrences,
		handleOccurrencesList,
		handleSchedulesChanged,
		forwardToWindow,
	};
}
