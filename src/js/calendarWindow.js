const { ipcRenderer } = window.require("electron");
const { rrulestr } = window.require("rrule");

const state = {
	currentWeekStart: getStartOfWeek(new Date()),
	isLoading: false,
	lastResponseRange: null,
	events: [], // Store processed events
};

const gridWrapperEl = document.querySelector(".calendar-grid-wrapper");
const loadingEl = document.querySelector("[data-loading]");
const emptyStateEl = document.querySelector("[data-empty-state]");
const weekLabelEl = document.getElementById("calendarWeekLabel");
const prevButton = document.querySelector('[data-action="prev-week"]');
const nextButton = document.querySelector('[data-action="next-week"]');
const todayButton = document.querySelector('[data-action="today"]');
const pad = (value) => String(value).padStart(2, "0");

let detailOverlayEl = null;
let detailTitleEl = null;
let detailTimeEl = null;
let detailTypeEl = null;
	let detailScheduleEl = null;
	let detailDescriptionEl = null;
	let detailEditButton = null;
	let detailCloseButton = null;
let detailScheduleMetaEl = null;
let detailKindEl = null;
let detailRruleEl = null;
let detailStartEl = null;
let detailEndEl = null;
let detailLastMaterializedEl = null;
let detailCategoryEl = null;
let detailCommonLanguageEl = null;
let detailCommonLanguageRow = null;

const formatEventDate = (date) => {
	if (!date) return "Unknown time";
	return date.toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

const capitalizeWord = (value) => {
	if (!value || typeof value !== "string") return "";
	return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatDetailDate = (value) => {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

const setDetailText = (element, value) => {
	if (!element) return;
	element.textContent = value;
};

const formatDetailValue = (value) => {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	return String(value);
};

const extractNullableStringValue = (value) => {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	if (typeof value === "object" && value !== null) {
		if ("Valid" in value && value.Valid === false) {
			return null;
		}
		if (value.String) {
			return String(value.String);
		}
		if (value.Value) {
			return String(value.Value);
		}
		if (typeof value.Category === "string") {
			return value.Category;
		}
		if (typeof value.Name === "string") {
			return value.Name;
		}
	}

	if (typeof value === "string") {
		return value;
	}

	return String(value);
};

const normalizeNullableString = (value) => {
	const extracted = extractNullableStringValue(value);
	return extracted ? formatDetailValue(extracted) : "—";
};

const formatNullableDateValue = (value) => {
	if (!value) return "—";
	if (typeof value === "object") {
		if ("Valid" in value) {
			if (!value.Valid) return "—";
			return formatDetailDate(value.Time ?? value.time ?? value.value ?? value.Value);
		}
		if ("Time" in value) {
			return formatDetailDate(value.Time ?? value.time ?? value.value ?? value.Value);
		}
	}
	return formatDetailDate(value);
};

const getCommonLanguageText = (event = {}, schedule = {}) => {
	const safeEvent = event ?? {};
	const safeSchedule = schedule ?? {};
	const rawValue =
		safeEvent.common_language ??
		safeEvent.commonLanguage ??
		safeSchedule.common_language ??
		safeSchedule.CommonLanguage ??
		safeSchedule.commonLanguage ??
		null;
	return extractNullableStringValue(rawValue);
};

const initDetailOverlay = () => {
	detailOverlayEl = document.createElement("div");
	detailOverlayEl.className = "calendar-detail-overlay hidden";
	detailOverlayEl.innerHTML = `
        <div class="calendar-detail-card">
            <button type="button" class="calendar-detail-close" data-action="close-detail" aria-label="Close detail">×</button>
            <div class="calendar-detail-type" data-detail-type></div>
            <h2 data-detail-title>Title</h2>
            <p class="calendar-detail-time" data-detail-time></p>
            <p class="calendar-detail-schedule" data-detail-schedule></p>
            <div class="calendar-detail-schedule-meta hidden" data-detail-schedule-meta>
                <p><span class="calendar-detail-label">Kind:</span> <span data-detail-kind>—</span></p>
                <p><span class="calendar-detail-label">Category:</span> <span data-detail-category>—</span></p>
                <p><span class="calendar-detail-label">RRULE:</span> <span data-detail-rrule>—</span></p>
                <p><span class="calendar-detail-label">Start:</span> <span data-detail-start>—</span></p>
                <p><span class="calendar-detail-label">End:</span> <span data-detail-end>—</span></p>
                <p><span class="calendar-detail-label">Last materialized:</span> <span data-detail-last-materialized>—</span></p>
            </div>
            <p data-detail-common-language-row class="calendar-detail-common-language-row hidden">
                <span class="calendar-detail-label">Natural language:</span>
                <span data-detail-common-language>—</span>
            </p>
            <p class="calendar-detail-description" data-detail-description></p>
            <div class="calendar-detail-actions">
                <button type="button" class="calendar-detail-action" data-action="edit-detail" disabled>Edit (coming soon)</button>
                <button type="button" class="calendar-detail-action calendar-detail-action--delete" data-action="delete-detail" disabled>Delete (coming soon)</button>
            </div>
        </div>
    `;
	document.body.appendChild(detailOverlayEl);

	detailTitleEl = detailOverlayEl.querySelector("[data-detail-title]");
	detailTimeEl = detailOverlayEl.querySelector("[data-detail-time]");
	detailTypeEl = detailOverlayEl.querySelector("[data-detail-type]");
	detailScheduleEl = detailOverlayEl.querySelector("[data-detail-schedule]");
	detailScheduleMetaEl = detailOverlayEl.querySelector("[data-detail-schedule-meta]");
	detailKindEl = detailOverlayEl.querySelector("[data-detail-kind]");
	detailRruleEl = detailOverlayEl.querySelector("[data-detail-rrule]");
	detailStartEl = detailOverlayEl.querySelector("[data-detail-start]");
	detailEndEl = detailOverlayEl.querySelector("[data-detail-end]");
	detailLastMaterializedEl = detailOverlayEl.querySelector("[data-detail-last-materialized]");
	detailCategoryEl = detailOverlayEl.querySelector("[data-detail-category]");
	detailCommonLanguageEl = detailOverlayEl.querySelector("[data-detail-common-language]");
	detailCommonLanguageRow = detailOverlayEl.querySelector("[data-detail-common-language-row]");
	detailDescriptionEl = detailOverlayEl.querySelector("[data-detail-description]");
	detailEditButton = detailOverlayEl.querySelector("[data-action='edit-detail']");

	const detailCard = detailOverlayEl.querySelector(".calendar-detail-card");
	detailCard?.addEventListener("click", (event) => event.stopPropagation());

	detailOverlayEl.addEventListener("click", (event) => {
		if (
			event.target?.dataset?.action === "close-detail" ||
			event.target === detailOverlayEl
		) {
			closeDetailOverlay();
		}
	});

	detailCloseButton = detailOverlayEl.querySelector(".calendar-detail-close");
	detailCloseButton?.addEventListener("click", (event) => {
		event.stopPropagation();
		closeDetailOverlay();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeDetailOverlay();
		}
	});
};

function showEventDetail(event) {
	if (!detailOverlayEl) return;
	detailTitleEl.textContent = event.title ?? "Untitled event";
	detailTimeEl.textContent = event.start ? formatEventDate(event.start) : "Time unknown";
	detailTypeEl.textContent = `Type: ${capitalizeWord(event.type || "schedule")}`;
	const scheduleTitle = event.schedule?.title ?? event.schedule?.name ?? "—";
	detailScheduleEl.textContent = `Schedule: ${scheduleTitle}`;
	detailDescriptionEl.textContent =
		event.schedule?.description ?? event.schedule?.summary ?? "No additional details";
	const schedule = event.schedule ?? null;
	if (schedule && typeof schedule === "object") {
		detailScheduleMetaEl?.classList.remove("hidden");
		setDetailText(detailKindEl, formatDetailValue(schedule.kind ?? schedule.Kind));
		setDetailText(detailCategoryEl, normalizeNullableString(schedule.category ?? schedule.Category));
		setDetailText(detailRruleEl, normalizeNullableString(schedule.rrule ?? schedule.Rrule));

		const startValue =
			schedule.start_local ??
			schedule.startLocal ??
			schedule.StartLocal ??
			schedule.Start ??
			schedule.start ??
			schedule.start_time ??
			schedule.startTime;
		const endValue = schedule.until_local ?? schedule.untilLocal ?? schedule.UntilLocal ?? schedule.end ?? schedule.end_local;
		const lastMaterializedValue =
			schedule.last_materialized_until ??
			schedule.LastMaterializedUntil ??
			schedule.last_materializedd_until;

		setDetailText(detailStartEl, formatNullableDateValue(startValue));
		setDetailText(detailEndEl, formatNullableDateValue(endValue));
	setDetailText(detailLastMaterializedEl, formatNullableDateValue(lastMaterializedValue));
	} else {
		detailScheduleMetaEl?.classList.add("hidden");
	}
	const commonLanguageText = getCommonLanguageText(event, schedule);
	if (commonLanguageText) {
		setDetailText(detailCommonLanguageEl, commonLanguageText);
		detailCommonLanguageRow?.classList.remove("hidden");
	} else {
		setDetailText(detailCommonLanguageEl, "—");
		detailCommonLanguageRow?.classList.add("hidden");
	}
	detailOverlayEl.classList.remove("hidden");
}

function closeDetailOverlay() {
	detailOverlayEl?.classList.add("hidden");
}

function resolveScheduleTitle(schedule) {
	if (!schedule) return "Untitled schedule";
	const sources = [
		schedule.title,
		schedule.name,
		schedule.label,
		schedule.summary,
		schedule.description,
		schedule.category,
	];
	for (const value of sources) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return "Untitled schedule";
}

function resolveOccurrenceTitle(occurrence, schedule) {
	if (!occurrence) return resolveScheduleTitle(schedule);

	const sources = [
		occurrence.title,
		occurrence.name,
		occurrence.summary,
		occurrence.description,
	];

	for (const value of sources) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}

	return resolveScheduleTitle(schedule);
}

const SLOT_HEIGHT = 60; // px per hour
const START_HOUR = 0;
const END_HOUR = 24;

const formatDateKey = (date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function calculateOverlappingLayout(events) {
	if (!events?.length) return new Map();
	const sorted = [...events].sort((a, b) => a.start - b.start);
	const activeSlots = [];
	const availableSlots = [];
	let nextSlotIndex = 0;
	const layoutMap = new Map();

	const durationInMs = (event) => {
		const minutes = Number.isFinite(event?.duration) ? event.duration : 60;
		return Math.max(0, minutes) * 60 * 1000;
	};

	const refreshLayouts = (concurrency) => {
		const ordered = [...activeSlots].sort((a, b) => a.slotIndex - b.slotIndex);
		ordered.forEach((slot, idx) => {
			const existing = layoutMap.get(slot.event) ?? { columns: 0, position: 0 };
			existing.position = idx;
			existing.columns = Math.max(existing.columns, concurrency);
			layoutMap.set(slot.event, existing);
		});
	};

	sorted.forEach((event) => {
		const start = event.start.getTime();
		const end = start + durationInMs(event);

		for (let i = activeSlots.length - 1; i >= 0; i--) {
			if (activeSlots[i].end <= start) {
				availableSlots.push(activeSlots[i].slotIndex);
				activeSlots.splice(i, 1);
			}
		}

		const slotIndex = availableSlots.length > 0 ? availableSlots.pop() : nextSlotIndex++;
		activeSlots.push({ slotIndex, end, event });
		refreshLayouts(activeSlots.length);
	});

	// Ensure every event has at least a default layout (fallback for zero concurrency)
	events.forEach((event) => {
		if (!layoutMap.has(event)) {
			layoutMap.set(event, { columns: 1, position: 0 });
		}
	});

	return layoutMap;
}

function getStartOfWeek(date) {
	const copy = new Date(date);
	const day = copy.getDay();
	const diff = (day + 6) % 7; // Start on Monday
	copy.setDate(copy.getDate() - diff);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

function formatWeekLabel(startDate) {
	const endDate = new Date(startDate);
	endDate.setDate(endDate.getDate() + 6);
	const shortDate = (subject) =>
		subject.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	const startFormatted = shortDate(startDate);
	const endFormatted = shortDate(endDate);
	const yearChanged = startDate.getFullYear() !== endDate.getFullYear();
	return yearChanged
		? `${startFormatted} — ${endFormatted}, ${endDate.getFullYear()}`
		: `${startFormatted} — ${endFormatted}`;
}

function isSameDay(a, b) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function setLoading(value) {
	state.isLoading = value;
	if (loadingEl) {
		loadingEl.classList.toggle("hidden", !value);
	}
}

function setEmptyState(visible) {
	if (emptyStateEl) {
		emptyStateEl.classList.toggle("hidden", !visible);
	}
}

// --- New Rendering Logic ---

function buildGridStructure() {
	if (!gridWrapperEl) return;
	gridWrapperEl.innerHTML = `
        <div class="calendar-grid-header">
            <div class="time-gutter-header"></div>
            <div class="days-header" id="daysHeader"></div>
        </div>
        <div class="calendar-body">
            <div class="time-gutter" id="timeGutter"></div>
            <div class="days-grid" id="daysGrid"></div>
        </div>
    `;

	const daysHeader = document.getElementById("daysHeader");
	const timeGutter = document.getElementById("timeGutter");
	const daysGrid = document.getElementById("daysGrid");

	// Build Time Gutter
	for (let i = START_HOUR; i < END_HOUR; i++) {
		const slot = document.createElement("div");
		slot.className = "time-slot-label";
		if (i !== 0) { // Don't show 00:00
			slot.innerHTML = `<span>${pad(i)}:00</span>`;
		}
		timeGutter.appendChild(slot);
	}

	// Build Days Header and Grid Columns
	const start = new Date(state.currentWeekStart);
	const today = new Date();

	for (let i = 0; i < 7; i++) {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		const dateKey = formatDateKey(date);
		const isToday = isSameDay(date, today);

		// Header Cell
		const headerCell = document.createElement("div");
		headerCell.className = `day-header-cell ${isToday ? "today" : ""}`;
		headerCell.innerHTML = `
            <span class="day-name">${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span class="day-number">${date.getDate()}</span>
        `;
		daysHeader.appendChild(headerCell);

		// Grid Column
		const col = document.createElement("div");
		col.className = "day-col";
		col.dataset.date = dateKey;

		// Hour lines
		const lines = document.createElement("div");
		lines.className = "hour-lines";
		for (let h = START_HOUR; h < END_HOUR; h++) {
			const line = document.createElement("div");
			line.className = "hour-line";
			lines.appendChild(line);
		}
		col.appendChild(lines);

		// Current time indicator (if today)
		if (isToday) {
			const indicator = document.createElement("div");
			indicator.className = "current-time-indicator";
			updateTimeIndicator(indicator);
			col.appendChild(indicator);
			// Update every minute
			setInterval(() => updateTimeIndicator(indicator), 60000);
		}

		daysGrid.appendChild(col);
	}

	// Scroll to 8 AM by default
	const body = document.querySelector(".calendar-body");
	if (body) {
		body.scrollTop = 8 * SLOT_HEIGHT;
	}
}

function updateTimeIndicator(el) {
	const now = new Date();
	const minutes = now.getHours() * 60 + now.getMinutes();
	const top = (minutes / 60) * SLOT_HEIGHT;
	el.style.top = `${top}px`;

	// Log once per minute (approx) to avoid spam, or just rely on the interval
	if (!window.lastTimeLog || new Date() - window.lastTimeLog > 60000) {
		console.log(`[CalendarWindow] Time Indicator: ${now.toLocaleTimeString()} (${minutes} mins) -> ${top}px`);
		ipcRenderer.send("log", `[CalendarWindow] Time Indicator: ${now.toLocaleTimeString()} (${minutes} mins) -> ${top}px`);
		window.lastTimeLog = new Date();
	}
}

function groupOccurrences(payload) {
	const occurrences = Array.isArray(payload?.occurrences) ? payload.occurrences : [];
	const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
	const scheduleMap = new Map(schedules.map((item) => [item.id, item]));
	const buckets = new Map();

	occurrences.forEach((occurrence) => {
		const occursAtValue = occurrence?.occurs_at ?? occurrence?.occursAt ?? null;
		const occursDate = occursAtValue ? new Date(occursAtValue) : null;
		if (!occursDate || Number.isNaN(occursDate.getTime())) return;
		const dateKey = formatDateKey(occursDate);
		const scheduleId = occurrence?.schedule_id ?? occurrence?.scheduleId;
		if (!scheduleId) return;
		const bucketKey = `${dateKey}::${scheduleId}`;
		if (!buckets.has(bucketKey)) {
			buckets.set(bucketKey, {
				date: dateKey,
				occurrences: [],
				scheduleId,
			});
		}
		buckets.get(bucketKey).occurrences.push({
			...occurrence,
			occursAt: occursDate,
		});
	});

	const eventsByDate = new Map();
	buckets.forEach((bucket) => {
		const { date, occurrences: items, scheduleId } = bucket;
		const schedule = scheduleMap.get(scheduleId);
		items.sort((a, b) => a.occursAt - b.occursAt);

		items.forEach((item) => {
			const formatted = item.occursAt.toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			});

			if (!eventsByDate.has(date)) {
				eventsByDate.set(date, []);
			}

			// Determine duration (default 1 hour if not specified)
			let durationMinutes = 60;
			const occurrenceKind = (item.kind ?? item.type ?? "").toString().toLowerCase();
			if (occurrenceKind === "reminder") {
				durationMinutes = 15;
			}
			const normalizedType = occurrenceKind === "task" ? "task" : occurrenceKind === "reminder" ? "reminder" : "reminder";

			const eventTitle = resolveOccurrenceTitle(item, schedule);
			eventsByDate.get(date).push({
				id: item.id ?? `${scheduleId}-${item.occursAt.getTime()}`,
				title: eventTitle,
				timeText: formatted,
				schedule,
				type: normalizedType,
					timestamp: item.occursAt.getTime(),
					start: item.occursAt,
					duration: durationMinutes
				});
		});
	});

	return eventsByDate;
}

const getWeekRange = (dates) => {
	if (!dates?.length) return null;
	const start = new Date(dates[0]);
	start.setHours(0, 0, 0, 0);
	const end = new Date(dates[dates.length - 1]);
	end.setHours(23, 59, 59, 999);
	return { start, end };
};

const createEventsFromDates = (dates, schedule) => {
	if (!dates.length) return [];
	const title = resolveScheduleTitle(schedule);
	// Default duration 1h
	const durationMinutes = 60;

	return dates.map((date) => ({
		id: `${schedule?.id ?? "unnamed"}-${date.getTime()}`,
		title,
		timeText: date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		}),
		schedule,
		type: "schedule",
		timestamp: date.getTime(),
		start: date,
		duration: durationMinutes
	}));
};

const buildOccurrenceDatesForSchedule = (schedule, start, end) => {
	if (!schedule) return [];
	const dtstartRaw =
		schedule.start_local ?? schedule.startLocal ?? schedule.start ?? schedule.startTime ?? null;
	const dtstart = dtstartRaw ? new Date(dtstartRaw) : null;
	const ruleText = schedule.rrule?.trim();

	if (!ruleText) {
		if (!dtstart) return [];
		if (dtstart >= start && dtstart <= end) {
			return [dtstart];
		}
		return [];
	}

	try {
		const hasDtstart = /DTSTART/i.test(ruleText);
		const options = {};
		if (!hasDtstart && dtstart) {
			options.dtstart = dtstart;
		}
		const rule = rrulestr(ruleText, options);
		return rule.between(start, end, true);
	} catch (error) {
		console.warn("[calendar] rrule parsing error", error);
		if (dtstart && dtstart >= start && dtstart <= end) {
			return [dtstart];
		}
		return [];
	}
};

const mergeSchedulePredictions = (eventsByDate, schedules, weekRange) => {
	if (!weekRange || !Array.isArray(schedules)) {
		console.log("[CalendarWindow] mergeSchedulePredictions: No schedules or week range");
		return;
	}

	console.log(`[CalendarWindow] Merging predictions for ${schedules.length} schedules within ${weekRange.start.toISOString()} - ${weekRange.end.toISOString()}`);
	ipcRenderer.send("log", `[CalendarWindow] Merging predictions for ${schedules.length} schedules`);

	schedules.forEach((schedule) => {
		if (!schedule?.id) return;

		// Debug specific schedule
		console.log(`[CalendarWindow] Processing schedule: ${schedule.title} (Start: ${schedule.start_local}, RRule: ${schedule.rrule})`);

		const occurrences = buildOccurrenceDatesForSchedule(
			schedule,
			weekRange.start,
			weekRange.end
		);

		if (occurrences.length > 0) {
			console.log(`[CalendarWindow] Schedule "${schedule.title}" generated ${occurrences.length} occurrences`);
			ipcRenderer.send("log", `[CalendarWindow] Schedule "${schedule.title}" generated ${occurrences.length} occurrences`);
		} else {
			// Log why it might be empty
			// console.log(`[CalendarWindow] Schedule "${schedule.title}" generated 0 occurrences`);
		}

		if (occurrences.length === 0) return;

		const grouped = new Map();
		occurrences.forEach((occ) => {
			const key = formatDateKey(occ);
			const bucket = grouped.get(key) ?? [];
			bucket.push(occ);
			grouped.set(key, bucket);
		});

		grouped.forEach((dates, key) => {
			const bucket = eventsByDate.get(key) ?? [];
			const alreadyHasSchedule = bucket.some((item) => item.schedule?.id === schedule.id);
			if (alreadyHasSchedule) return;
			const generated = createEventsFromDates(dates, schedule);
			if (generated.length === 0) return;
			bucket.push(...generated);
			eventsByDate.set(key, bucket);
		});
	});
};

function renderEvents(eventsByDate) {
	console.log(`[CalendarWindow] Rendering events for ${eventsByDate.size} dates`);
	eventsByDate.forEach((events, dateKey) => {
		const col = document.querySelector(`.day-col[data-date="${dateKey}"]`);
		if (!col) {
			console.warn(`[CalendarWindow] Column not found for date: ${dateKey}`);
			return;
		}

		const layoutMap = calculateOverlappingLayout(events);

		events.forEach((eventItem) => {
			const el = document.createElement("div");
			el.className = "calendar-event";
			const typeClass = eventItem.type ? `calendar-event--${eventItem.type}` : "";
			if (typeClass) {
				el.classList.add(typeClass);
			}

			const startHour = eventItem.start.getHours();
			const startMin = eventItem.start.getMinutes();
			const top = (startHour + startMin / 60) * SLOT_HEIGHT;
			const baseHeight = (eventItem.duration / 60) * SLOT_HEIGHT;
			const height = eventItem.type === "reminder" ? Math.max(14, Math.min(baseHeight, 20)) : baseHeight;

			el.style.top = `${top}px`;
			el.style.height = `${height}px`;

			const layout = layoutMap.get(eventItem) ?? { columns: 1, position: 0 };
			const columns = Math.max(layout.columns, 1);
			const widthPercent = 100 / columns;
			const leftPercent = (layout.position ?? 0) * widthPercent;
			el.style.left = `${leftPercent}%`;
			el.style.width = `${widthPercent}%`;
			el.style.right = "auto";

			console.log(`[CalendarWindow] Rendering event "${eventItem.title}" at ${top}px (height: ${height}px) in ${dateKey}`);

			el.innerHTML = `
                <span class="event-title">${eventItem.title}</span>
                <span class="event-time">${eventItem.timeText}</span>
            `;

			col.appendChild(el);

			el.addEventListener("click", (clickEvent) => {
				clickEvent.stopPropagation();
				showEventDetail(eventItem);
			});
		});
	});
}

function renderCalendarData(payload) {
	buildGridStructure(); // Rebuild grid

	const eventsByDate = groupOccurrences(payload);

	// Get dates for current week to pass to mergeSchedulePredictions
	const dates = [];
	const start = new Date(state.currentWeekStart);
	for (let i = 0; i < 7; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		dates.push(d);
	}

	const weekRange = getWeekRange(dates);
	mergeSchedulePredictions(eventsByDate, payload?.schedules, weekRange);

	renderEvents(eventsByDate);

	const hasEvents = eventsByDate.size > 0;
	setEmptyState(!hasEvents);
}

function requestWeek(startDate) {
	if (!startDate) return;
	const start = new Date(startDate);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	end.setHours(23, 59, 59, 999);
	state.lastResponseRange = {
		start: start.toISOString(),
		end: end.toISOString(),
	};
	setLoading(true);
	ipcRenderer.send("calendar-fetch-occurrences", state.lastResponseRange);

	// Fallback to mock data if backend doesn't respond quickly (for UI verification)
	if (window.mockDataTimeout) clearTimeout(window.mockDataTimeout);
	window.mockDataTimeout = setTimeout(() => {
		if (state.isLoading) {
			injectMockData();
		}
	}, 2000);
}

function refreshWeek() {
	if (!weekLabelEl) return;
	weekLabelEl.textContent = formatWeekLabel(state.currentWeekStart);
	requestWeek(state.currentWeekStart);
}

prevButton?.addEventListener("click", () => {
	state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7);
	refreshWeek();
});

nextButton?.addEventListener("click", () => {
	state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7);
	refreshWeek();
});

todayButton?.addEventListener("click", () => {
	state.currentWeekStart = getStartOfWeek(new Date());
	refreshWeek();
});

ipcRenderer.on("calendar-data", (_, payload) => {
	console.log("[CalendarWindow] Received calendar data:", payload);
	// Clear mock data timeout if real data arrives
	if (window.mockDataTimeout) {
		clearTimeout(window.mockDataTimeout);
		window.mockDataTimeout = null;
	}

	const requested = payload?.start ?? payload?.range?.start ?? null;
	const requestedTime =
		requested && !Number.isNaN(new Date(requested).getTime())
			? new Date(requested).getTime()
			: null;
	const lastStartTime =
		state.lastResponseRange?.start && !Number.isNaN(new Date(state.lastResponseRange.start).getTime())
			? new Date(state.lastResponseRange.start).getTime()
			: null;
	if (requestedTime && lastStartTime && requestedTime !== lastStartTime) {
		// ignore stale response
		console.warn("[CalendarWindow] Ignoring stale response");
		setLoading(false);
		return;
	}
	setLoading(false);
	renderCalendarData(payload);
});

// Mock data for testing when backend is offline
function injectMockData() {
	console.log("[CalendarWindow] Injecting mock data for testing");
	const start = new Date(state.currentWeekStart);
	const mockEvents = [];
	const mockSchedules = [];

	// Create a few mock events for the current week
	for (let i = 0; i < 5; i++) {
		const date = new Date(start);
		date.setDate(date.getDate() + i);
		date.setHours(9 + i, 0, 0, 0); // Staggered times

		const scheduleId = `mock-schedule-${i}`;
		mockSchedules.push({
			id: scheduleId,
			title: `Mock Event ${i + 1}`,
			start_local: date.toISOString(),
			rrule: ""
		});

		mockEvents.push({
			id: `mock-occurrence-${i}`,
			schedule_id: scheduleId,
			occurs_at: date.toISOString()
		});
	}

	renderCalendarData({
		occurrences: mockEvents,
		schedules: mockSchedules,
		start: state.lastResponseRange?.start,
		end: state.lastResponseRange?.end
	});
	setLoading(false);
}

window.addEventListener("DOMContentLoaded", () => {
	console.log("[CalendarWindow] DOMContentLoaded");
	ipcRenderer.send("log", "[CalendarWindow] DOMContentLoaded - Initializing Grid");

	initDetailOverlay();

	// Initialize grid immediately to replace static HTML
	buildGridStructure();

	// Debug grid height
	setTimeout(() => {
		const grid = document.getElementById("daysGrid");
		if (grid) {
			console.log(`[CalendarWindow] Grid height: ${grid.offsetHeight}px, ScrollHeight: ${grid.scrollHeight}px`);
			ipcRenderer.send("log", `[CalendarWindow] Grid height: ${grid.offsetHeight}px`);
		}
	}, 500);

	refreshWeek();
});
