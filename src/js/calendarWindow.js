import { renderListSummary, createListSummaryStyles } from "./listSummary.js";

const { ipcRenderer } = window.require("electron");
const { rrulestr } = window.require("rrule");

const state = {
	currentWeekStart: getStartOfWeek(new Date()),
	isLoading: false,
	lastResponseRange: null,
	lastCalendarPayload: null,
	events: [], // Store processed events
	lastErrorKey: null,
	lastErrorAt: 0,
	pendingMutation: null,
	pendingConflictRetry: null,
	pendingAnchorRetry: null,
	userSettings: {
		calendar_filters: {
			hidden_kinds: [],
			hidden_states: [],
			hidden_schedule_ids: [],
		},
		updated_at: null,
	},
	hidePastOccurrences: false,
};

const HIDE_PAST_OCCURRENCES_BY_DEFAULT = false;
const SHOW_ONLY_PLANNED_OCCURRENCES = false;
const SHOW_CANCELED_OCCURRENCES = true;
const ENABLE_LOCAL_SCHEDULE_PROJECTIONS = true;
const ENABLE_MOCK_CALENDAR_FALLBACK = false;
const CALENDAR_WINDOW_BUFFER_DAYS = 1;
const VALID_FILTER_KINDS = new Set(["task", "reminder"]);
const VALID_FILTER_STATES = new Set([
	"planned",
	"canceled",
	"deleted",
	"completed",
	"skipped",
]);
state.hidePastOccurrences = HIDE_PAST_OCCURRENCES_BY_DEFAULT;

const gridWrapperEl = document.querySelector(".calendar-grid-wrapper");
const loadingEl = document.querySelector("[data-loading]");
const emptyStateEl = document.querySelector("[data-empty-state]");
const weekLabelEl = document.getElementById("calendarWeekLabel");
const prevButton = document.querySelector('[data-action="prev-week"]');
const nextButton = document.querySelector('[data-action="next-week"]');
const todayButton = document.querySelector('[data-action="today"]');
const filterDetailsEl = document.querySelector("[data-calendar-filters]");
const filterScheduleListEl = document.querySelector("[data-filter-schedule-list]");
const filterUpdatedAtEl = document.querySelector("[data-filter-updated-at]");
const clearHiddenSchedulesButtonEl = document.querySelector(
	'[data-action="clear-hidden-schedules"]',
);
const hidePastOccurrencesInputEl = document.querySelector("[data-filter-hide-past]");
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
let detailApplyScopeEl = null;
let detailIncludeCustomizedEl = null;
let detailDeleteButton = null;
let detailCancelButton = null;
let detailEditFormEl = null;
let detailEditTitleInputEl = null;
let detailEditOccursAtInputEl = null;
let detailEditCategoryInputEl = null;
let detailEditCommonLanguageInputEl = null;
let detailEditUrgencySelectEl = null;
let detailEditDurationInputEl = null;
let detailEditShowBeforeInputEl = null;
let detailEditNotifyOffsetsInputEl = null;
let detailEditMutedOffsetsInputEl = null;
let detailEditTzInputEl = null;
let detailEditRruleInputEl = null;
let detailEditUntilLocalInputEl = null;
let detailEditDescriptionInputEl = null;
let detailEditAllDayCheckboxEl = null;
let detailEditAllDaySpanInputEl = null;
let detailEditAdvancedInputEl = null;
let detailEditAdvancedSectionEl = null;
let detailEditSaveButtonEl = null;
let detailEditFormCancelButtonEl = null;
let activeDetailEvent = null;
let detailEditBaseline = null;
let detailListSummaryEl = null;
let detailListsDataListener = null;

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

const formatAllDayLabel = (event) => {
	if (!event?.start) return "All-day";
	const options = {
		weekday: "short",
		month: "short",
		day: "numeric",
	};
	const dateLabel = event.start.toLocaleDateString(undefined, options);
	const spanDays = Number(event?.allDaySpanDays) || 1;
	if (spanDays > 1) {
		return `All-day (${spanDays} days) · ${dateLabel}`;
	}
	return `All-day · ${dateLabel}`;
};

const RFC3339_TIMESTAMP_REGEX =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const isRfc3339Timestamp = (value) => {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (!RFC3339_TIMESTAMP_REGEX.test(trimmed)) return false;
	return !Number.isNaN(Date.parse(trimmed));
};
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isLikelyUuid = (value) =>
	typeof value === "string" && UUID_REGEX.test(value.trim());

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

const extractNullableBooleanValue = (value, fallback = false) => {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.toLowerCase().trim();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	if (!value || typeof value !== "object") return fallback;
	if ("Valid" in value && value.Valid === false) return fallback;
	if (typeof value.Bool === "boolean") return value.Bool;
	if (typeof value.Boolean === "boolean") return value.Boolean;
	return fallback;
};

const extractNullableNumberValue = (value, fallback = 0) => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : fallback;
	}
	if (value && typeof value === "object") {
		if ("Valid" in value && value.Valid === false) return fallback;
		const candidates = [value.Int32, value.Int64, value.Integer, value.Value, value.value];
		for (const candidate of candidates) {
			const numeric = Number(candidate);
			if (Number.isFinite(numeric)) return numeric;
		}
	}
	return fallback;
};

const extractNullableTimeValue = (value) => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		if ("Valid" in value && value.Valid === false) return null;
		const candidates = [value.Time, value.time, value.Value, value.value, value.String];
		for (const candidate of candidates) {
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate.trim();
			}
		}
	}
	return null;
};

const normalizeAllDaySpanDays = (value, fallback = 1) =>
	Math.max(1, Math.round(extractNullableNumberValue(value, fallback)));

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

const cloneDefaultCalendarFilters = () => ({
	hidden_kinds: [],
	hidden_states: [],
	hidden_schedule_ids: [],
});

const extractArrayLikeValue = (value) => {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return [];
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// Fall through and treat as comma-separated values.
		}
		return trimmed
			.split(",")
			.map((token) => token.trim())
			.filter(Boolean);
	}
	if (typeof value === "object") {
		if ("Valid" in value && value.Valid === false) return [];
		const candidates = [value.Array, value.Values, value.Int32Array, value.Int64Array];
		for (const candidate of candidates) {
			if (Array.isArray(candidate)) return candidate;
		}
	}
	return [];
};

const normalizeFilterArray = (value, { allowedSet = null } = {}) => {
	const normalized = [];
	extractArrayLikeValue(value).forEach((entry) => {
		const text = String(extractNullableStringValue(entry) ?? "")
			.trim()
			.toLowerCase();
		if (!text) return;
		if (allowedSet && !allowedSet.has(text)) return;
		if (normalized.includes(text)) return;
		normalized.push(text);
	});
	return normalized.sort((left, right) => left.localeCompare(right));
};

const normalizeScheduleIdArray = (value) => {
	const normalized = [];
	extractArrayLikeValue(value).forEach((entry) => {
		const text = String(extractNullableStringValue(entry) ?? "")
			.trim()
			.toLowerCase();
		if (!text) return;
		if (normalized.includes(text)) return;
		normalized.push(text);
	});
	return normalized.sort((left, right) => left.localeCompare(right));
};

const normalizeCalendarFilters = (value, fallback = null) => {
	const safeFallback = fallback ?? cloneDefaultCalendarFilters();
	const source =
		value && typeof value === "object" && !Array.isArray(value) ? value : {};
	const hasHiddenKinds =
		Object.prototype.hasOwnProperty.call(source, "hidden_kinds") ||
		Object.prototype.hasOwnProperty.call(source, "hiddenKinds");
	const hasHiddenStates =
		Object.prototype.hasOwnProperty.call(source, "hidden_states") ||
		Object.prototype.hasOwnProperty.call(source, "hiddenStates");
	const hasHiddenScheduleIds =
		Object.prototype.hasOwnProperty.call(source, "hidden_schedule_ids") ||
		Object.prototype.hasOwnProperty.call(source, "hiddenScheduleIds");
	return {
		hidden_kinds: normalizeFilterArray(
			hasHiddenKinds
				? source.hidden_kinds ?? source.hiddenKinds
				: safeFallback.hidden_kinds ?? [],
			{
				allowedSet: VALID_FILTER_KINDS,
			},
		),
		hidden_states: normalizeFilterArray(
			hasHiddenStates
				? source.hidden_states ?? source.hiddenStates
				: safeFallback.hidden_states ?? [],
			{
				allowedSet: VALID_FILTER_STATES,
			},
		),
		hidden_schedule_ids: normalizeScheduleIdArray(
			hasHiddenScheduleIds
				? source.hidden_schedule_ids ?? source.hiddenScheduleIds
				: safeFallback.hidden_schedule_ids ?? [],
		),
	};
};

const normalizeUserSettings = (value, fallback = null) => {
	const base = fallback ?? state.userSettings;
	const source =
		value && typeof value === "object" && !Array.isArray(value) ? value : {};
	const rawFilters = source.calendar_filters ?? source.calendarFilters ?? source.CalendarFilters;
	const baseFilters =
		base?.calendar_filters && typeof base.calendar_filters === "object"
			? base.calendar_filters
			: cloneDefaultCalendarFilters();
	const updatedAt =
		extractNullableTimeValue(source.updated_at ?? source.updatedAt ?? source.UpdatedAt) ??
		base?.updated_at ??
		null;

	return {
		calendar_filters: normalizeCalendarFilters(rawFilters, baseFilters),
		updated_at: updatedAt,
	};
};

const normalizeCalendarFilterPatch = (value) => {
	const source =
		value && typeof value === "object" && !Array.isArray(value) ? value : {};
	const rawFilters = source.calendar_filters ?? source.calendarFilters ?? source;
	const filters =
		rawFilters && typeof rawFilters === "object" && !Array.isArray(rawFilters) ? rawFilters : {};
	const patch = {};
	if ("hidden_kinds" in filters || "hiddenKinds" in filters) {
		patch.hidden_kinds = normalizeFilterArray(filters.hidden_kinds ?? filters.hiddenKinds, {
			allowedSet: VALID_FILTER_KINDS,
		});
	}
	if ("hidden_states" in filters || "hiddenStates" in filters) {
		patch.hidden_states = normalizeFilterArray(filters.hidden_states ?? filters.hiddenStates, {
			allowedSet: VALID_FILTER_STATES,
		});
	}
	if ("hidden_schedule_ids" in filters || "hiddenScheduleIds" in filters) {
		patch.hidden_schedule_ids = normalizeScheduleIdArray(
			filters.hidden_schedule_ids ?? filters.hiddenScheduleIds,
		);
	}
	return patch;
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

const normalizeApplyScopeValue = (value) => {
	const normalized = String(value ?? "").toLowerCase().trim();
	if (normalized === "following" || normalized === "all") return normalized;
	return "single";
};

const resolveEventRruleText = (eventItem) => {
	const schedule = eventItem?.schedule ?? {};
	const occurrence = eventItem?.occurrence ?? {};
	const payload =
		eventItem?.payload && typeof eventItem.payload === "object" && !Array.isArray(eventItem.payload)
			? eventItem.payload
			: {};
	const snapshot =
		occurrence?.snapshot &&
		typeof occurrence.snapshot === "object" &&
		!Array.isArray(occurrence.snapshot)
			? occurrence.snapshot
			: {};
	return normalizeOptionalTextInput(
		extractNullableStringValue(
			schedule?.rrule ??
				schedule?.Rrule ??
				schedule?.RRule ??
				payload?.rrule ??
				payload?.Rrule ??
				payload?.RRule ??
				occurrence?.rrule ??
				occurrence?.Rrule ??
				occurrence?.RRule ??
				snapshot?.rrule ??
				snapshot?.Rrule ??
				snapshot?.RRule ??
				null,
		),
	);
};

const eventSupportsSeriesApplyScope = (eventItem) => Boolean(resolveEventRruleText(eventItem));

const syncDetailApplyScopeOptions = (allowSeriesScopes) => {
	if (!detailApplyScopeEl) return;
	Array.from(detailApplyScopeEl.options ?? []).forEach((option) => {
		const value = String(option?.value ?? "").toLowerCase().trim();
		const isSeriesOption = value === "following" || value === "all";
		if (!isSeriesOption) return;
		option.disabled = !allowSeriesScopes;
		option.hidden = !allowSeriesScopes;
	});
	if (!allowSeriesScopes) {
		detailApplyScopeEl.value = "single";
	}
};

const resolveExpectedSourceRev = (eventItem) => {
	const metaRev = extractNullableNumberValue(
		eventItem?.actionMeta?.source_rev,
		Number.NaN,
	);
	if (Number.isFinite(metaRev) && metaRev >= 0) {
		return Math.round(metaRev);
	}
	const occurrence = eventItem?.occurrence ?? {};
	const schedule = eventItem?.schedule ?? {};
	const fromOccurrence = extractNullableNumberValue(
		occurrence?.source_rev ?? occurrence?.sourceRev ?? occurrence?.SourceRev,
		Number.NaN,
	);
	if (Number.isFinite(fromOccurrence) && fromOccurrence >= 0) {
		return Math.round(fromOccurrence);
	}
	const fromSchedule = extractNullableNumberValue(
		schedule?.rev ?? schedule?.Rev,
		Number.NaN,
	);
	if (Number.isFinite(fromSchedule) && fromSchedule >= 0) {
		return Math.round(fromSchedule);
	}
	return null;
};

const resolveOccurrenceMutationTarget = (eventItem) => {
	const actionMeta =
		eventItem?.actionMeta && typeof eventItem.actionMeta === "object"
			? eventItem.actionMeta
			: null;
	const occurrence = eventItem?.occurrence ?? {};
	const normalizeAnchorCandidate = (value) => {
		if (!value) return null;
		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			return value.toISOString();
		}
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (!trimmed) return null;
			if (isRfc3339Timestamp(trimmed)) return trimmed;
			const parsed = Date.parse(trimmed);
			if (!Number.isNaN(parsed)) {
				return new Date(parsed).toISOString();
			}
		}
		return null;
	};
	const occurrenceId = extractNullableStringValue(
		actionMeta?.occurrence_id ??
			occurrence?.id ??
			occurrence?.occurrence_id ??
			occurrence?.OccurrenceID ??
			eventItem?.occurrence_id ??
			(isLikelyUuid(eventItem?.id) ? eventItem.id : null) ??
			null,
	);
	if (occurrenceId) {
		return {
			occurrence_id: String(occurrenceId),
		};
	}

	const scheduleId = extractNullableStringValue(
		actionMeta?.schedule_id ??
			occurrence?.schedule_id ??
			occurrence?.scheduleId ??
			occurrence?.ScheduleID ??
			eventItem?.schedule_id ??
			eventItem?.schedule?.id ??
			eventItem?.schedule?.schedule_id ??
			null,
	);
	const anchorCandidates = [
		actionMeta?.anchor_occurs_at_utc,
		occurrence?.occurs_at,
		occurrence?.occursAt,
		occurrence?.OccursAt,
		eventItem?.occurs_at,
		eventItem?.occursAt,
		eventItem?.anchor_occurs_at,
		eventItem?.anchor_occurs_at_utc,
	];
	let anchorText = anchorCandidates
		.map((candidate) => normalizeAnchorCandidate(candidate))
		.find(Boolean);
	if (!anchorText) {
		const eventStart =
			eventItem?.start instanceof Date && !Number.isNaN(eventItem.start.getTime())
				? eventItem.start
				: null;
		if (eventStart) {
			const anchorFromStart = buildAnchorOccursAtUtcIso({
				occursAt: eventStart,
				timeZone:
					extractNullableStringValue(actionMeta?.schedule_tz) ??
					resolveScheduleTimeZone(eventItem?.schedule ?? null),
			});
			anchorText = normalizeAnchorCandidate(anchorFromStart);
		}
	}

	const target = {};
	if (scheduleId && anchorText && isRfc3339Timestamp(anchorText)) {
		target.schedule_id = String(scheduleId);
		target.anchor_occurs_at = anchorText;
	}
	return Object.keys(target).length > 0 ? target : null;
};

const resolveDurationMinutes = ({
	occurrence = null,
	occurrencePayload = null,
	schedule = null,
	normalizedType = "reminder",
} = {}) => {
	const sourceList = [
		occurrence?.duration_minutes,
		occurrence?.durationMinutes,
		occurrence?.DurationMinutes,
		occurrencePayload?.duration_minutes,
		occurrencePayload?.durationMinutes,
		occurrencePayload?.DurationMinutes,
		occurrence?.snapshot?.duration_minutes,
		occurrence?.snapshot?.durationMinutes,
		occurrence?.overrides?.duration_minutes,
		occurrence?.overrides?.durationMinutes,
		schedule?.duration_minutes,
		schedule?.durationMinutes,
		schedule?.DurationMinutes,
	];
	for (const source of sourceList) {
		const numeric = extractNullableNumberValue(source, Number.NaN);
		if (Number.isFinite(numeric) && numeric >= 0) {
			return Math.round(numeric);
		}
	}
	return 0;
};

const normalizeUrgencyInput = (value, fallback = "normal") => {
	const normalized = String(value ?? "")
		.toLowerCase()
		.trim();
	if (normalized === "low") return "low";
	if (normalized === "normal" || normalized === "medium") return "normal";
	if (normalized === "high") return "high";
	if (normalized === "max") return "max";
	if (normalized === "ultimate" || normalized === "urgent") return "ultimate";
	return fallback;
};

const normalizeOffsetArrayForEdit = (raw) => {
	const toMinutesArray = (source) =>
		source
			.map((value) => Number(value))
			.filter((value) => Number.isFinite(value) && value >= 0)
			.map((value) => Math.round(value));

	if (Array.isArray(raw)) return toMinutesArray(raw);
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return [];
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return toMinutesArray(parsed);
		} catch {
			// fall through
		}
		return toMinutesArray(
			trimmed
				.split(",")
				.map((token) => token.trim())
				.filter(Boolean),
		);
	}
	if (raw && typeof raw === "object") {
		if ("Valid" in raw && raw.Valid === false) return [];
		const candidates = [raw.Array, raw.Int32Array, raw.Int64Array, raw.Values];
		for (const candidate of candidates) {
			if (Array.isArray(candidate)) return toMinutesArray(candidate);
		}
	}
	return [];
};

const offsetsToInputText = (offsets) =>
	normalizeOffsetArrayForEdit(offsets)
		.map((value) => String(value))
		.join(", ");

const arraysEqualNumbers = (left, right) => {
	if (!Array.isArray(left) || !Array.isArray(right)) return false;
	if (left.length !== right.length) return false;
	return left.every((value, index) => Number(value) === Number(right[index]));
};

const normalizeOptionalTextInput = (value) => {
	const trimmed = String(value ?? "").trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeRRuleForComparison = (value) => {
	const text = normalizeOptionalTextInput(value);
	if (!text) return null;
	let normalized = text.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n").trim();
	if (!normalized) return null;
	if (/DTSTART:/i.test(normalized) && /RRULE:/i.test(normalized) && !/\n/.test(normalized)) {
		normalized = normalized.replace(/(DTSTART:[\s\S]*?)(RRULE:)/i, "$1\n$2");
	}
	const lines = normalized
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const rruleLine =
		lines.find((line) => /^RRULE:/i.test(line)) ??
		lines.find((line) => /^FREQ=/i.test(line)) ??
		null;
	if (!rruleLine) return null;
	const rule = rruleLine.replace(/^RRULE:\s*/i, "").replace(/\s+/g, "");
	if (!rule) return null;
	return rule.toUpperCase();
};

const parseNonNegativeIntegerInput = (value, fallback = null) => {
	if (value === null || value === undefined) return fallback;
	const trimmed = String(value).trim();
	if (!trimmed) return fallback;
	const numeric = Number(trimmed);
	if (!Number.isFinite(numeric) || numeric < 0) return fallback;
	return Math.round(numeric);
};

const parsePositiveIntegerInput = (value, fallback = null) => {
	const parsed = parseNonNegativeIntegerInput(value, fallback);
	if (parsed === null || parsed === undefined) return fallback;
	return Math.max(1, parsed);
};

const toDateTimeLocalInputValue = (isoValue) => {
	if (!isoValue) return "";
	const parsed = Date.parse(String(isoValue));
	if (Number.isNaN(parsed)) return "";
	const date = new Date(parsed);
	return [
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
	].join("T");
};

const dateTimeLocalInputToIso = (inputValue) => {
	const trimmed = String(inputValue ?? "").trim();
	if (!trimmed) return null;
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
};

const resolveOccurrenceEditDefaults = (eventItem = {}) => {
	const occurrence = eventItem?.occurrence ?? {};
	const schedule = eventItem?.schedule ?? {};
	const payload =
		eventItem?.payload && typeof eventItem.payload === "object" && !Array.isArray(eventItem.payload)
			? eventItem.payload
			: {};
	const baseTitle = String(eventItem?.title ?? "").trim();
	const baseOccursAt =
		eventItem?.start instanceof Date && !Number.isNaN(eventItem.start.getTime())
			? eventItem.start.toISOString()
			: normalizeOptionalTextInput(
					extractNullableTimeValue(
						occurrence?.occurs_at ??
							occurrence?.occursAt ??
							occurrence?.OccursAt ??
							payload?.occurs_at ??
							payload?.occursAt,
					),
				);

	const notifyOffsets = normalizeOffsetArrayForEdit(
		payload?.notify_offsets_min ??
			payload?.notifyOffsetsMin ??
			occurrence?.notify_offsets_min ??
			occurrence?.notifyOffsetsMin ??
			schedule?.notify_offsets_min ??
			schedule?.notifyOffsetsMin,
	);
	const mutedOffsets = normalizeOffsetArrayForEdit(
		payload?.muted_offsets_min ??
			payload?.mutedOffsetsMin ??
			occurrence?.muted_offsets_min ??
			occurrence?.mutedOffsetsMin ??
			schedule?.muted_offsets_min ??
			schedule?.mutedOffsetsMin,
	);

	return {
		title: baseTitle || "Untitled event",
		occursAt: baseOccursAt ?? "",
		category: normalizeOptionalTextInput(
			extractNullableStringValue(
				payload?.category ??
					occurrence?.category ??
					occurrence?.Category ??
					schedule?.category ??
					schedule?.Category,
			),
		),
		commonLanguage: normalizeOptionalTextInput(
			extractNullableStringValue(
				payload?.common_language ??
					payload?.commonLanguage ??
					occurrence?.common_language ??
					occurrence?.commonLanguage ??
					schedule?.common_language ??
					schedule?.commonLanguage,
			),
		),
		urgency: normalizeUrgencyInput(
			payload?.urgency ?? occurrence?.urgency ?? schedule?.urgency,
			"normal",
		),
		durationMinutes: parseNonNegativeIntegerInput(
			payload?.duration_minutes ??
				payload?.durationMinutes ??
				occurrence?.duration_minutes ??
				occurrence?.durationMinutes ??
				schedule?.duration_minutes ??
				schedule?.durationMinutes,
			0,
		),
		showBeforeMinutes: parseNonNegativeIntegerInput(
			payload?.show_before_minutes ??
				payload?.showBeforeMinutes ??
				occurrence?.show_before_minutes ??
				occurrence?.showBeforeMinutes ??
				schedule?.show_before_minutes ??
				schedule?.showBeforeMinutes,
			0,
		),
		notifyOffsets,
		mutedOffsets,
		tz:
			normalizeOptionalTextInput(
				extractNullableStringValue(
					payload?.tz ??
						payload?.time_zone ??
						occurrence?.tz ??
						occurrence?.TZ ??
						schedule?.tz ??
						schedule?.TZ ??
						schedule?.TimeZone,
				),
			) ?? detectLocalTimeZone(),
		rrule: normalizeOptionalTextInput(
			extractNullableStringValue(
				payload?.rrule ??
					payload?.RRule ??
					occurrence?.rrule ??
					occurrence?.RRule ??
					schedule?.rrule ??
					schedule?.RRule,
			),
		),
		untilLocal: normalizeOptionalTextInput(
			extractNullableTimeValue(
				payload?.until_local ??
					payload?.untilLocal ??
					occurrence?.until_local ??
					occurrence?.untilLocal ??
					schedule?.until_local ??
					schedule?.untilLocal,
			),
		),
		description: normalizeOptionalTextInput(
			extractNullableStringValue(
				payload?.description ??
					occurrence?.description ??
					eventItem?.description ??
					eventItem?.schedule?.description,
			),
		),
		isAllDay: extractNullableBooleanValue(
			payload?.is_all_day ??
				payload?.isAllDay ??
				occurrence?.is_all_day ??
				occurrence?.isAllDay ??
				schedule?.is_all_day ??
				schedule?.isAllDay,
			false,
		),
		allDaySpanDays: parsePositiveIntegerInput(
			payload?.all_day_span_days ??
				payload?.allDaySpanDays ??
				occurrence?.all_day_span_days ??
				occurrence?.allDaySpanDays ??
				schedule?.all_day_span_days ??
				schedule?.allDaySpanDays,
			1,
		),
	};
};

const hideDetailEditForm = () => {
	if (!detailEditFormEl) return;
	detailEditFormEl.classList.add("hidden");
	detailEditBaseline = null;
	if (detailEditTitleInputEl) detailEditTitleInputEl.value = "";
	if (detailEditOccursAtInputEl) detailEditOccursAtInputEl.value = "";
	if (detailEditCategoryInputEl) detailEditCategoryInputEl.value = "";
	if (detailEditCommonLanguageInputEl) detailEditCommonLanguageInputEl.value = "";
	if (detailEditUrgencySelectEl) detailEditUrgencySelectEl.value = "normal";
	if (detailEditDurationInputEl) detailEditDurationInputEl.value = "";
	if (detailEditShowBeforeInputEl) detailEditShowBeforeInputEl.value = "";
	if (detailEditNotifyOffsetsInputEl) detailEditNotifyOffsetsInputEl.value = "";
	if (detailEditMutedOffsetsInputEl) detailEditMutedOffsetsInputEl.value = "";
	if (detailEditTzInputEl) detailEditTzInputEl.value = "";
	if (detailEditRruleInputEl) detailEditRruleInputEl.value = "";
	if (detailEditUntilLocalInputEl) detailEditUntilLocalInputEl.value = "";
	if (detailEditDescriptionInputEl) detailEditDescriptionInputEl.value = "";
	if (detailEditAllDayCheckboxEl) detailEditAllDayCheckboxEl.checked = false;
	if (detailEditAllDaySpanInputEl) detailEditAllDaySpanInputEl.value = "1";
	if (detailEditAdvancedInputEl) detailEditAdvancedInputEl.value = "";
	if (detailEditAdvancedSectionEl) {
		detailEditAdvancedSectionEl.open = false;
	}
};

const showDetailEditForm = (eventItem) => {
	if (!detailEditFormEl) return;
	const defaults = resolveOccurrenceEditDefaults(eventItem);
	detailEditBaseline = defaults;
	if (detailEditTitleInputEl) detailEditTitleInputEl.value = defaults.title;
	if (detailEditOccursAtInputEl) {
		detailEditOccursAtInputEl.value = toDateTimeLocalInputValue(defaults.occursAt);
	}
	if (detailEditCategoryInputEl) detailEditCategoryInputEl.value = defaults.category ?? "";
	if (detailEditCommonLanguageInputEl) {
		detailEditCommonLanguageInputEl.value = defaults.commonLanguage ?? "";
	}
	if (detailEditUrgencySelectEl) detailEditUrgencySelectEl.value = defaults.urgency ?? "normal";
	if (detailEditDurationInputEl) detailEditDurationInputEl.value = String(defaults.durationMinutes ?? 0);
	if (detailEditShowBeforeInputEl) {
		detailEditShowBeforeInputEl.value = String(defaults.showBeforeMinutes ?? 0);
	}
	if (detailEditNotifyOffsetsInputEl) {
		detailEditNotifyOffsetsInputEl.value = offsetsToInputText(defaults.notifyOffsets);
	}
	if (detailEditMutedOffsetsInputEl) {
		detailEditMutedOffsetsInputEl.value = offsetsToInputText(defaults.mutedOffsets);
	}
	if (detailEditTzInputEl) detailEditTzInputEl.value = defaults.tz ?? "";
	if (detailEditRruleInputEl) detailEditRruleInputEl.value = defaults.rrule ?? "";
	if (detailEditUntilLocalInputEl) {
		detailEditUntilLocalInputEl.value = toDateTimeLocalInputValue(defaults.untilLocal);
	}
	if (detailEditDescriptionInputEl) detailEditDescriptionInputEl.value = defaults.description ?? "";
	if (detailEditAllDayCheckboxEl) detailEditAllDayCheckboxEl.checked = Boolean(defaults.isAllDay);
	if (detailEditAllDaySpanInputEl) {
		detailEditAllDaySpanInputEl.value = String(defaults.allDaySpanDays ?? 1);
	}
	if (detailEditAdvancedInputEl) detailEditAdvancedInputEl.value = "";
	detailEditFormEl.classList.remove("hidden");
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
					<div class="calendar-detail-list-summary" data-detail-list-summary></div>
					<div class="calendar-detail-edit-form hidden" data-detail-edit-form>
						<div class="calendar-detail-edit-grid">
							<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
								<span class="calendar-detail-label">Title</span>
								<input type="text" data-detail-edit-title placeholder="Event title" />
							</label>
								<label class="calendar-detail-edit-field">
									<span class="calendar-detail-label">Occurs At (Local Time)</span>
									<input type="datetime-local" step="1" data-detail-edit-occurs-at />
								</label>
							<label class="calendar-detail-edit-field">
								<span class="calendar-detail-label">Urgency</span>
								<select data-detail-edit-urgency>
									<option value="low">Low</option>
									<option value="normal">Normal</option>
									<option value="high">High</option>
									<option value="max">Max</option>
									<option value="ultimate">Ultimate</option>
								</select>
							</label>
							<label class="calendar-detail-edit-field">
								<span class="calendar-detail-label">Category</span>
								<input type="text" data-detail-edit-category placeholder="Optional" />
							</label>
							<label class="calendar-detail-edit-field">
								<span class="calendar-detail-label">Duration (min)</span>
								<input type="number" min="0" step="1" data-detail-edit-duration placeholder="0" />
							</label>
							<label class="calendar-detail-edit-field">
								<span class="calendar-detail-label">Show Before (min)</span>
								<input type="number" min="0" step="1" data-detail-edit-show-before placeholder="0" />
							</label>
							<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
								<span class="calendar-detail-label">Notify Offsets (min)</span>
								<input type="text" data-detail-edit-notify-offsets placeholder="e.g. 60, 10" />
							</label>
							<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
								<span class="calendar-detail-label">Muted Offsets (min)</span>
								<input type="text" data-detail-edit-muted-offsets placeholder="e.g. 0" />
							</label>
						</div>
						<details class="calendar-detail-edit-advanced">
							<summary>Advanced fields</summary>
							<div class="calendar-detail-edit-grid">
								<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
									<span class="calendar-detail-label">Common Language</span>
									<input type="text" data-detail-edit-common-language placeholder="Optional natural language" />
								</label>
								<label class="calendar-detail-edit-field">
									<span class="calendar-detail-label">Timezone (IANA)</span>
									<input type="text" data-detail-edit-tz placeholder="Europe/Bucharest" />
								</label>
									<label class="calendar-detail-edit-field">
										<span class="calendar-detail-label">Until (Local Time)</span>
										<input type="datetime-local" step="1" data-detail-edit-until-local />
									</label>
								<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
									<span class="calendar-detail-label">RRULE</span>
									<input type="text" data-detail-edit-rrule placeholder="FREQ=DAILY;INTERVAL=1" />
								</label>
								<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
									<span class="calendar-detail-label">Description</span>
									<input type="text" data-detail-edit-description placeholder="Optional description" />
								</label>
								<label class="calendar-detail-checkbox calendar-detail-edit-field--wide">
									<input type="checkbox" data-detail-edit-all-day />
									<span>All-day occurrence</span>
								</label>
								<label class="calendar-detail-edit-field">
									<span class="calendar-detail-label">All-day Span Days</span>
									<input type="number" min="1" step="1" data-detail-edit-all-day-span placeholder="1" />
								</label>
								<label class="calendar-detail-edit-field calendar-detail-edit-field--wide">
									<span class="calendar-detail-label">Advanced JSON Patch</span>
									<textarea data-detail-edit-advanced placeholder='{"duration_minutes":45,"urgency":"high"}'></textarea>
								</label>
							</div>
						</details>
						<div class="calendar-detail-edit-actions">
							<button type="button" class="calendar-detail-action" data-action="save-edit-detail">Save edit</button>
							<button type="button" class="calendar-detail-action calendar-detail-action--cancel" data-action="cancel-edit-form">Cancel</button>
						</div>
					</div>
				<div class="calendar-detail-scope-controls">
					<label class="calendar-detail-scope-label">
						<span class="calendar-detail-label">Apply scope:</span>
						<select data-detail-apply-scope>
							<option value="single">Single occurrence</option>
						<option value="following">This and following</option>
						<option value="all">All in series</option>
					</select>
				</label>
				<label class="calendar-detail-checkbox">
					<input type="checkbox" data-detail-include-customized />
					<span>Include edited occurrences</span>
				</label>
			</div>
            <div class="calendar-detail-actions">
                <button type="button" class="calendar-detail-action" data-action="edit-detail">Edit occurrence</button>
                <button type="button" class="calendar-detail-action calendar-detail-action--cancel" data-action="cancel-detail">Cancel occurrence</button>
                <button type="button" class="calendar-detail-action calendar-detail-action--delete" data-action="delete-detail">Delete occurrence</button>
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
	detailCancelButton = detailOverlayEl.querySelector("[data-action='cancel-detail']");
	detailDeleteButton = detailOverlayEl.querySelector("[data-action='delete-detail']");
	detailApplyScopeEl = detailOverlayEl.querySelector("[data-detail-apply-scope]");
	detailIncludeCustomizedEl = detailOverlayEl.querySelector("[data-detail-include-customized]");
	detailEditFormEl = detailOverlayEl.querySelector("[data-detail-edit-form]");
	detailEditTitleInputEl = detailOverlayEl.querySelector("[data-detail-edit-title]");
	detailEditOccursAtInputEl = detailOverlayEl.querySelector("[data-detail-edit-occurs-at]");
	detailEditCategoryInputEl = detailOverlayEl.querySelector("[data-detail-edit-category]");
	detailEditCommonLanguageInputEl = detailOverlayEl.querySelector(
		"[data-detail-edit-common-language]",
	);
	detailEditUrgencySelectEl = detailOverlayEl.querySelector("[data-detail-edit-urgency]");
	detailEditDurationInputEl = detailOverlayEl.querySelector("[data-detail-edit-duration]");
	detailEditShowBeforeInputEl = detailOverlayEl.querySelector("[data-detail-edit-show-before]");
	detailEditNotifyOffsetsInputEl = detailOverlayEl.querySelector(
		"[data-detail-edit-notify-offsets]",
	);
	detailEditMutedOffsetsInputEl = detailOverlayEl.querySelector(
		"[data-detail-edit-muted-offsets]",
	);
	detailEditTzInputEl = detailOverlayEl.querySelector("[data-detail-edit-tz]");
	detailEditRruleInputEl = detailOverlayEl.querySelector("[data-detail-edit-rrule]");
	detailEditUntilLocalInputEl = detailOverlayEl.querySelector(
		"[data-detail-edit-until-local]",
	);
	detailEditDescriptionInputEl = detailOverlayEl.querySelector("[data-detail-edit-description]");
	detailEditAllDayCheckboxEl = detailOverlayEl.querySelector("[data-detail-edit-all-day]");
	detailEditAllDaySpanInputEl = detailOverlayEl.querySelector("[data-detail-edit-all-day-span]");
	detailEditAdvancedInputEl = detailOverlayEl.querySelector("[data-detail-edit-advanced]");
	detailEditAdvancedSectionEl = detailOverlayEl.querySelector(".calendar-detail-edit-advanced");
	detailEditSaveButtonEl = detailOverlayEl.querySelector("[data-action='save-edit-detail']");
	detailEditFormCancelButtonEl = detailOverlayEl.querySelector("[data-action='cancel-edit-form']");
	detailListSummaryEl = detailOverlayEl.querySelector("[data-detail-list-summary]");

	detailEditButton?.addEventListener("click", () => {
		const target = resolveOccurrenceMutationTarget(activeDetailEvent);
		if (!target) {
			window.alert("Unable to resolve occurrence target for edit.");
			return;
		}
		showDetailEditForm(activeDetailEvent);
	});

	detailEditSaveButtonEl?.addEventListener("click", () => {
		const target = resolveOccurrenceMutationTarget(activeDetailEvent);
		if (!target) {
			window.alert("Unable to resolve occurrence target for edit.");
			return;
		}
		const baseline = detailEditBaseline ?? resolveOccurrenceEditDefaults(activeDetailEvent);

		const changes = {};
		const titleInput = normalizeOptionalTextInput(detailEditTitleInputEl?.value);
		if (titleInput && titleInput !== baseline.title) {
			changes.title = titleInput;
		}
		const occursAtInputRaw = String(detailEditOccursAtInputEl?.value ?? "").trim();
		const occursAtInputIso = dateTimeLocalInputToIso(occursAtInputRaw);
		if (occursAtInputRaw && !occursAtInputIso) {
			window.alert("Invalid occurs_at value. Please use a valid date/time.");
			return;
		}
		if (occursAtInputIso) {
			const baselineOccursAtTs = Date.parse(String(baseline.occursAt ?? ""));
			const inputOccursAtTs = Date.parse(occursAtInputIso);
			if (
				Number.isNaN(baselineOccursAtTs) ||
				Number.isNaN(inputOccursAtTs) ||
				baselineOccursAtTs !== inputOccursAtTs
			) {
				changes.occurs_at = occursAtInputIso;
			}
		}

		const categoryInput = normalizeOptionalTextInput(detailEditCategoryInputEl?.value);
		if ((categoryInput ?? null) !== (baseline.category ?? null)) {
			changes.category = categoryInput;
		}

		const commonLanguageInput = normalizeOptionalTextInput(detailEditCommonLanguageInputEl?.value);
		if ((commonLanguageInput ?? null) !== (baseline.commonLanguage ?? null)) {
			changes.common_language = commonLanguageInput;
		}

		const urgencyInput = normalizeUrgencyInput(detailEditUrgencySelectEl?.value, "normal");
		if (urgencyInput !== normalizeUrgencyInput(baseline.urgency, "normal")) {
			changes.urgency = urgencyInput;
		}

		const durationInput = parseNonNegativeIntegerInput(detailEditDurationInputEl?.value, null);
		if (durationInput !== null && durationInput !== Number(baseline.durationMinutes ?? 0)) {
			changes.duration_minutes = durationInput;
		}

		const showBeforeInput = parseNonNegativeIntegerInput(detailEditShowBeforeInputEl?.value, null);
		if (
			showBeforeInput !== null &&
			showBeforeInput !== Number(baseline.showBeforeMinutes ?? 0)
		) {
			changes.show_before_minutes = showBeforeInput;
		}

		const notifyOffsetsInput = normalizeOffsetArrayForEdit(detailEditNotifyOffsetsInputEl?.value);
		if (!arraysEqualNumbers(notifyOffsetsInput, baseline.notifyOffsets ?? [])) {
			changes.notify_offsets_min = notifyOffsetsInput;
		}

		const mutedOffsetsInput = normalizeOffsetArrayForEdit(detailEditMutedOffsetsInputEl?.value);
		if (!arraysEqualNumbers(mutedOffsetsInput, baseline.mutedOffsets ?? [])) {
			changes.muted_offsets_min = mutedOffsetsInput;
		}

		const tzInput = normalizeOptionalTextInput(detailEditTzInputEl?.value);
		if (tzInput && tzInput !== baseline.tz) {
			changes.tz = tzInput;
		}

		const rruleInput = normalizeOptionalTextInput(detailEditRruleInputEl?.value);
		if (
			normalizeRRuleForComparison(rruleInput) !==
			normalizeRRuleForComparison(baseline.rrule)
		) {
			changes.rrule = rruleInput;
		}

		const untilLocalInputRaw = String(detailEditUntilLocalInputEl?.value ?? "").trim();
		const untilLocalInputIso = dateTimeLocalInputToIso(untilLocalInputRaw);
		if (untilLocalInputRaw && !untilLocalInputIso) {
			window.alert("Invalid until_local value. Please use a valid date/time.");
			return;
		}
		const baselineUntilLocal = normalizeOptionalTextInput(baseline.untilLocal);
		if (!untilLocalInputRaw) {
			if (baselineUntilLocal) {
				changes.until_local = null;
			}
		} else if (untilLocalInputIso) {
			const baselineUntilTs = Date.parse(String(baselineUntilLocal ?? ""));
			const inputUntilTs = Date.parse(untilLocalInputIso);
			if (
				Number.isNaN(baselineUntilTs) ||
				Number.isNaN(inputUntilTs) ||
				baselineUntilTs !== inputUntilTs
			) {
				changes.until_local = untilLocalInputIso;
			}
		}

		const descriptionInput = normalizeOptionalTextInput(detailEditDescriptionInputEl?.value);
		if ((descriptionInput ?? null) !== (baseline.description ?? null)) {
			changes.description = descriptionInput;
		}

		const isAllDayInput = Boolean(detailEditAllDayCheckboxEl?.checked);
		if (isAllDayInput !== Boolean(baseline.isAllDay)) {
			changes.is_all_day = isAllDayInput;
		}

		const allDaySpanInput = parsePositiveIntegerInput(detailEditAllDaySpanInputEl?.value, null);
		if (
			allDaySpanInput !== null &&
			allDaySpanInput !== Number(baseline.allDaySpanDays ?? 1)
		) {
			changes.all_day_span_days = allDaySpanInput;
		}

		const advancedChangesInput = String(detailEditAdvancedInputEl?.value ?? "").trim();
		if (advancedChangesInput.length > 0) {
			let parsedAdvancedChanges = null;
			try {
				parsedAdvancedChanges = JSON.parse(advancedChangesInput);
			} catch {
				window.alert("Invalid JSON patch. Please provide a valid JSON object.");
				return;
			}
			if (
				!parsedAdvancedChanges ||
				typeof parsedAdvancedChanges !== "object" ||
				Array.isArray(parsedAdvancedChanges)
			) {
				window.alert("Advanced changes must be a JSON object.");
				return;
			}
			Object.assign(changes, parsedAdvancedChanges);
		}

		if (Object.keys(changes).length === 0) {
			window.alert("No changes provided.");
			return;
		}

		const applyScope = normalizeApplyScopeValue(detailApplyScopeEl?.value ?? "single");
		const payload = {
			...target,
			changes,
			apply_scope: applyScope,
			include_customized: Boolean(detailIncludeCustomizedEl?.checked),
		};
		if (applyScope !== "single") {
			const expectedSourceRev = resolveExpectedSourceRev(activeDetailEvent);
			if (expectedSourceRev !== null) {
				payload.expected_source_rev = expectedSourceRev;
			}
		}
		sendOccurrenceMutation("occurrence-edit", payload, {
			allowConflictRetry: applyScope === "following" || applyScope === "all",
			eventMeta: activeDetailEvent?.actionMeta ?? null,
		});
		closeDetailOverlay();
	});

	detailEditFormCancelButtonEl?.addEventListener("click", () => {
		hideDetailEditForm();
	});

	detailCancelButton?.addEventListener("click", () => {
		const target = resolveOccurrenceMutationTarget(activeDetailEvent);
		if (!target) {
			window.alert("Unable to resolve occurrence target for cancel.");
			return;
		}
		const applyScope = normalizeApplyScopeValue(detailApplyScopeEl?.value ?? "single");

		const payload = {
			...target,
			apply_scope: applyScope,
			include_customized: Boolean(detailIncludeCustomizedEl?.checked),
		};
		sendOccurrenceMutation("occurrence-cancel", payload, {
			allowConflictRetry: false,
			eventMeta: activeDetailEvent?.actionMeta ?? null,
		});
		closeDetailOverlay();
	});

	detailDeleteButton?.addEventListener("click", () => {
		const target = resolveOccurrenceMutationTarget(activeDetailEvent);
		if (!target) {
			window.alert("Unable to resolve occurrence target for delete.");
			return;
		}
		const applyScope = normalizeApplyScopeValue(detailApplyScopeEl?.value ?? "single");

		const payload = {
			...target,
			apply_scope: applyScope,
			include_customized: Boolean(detailIncludeCustomizedEl?.checked),
		};
		sendOccurrenceMutation("occurrence-delete", payload, {
			allowConflictRetry: false,
			eventMeta: activeDetailEvent?.actionMeta ?? null,
		});
		closeDetailOverlay();
	});

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
	activeDetailEvent = event ?? null;
	hideDetailEditForm();
	const mutationTarget = resolveOccurrenceMutationTarget(event);
	const hasMutationTarget = Boolean(mutationTarget);
	const canUseSeriesScope = hasMutationTarget && eventSupportsSeriesApplyScope(event);
	const hasDirectOccurrenceId = Boolean(mutationTarget?.occurrence_id);
	const projectedTooltip =
		"This is a projected occurrence. Action will target schedule_id + anchor_occurs_at.";
	if (detailApplyScopeEl) {
		detailApplyScopeEl.value = "single";
		detailApplyScopeEl.disabled = !hasMutationTarget;
	}
	syncDetailApplyScopeOptions(canUseSeriesScope);
	if (detailIncludeCustomizedEl) {
		detailIncludeCustomizedEl.checked = false;
		detailIncludeCustomizedEl.disabled = !hasMutationTarget || !canUseSeriesScope;
	}
	if (detailEditButton) {
		detailEditButton.disabled = !hasMutationTarget;
		detailEditButton.title = !hasMutationTarget
			? "This item cannot be edited yet."
			: hasDirectOccurrenceId
				? "Edit this occurrence"
				: projectedTooltip;
	}
	if (detailCancelButton) {
		detailCancelButton.disabled = !hasMutationTarget;
		detailCancelButton.title = !hasMutationTarget
			? "This item cannot be canceled yet."
			: hasDirectOccurrenceId
				? "Cancel this occurrence"
				: projectedTooltip;
	}
	if (detailDeleteButton) {
		detailDeleteButton.disabled = !hasMutationTarget;
		detailDeleteButton.title = !hasMutationTarget
			? "This item cannot be deleted yet."
			: hasDirectOccurrenceId
				? "Delete this occurrence"
				: projectedTooltip;
	}

	detailTitleEl.textContent = event.title ?? "Untitled event";
	detailTimeEl.textContent = event?.isAllDay
		? formatAllDayLabel(event)
		: event.start
			? formatEventDate(event.start)
			: "Time unknown";
	detailTypeEl.textContent = `Type: ${capitalizeWord(event.type || "schedule")}`;
	const eventState = String(
		event?.state ??
			event?.occurrence?.state ??
			event?.occurrence?.State ??
			"planned",
	)
		.toLowerCase()
		.trim();
	if (eventState) {
		detailTypeEl.textContent = `${detailTypeEl.textContent} • State: ${capitalizeWord(eventState)}`;
	}
	const scheduleTitle = event.schedule?.title ?? event.schedule?.name ?? "—";
	detailScheduleEl.textContent = `Schedule: ${scheduleTitle}`;
	detailDescriptionEl.textContent =
		event?.occurrence?.description ??
		event?.payload?.description ??
		event.schedule?.description ??
		event.schedule?.summary ??
		"No additional details";
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

	// List summary integration
	if (detailListSummaryEl) {
		detailListSummaryEl.innerHTML = "";
		// Clean up previous listener
		if (detailListsDataListener) {
			ipcRenderer.removeListener("lists-data", detailListsDataListener);
			detailListsDataListener = null;
		}
		const occurrenceId = extractNullableStringValue(
			event?.occurrence?.id ?? event?.occurrence?.occurrence_id ?? event?.occurrence?.OccurrenceID ?? null
		);
		if (occurrenceId) {
			const listTarget = { kind: "occurrence", id: occurrenceId };
			detailListsDataListener = (_, payload) => {
				if (!payload?.target || payload.target.kind !== "occurrence" || payload.target.id !== occurrenceId) return;
				detailListSummaryEl.innerHTML = "";
				const summary = renderListSummary({
					lists: payload.lists ?? [],
					target: listTarget,
				});
				detailListSummaryEl.appendChild(summary);
			};
			ipcRenderer.on("lists-data", detailListsDataListener);
			ipcRenderer.send("lists-fetch", { target: listTarget });
		}
	}

	detailOverlayEl.classList.remove("hidden");
}

function closeDetailOverlay() {
	activeDetailEvent = null;
	hideDetailEditForm();
	if (detailListsDataListener) {
		ipcRenderer.removeListener("lists-data", detailListsDataListener);
		detailListsDataListener = null;
	}
	ipcRenderer.send("lists-unsubscribe");
	if (detailListSummaryEl) {
		detailListSummaryEl.innerHTML = "";
	}
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
const ALL_DAY_LANE_HEIGHT = 28;
const START_HOUR = 0;
const END_HOUR = 24;

const formatDateKey = (date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const detectLocalTimeZone = () => {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (typeof zone === "string" && zone.trim()) return zone.trim();
	} catch {
		// Ignore and fallback.
	}
	return "UTC";
};

const resolveScheduleId = (schedule) =>
	extractNullableStringValue(
		schedule?.id ??
			schedule?.schedule_id ??
			schedule?.scheduleId ??
			schedule?.ID ??
			schedule?.ScheduleID,
	);

const resolveScheduleSeriesUuid = (schedule) =>
	extractNullableStringValue(
		schedule?.series_uuid ?? schedule?.seriesUuid ?? schedule?.SeriesUUID,
	);

const resolveScheduleTimeZone = (schedule) =>
	extractNullableStringValue(schedule?.tz ?? schedule?.TZ ?? schedule?.TimeZone) ??
	detectLocalTimeZone();

const resolveScheduleRev = (schedule) => {
	const rev = extractNullableNumberValue(
		schedule?.rev ?? schedule?.Rev,
		Number.NaN,
	);
	if (Number.isFinite(rev) && rev >= 0) return Math.round(rev);
	return null;
};

const resolveScheduleUntilLocal = (schedule) =>
	extractNullableTimeValue(
		schedule?.until_local ??
			schedule?.untilLocal ??
			schedule?.UntilLocal ??
			schedule?.end_local ??
			schedule?.endLocal ??
			schedule?.end,
	);

const resolveScheduleActive = (schedule) =>
	extractNullableBooleanValue(
		schedule?.active ??
			schedule?.is_active ??
			schedule?.isActive ??
			schedule?.Active ??
			schedule?.IsActive,
		true,
	);

const buildSeriesInstanceKey = (seriesUuid, instanceKey) => {
	const normalizedSeries = extractNullableStringValue(seriesUuid);
	const normalizedInstance = extractNullableStringValue(instanceKey);
	if (!normalizedSeries || !normalizedInstance) return null;
	return `${normalizedSeries}::${normalizedInstance}`;
};

const getTimePartsInZone = (date, timeZone) => {
	const subject = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(subject.getTime())) return null;
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: timeZone || detectLocalTimeZone(),
			hour12: false,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		const parts = formatter.formatToParts(subject);
		const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
		const year = read("year");
		const month = read("month");
		const day = read("day");
		let hour = read("hour");
		const minute = read("minute");
		const second = read("second");
		if (hour === "24") hour = "00";
		if (!year || !month || !day || !hour || !minute || !second) return null;
		return { year, month, day, hour, minute, second };
	} catch {
		return null;
	}
};

const getTimeZoneOffsetMs = (date, timeZone) => {
	const parts = getTimePartsInZone(date, timeZone);
	if (!parts) return null;
	const asUtcMs = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
		0,
	);
	return asUtcMs - date.getTime();
};

const zonedDateTimePartsToUtcDate = (parts, timeZone) => {
	if (!parts || !timeZone) return null;
	const year = Number(parts.year);
	const month = Number(parts.month);
	const day = Number(parts.day);
	const hour = Number(parts.hour);
	const minute = Number(parts.minute);
	const second = Number(parts.second);
	if (
		[year, month, day, hour, minute, second].some((value) => !Number.isFinite(value))
	) {
		return null;
	}

	const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
	let timestamp = localAsUtcMs;
	for (let step = 0; step < 5; step += 1) {
		const offset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);
		if (!Number.isFinite(offset)) break;
		const candidate = localAsUtcMs - offset;
		if (candidate === timestamp) break;
		timestamp = candidate;
	}
	const resolved = new Date(timestamp);
	return Number.isNaN(resolved.getTime()) ? null : resolved;
};

const buildAnchorOccursAtUtcIso = ({ occursAt, timeZone }) => {
	const baseDate = occursAt instanceof Date ? occursAt : new Date(occursAt);
	if (Number.isNaN(baseDate.getTime())) return null;
	const zone = String(timeZone ?? "").trim() || detectLocalTimeZone();
	const parts = getTimePartsInZone(baseDate, zone);
	const resolved = zonedDateTimePartsToUtcDate(parts, zone);
	return resolved ? resolved.toISOString() : baseDate.toISOString();
};

const buildInstanceKeyFromDate = ({
	occursAt,
	timeZone,
	isAllDay = false,
} = {}) => {
	const parts = getTimePartsInZone(occursAt, timeZone);
	if (!parts) return null;
	if (isAllDay) {
		return `${parts.year}${parts.month}${parts.day}`;
	}
	return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
};

const parseDeletedOccurrenceKeys = (payload = {}) => {
	let keys =
		payload?.deleted_occurrence_keys ??
		payload?.deletedOccurrenceKeys ??
		payload?.DeletedOccurrenceKeys ??
		[];
	if (typeof keys === "string") {
		try {
			keys = JSON.parse(keys);
		} catch {
			keys = [];
		}
	}
	if (!Array.isArray(keys)) return new Set();
	return new Set(
		keys
			.map((key) => (typeof key === "string" ? key.trim() : ""))
			.filter(Boolean),
	);
};

const resolveOccurrenceStableKey = ({
	occurrence,
	schedule,
	occursDate,
	isAllDay = false,
} = {}) => {
	const seriesUuid =
		extractNullableStringValue(
			occurrence?.series_uuid ??
				occurrence?.seriesUuid ??
				occurrence?.SeriesUUID,
		) ?? resolveScheduleSeriesUuid(schedule);
	const instanceKey =
		extractNullableStringValue(
			occurrence?.instance_key ??
				occurrence?.instanceKey ??
				occurrence?.InstanceKey,
		) ??
		buildInstanceKeyFromDate({
			occursAt: occursDate,
			timeZone: resolveScheduleTimeZone(schedule),
			isAllDay,
		});
	return buildSeriesInstanceKey(seriesUuid, instanceKey);
};

const resolveSourceRev = (occurrence) => {
	const rev = extractNullableNumberValue(
		occurrence?.source_rev ?? occurrence?.sourceRev ?? occurrence?.SourceRev,
		Number.NaN,
	);
	if (Number.isFinite(rev) && rev >= 0) return Math.round(rev);
	return null;
};

const buildActionMeta = ({
	occurrenceId = null,
	scheduleId,
	seriesUuid,
	anchorOccursAtUtc,
	scheduleTimeZone,
	sourceRev = null,
} = {}) => {
	const normalizedScheduleId = extractNullableStringValue(scheduleId);
	const normalizedSeriesUuid = extractNullableStringValue(seriesUuid);
	const normalizedAnchor = extractNullableStringValue(anchorOccursAtUtc);
	const normalizedTz = String(scheduleTimeZone ?? "").trim() || detectLocalTimeZone();
	const normalizedOccurrenceId = extractNullableStringValue(occurrenceId);
	const normalizedSourceRev = extractNullableNumberValue(sourceRev, Number.NaN);
	if (!normalizedScheduleId || !normalizedSeriesUuid || !normalizedAnchor) {
		return null;
	}
	if (!isRfc3339Timestamp(normalizedAnchor)) {
		return null;
	}

	const meta = {
		schedule_id: String(normalizedScheduleId),
		series_uuid: String(normalizedSeriesUuid),
		anchor_occurs_at_utc: normalizedAnchor,
		schedule_tz: normalizedTz,
	};
	if (normalizedOccurrenceId) {
		meta.occurrence_id = String(normalizedOccurrenceId);
	}
	if (Number.isFinite(normalizedSourceRev) && normalizedSourceRev >= 0) {
		meta.source_rev = Math.round(normalizedSourceRev);
	}
	return Object.freeze(meta);
};

const findOccurrenceForMutation = (occurrences = [], mutationPayload = {}) => {
	if (!Array.isArray(occurrences) || !mutationPayload) return null;
	const targetOccurrenceId = extractNullableStringValue(mutationPayload.occurrence_id);
	if (targetOccurrenceId) {
		return (
			occurrences.find((item) => {
				const itemId = extractNullableStringValue(
					item?.id ?? item?.occurrence_id ?? item?.OccurrenceID,
				);
				return itemId === targetOccurrenceId;
			}) ?? null
		);
	}

	const targetScheduleId = extractNullableStringValue(mutationPayload.schedule_id);
	const targetAnchor = extractNullableStringValue(mutationPayload.anchor_occurs_at);
	if (!targetScheduleId || !targetAnchor) return null;
	const anchorTs = Date.parse(targetAnchor);
	if (Number.isNaN(anchorTs)) return null;

	return (
		occurrences.find((item) => {
			const scheduleId = extractNullableStringValue(
				item?.schedule_id ?? item?.scheduleId ?? item?.ScheduleID,
			);
			if (scheduleId !== targetScheduleId) return false;
			const occursAt = extractNullableStringValue(
				item?.occurs_at ?? item?.occursAt ?? item?.OccursAt,
			);
			if (!occursAt) return false;
			const occursAtTs = Date.parse(occursAt);
			if (Number.isNaN(occursAtTs)) return false;
			return occursAtTs === anchorTs;
		}) ?? null
	);
};

const findOccurrenceForAnchorRetry = (occurrences = [], pendingMutation = null) => {
	if (!Array.isArray(occurrences) || !pendingMutation?.payload) return null;
	const payload = pendingMutation.payload;
	const targetOccurrenceId = extractNullableStringValue(payload.occurrence_id);
	if (targetOccurrenceId) {
		return (
			occurrences.find((item) => {
				const itemId = extractNullableStringValue(
					item?.id ?? item?.occurrence_id ?? item?.OccurrenceID,
				);
				return itemId === targetOccurrenceId;
			}) ?? null
		);
	}

	const targetAnchor = extractNullableStringValue(payload.anchor_occurs_at);
	if (!targetAnchor) return null;
	const targetAnchorTs = Date.parse(targetAnchor);
	if (Number.isNaN(targetAnchorTs)) return null;

	const actionMeta =
		pendingMutation?.eventMeta && typeof pendingMutation.eventMeta === "object"
			? pendingMutation.eventMeta
			: null;
	const seriesUuid = extractNullableStringValue(actionMeta?.series_uuid);
	if (seriesUuid) {
		const exactSeriesMatch = occurrences.find((item) => {
			const itemSeriesUuid = extractNullableStringValue(
				item?.series_uuid ?? item?.seriesUuid ?? item?.SeriesUUID,
			);
			if (itemSeriesUuid !== seriesUuid) return false;
			const occursAt = extractNullableStringValue(
				item?.occurs_at ?? item?.occursAt ?? item?.OccursAt,
			);
			const occursAtTs = Date.parse(String(occursAt ?? ""));
			return !Number.isNaN(occursAtTs) && occursAtTs === targetAnchorTs;
		});
		if (exactSeriesMatch) return exactSeriesMatch;
	}

	const targetScheduleId = extractNullableStringValue(payload.schedule_id);
	if (targetScheduleId) {
		const exactScheduleMatch = occurrences.find((item) => {
			const itemScheduleId = extractNullableStringValue(
				item?.schedule_id ?? item?.scheduleId ?? item?.ScheduleID,
			);
			if (itemScheduleId !== targetScheduleId) return false;
			const occursAt = extractNullableStringValue(
				item?.occurs_at ?? item?.occursAt ?? item?.OccursAt,
			);
			const occursAtTs = Date.parse(String(occursAt ?? ""));
			return !Number.isNaN(occursAtTs) && occursAtTs === targetAnchorTs;
		});
		if (exactScheduleMatch) return exactScheduleMatch;
	}

	return null;
};

const findScheduleById = (schedules = [], scheduleId) => {
	const normalizedScheduleId = extractNullableStringValue(scheduleId);
	if (!Array.isArray(schedules) || !normalizedScheduleId) return null;
	return (
		schedules.find((schedule) => {
			const candidateId = extractNullableStringValue(
				schedule?.id ??
					schedule?.schedule_id ??
					schedule?.scheduleId ??
					schedule?.ID ??
					schedule?.ScheduleID,
			);
			return candidateId === normalizedScheduleId;
		}) ?? null
	);
};

const sendOccurrenceMutation = (channel, payload, options = {}) => {
	const normalizedPayload =
		payload && typeof payload === "object" ? { ...payload } : {};
	const allowConflictRetry = Boolean(options?.allowConflictRetry);
	const eventMeta =
		options?.eventMeta && typeof options.eventMeta === "object"
			? { ...options.eventMeta }
			: null;
	const mutation = {
		channel,
		payload: normalizedPayload,
		allowConflictRetry,
		eventMeta,
		retryCount: 0,
		createdAt: Date.now(),
	};
	state.pendingMutation = mutation;
	ipcRenderer.send(channel, normalizedPayload);
};

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

function getStartOfDay(date) {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

function getCurrentCalendarFilters() {
	const settings = state.userSettings ?? {};
	const filters = settings.calendar_filters;
	if (filters && typeof filters === "object") {
		return normalizeCalendarFilters(filters, cloneDefaultCalendarFilters());
	}
	return cloneDefaultCalendarFilters();
}

function getHiddenFilterSets() {
	const filters = getCurrentCalendarFilters();
	return {
		hiddenKinds: new Set(filters.hidden_kinds ?? []),
		hiddenStates: new Set(filters.hidden_states ?? []),
		hiddenScheduleIds: new Set(filters.hidden_schedule_ids ?? []),
	};
}

function updateFilterUpdatedAtLabel() {
	if (!filterUpdatedAtEl) return;
	const updatedAt = extractNullableTimeValue(
		state.userSettings?.updated_at ?? state.userSettings?.updatedAt,
	);
	if (!updatedAt) {
		filterUpdatedAtEl.textContent = "Settings not synced yet";
		return;
	}
	filterUpdatedAtEl.textContent = `Updated ${formatDetailDate(updatedAt)}`;
}

function syncFilterInputsFromState() {
	const { hiddenKinds, hiddenStates } = getHiddenFilterSets();
	if (hidePastOccurrencesInputEl) {
		hidePastOccurrencesInputEl.checked = Boolean(state.hidePastOccurrences);
	}
	document.querySelectorAll("[data-filter-kind]").forEach((input) => {
		const value = String(input?.dataset?.filterKind ?? "").toLowerCase().trim();
		input.checked = value ? hiddenKinds.has(value) : false;
	});
	document.querySelectorAll("[data-filter-state]").forEach((input) => {
		const value = String(input?.dataset?.filterState ?? "").toLowerCase().trim();
		input.checked = value ? hiddenStates.has(value) : false;
	});
	updateFilterUpdatedAtLabel();
}

function listRenderableSchedules(schedules = [], occurrences = []) {
	const intervalStart = getStartOfDay(state.currentWeekStart);
	const intervalEnd = new Date(intervalStart);
	intervalEnd.setDate(intervalEnd.getDate() + 6);
	intervalEnd.setHours(23, 59, 59, 999);
	const intervalStartTs = intervalStart.getTime();
	const intervalEndTs = intervalEnd.getTime();

	const optionsById = new Map();
	const occurrenceScheduleIdsInRange = new Set();
	const occurrenceTitleByScheduleId = new Map();
	const scheduleById = new Map();
	const upsertOption = (id, title) => {
		if (!id) return;
		const normalizedId = String(id).trim().toLowerCase();
		if (!normalizedId) return;
		const normalizedTitle = String(title ?? "").trim();
		const existing = optionsById.get(normalizedId);
		if (!existing) {
			optionsById.set(normalizedId, {
				id: normalizedId,
				title: normalizedTitle || `Schedule ${normalizedId.slice(0, 8)}`,
			});
			return;
		}
		if (normalizedTitle && existing.title.startsWith("Schedule ")) {
			existing.title = normalizedTitle;
		}
	};

	(Array.isArray(occurrences) ? occurrences : []).forEach((occurrence) => {
		const occurrenceScheduleId = extractNullableStringValue(
			occurrence?.schedule_id ?? occurrence?.scheduleId ?? occurrence?.ScheduleID,
		);
		if (!occurrenceScheduleId) return;
		const occursAt = extractNullableTimeValue(
			occurrence?.occurs_at ?? occurrence?.occursAt ?? occurrence?.OccursAt,
		);
		const occursAtTs = Date.parse(String(occursAt ?? ""));
		if (Number.isNaN(occursAtTs) || occursAtTs < intervalStartTs || occursAtTs > intervalEndTs) {
			return;
		}
		const normalizedScheduleId = String(occurrenceScheduleId).trim().toLowerCase();
		if (!normalizedScheduleId) return;
		occurrenceScheduleIdsInRange.add(normalizedScheduleId);
		const occurrenceTitle = extractNullableStringValue(
			occurrence?.title ??
				occurrence?.name ??
				occurrence?.summary ??
				occurrence?.payload?.title,
		);
		if (occurrenceTitle && !occurrenceTitleByScheduleId.has(normalizedScheduleId)) {
			occurrenceTitleByScheduleId.set(normalizedScheduleId, occurrenceTitle);
		}
	});

	(Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
		const deletedAt = extractNullableTimeValue(
			schedule?.deleted_at ?? schedule?.deletedAt ?? schedule?.DeletedAt,
		);
		if (deletedAt) return;
		const scheduleId = resolveScheduleId(schedule);
		if (!scheduleId) return;
		const normalizedScheduleId = String(scheduleId).trim().toLowerCase();
		if (!normalizedScheduleId) return;
		scheduleById.set(normalizedScheduleId, schedule);
	});

	scheduleById.forEach((schedule, normalizedScheduleId) => {
		const hasRealOccurrence = occurrenceScheduleIdsInRange.has(normalizedScheduleId);
		const hasVirtualOccurrence = buildOccurrenceDatesForSchedule(
			schedule,
			intervalStart,
			intervalEnd,
		).length > 0;
		if (!hasRealOccurrence && !hasVirtualOccurrence) return;
		upsertOption(normalizedScheduleId, resolveScheduleTitle(schedule));
	});

	occurrenceScheduleIdsInRange.forEach((normalizedScheduleId) => {
		if (optionsById.has(normalizedScheduleId)) return;
		upsertOption(
			normalizedScheduleId,
			occurrenceTitleByScheduleId.get(normalizedScheduleId) ?? null,
		);
	});

	return [...optionsById.values()].sort((left, right) =>
		left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
	);
}

function renderScheduleFilterOptions(schedules = [], occurrences = []) {
	if (!filterScheduleListEl) return;
	const { hiddenScheduleIds } = getHiddenFilterSets();
	const options = listRenderableSchedules(schedules, occurrences);
	filterScheduleListEl.innerHTML = "";
	if (options.length === 0) {
		const empty = document.createElement("div");
		empty.className = "calendar-filters-empty";
		empty.textContent = "No schedules in this window.";
		filterScheduleListEl.appendChild(empty);
		return;
	}

	options.forEach((option) => {
		const label = document.createElement("label");
		label.className = "calendar-filter-option";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = hiddenScheduleIds.has(option.id);
		input.dataset.filterScheduleId = option.id;
		input.addEventListener("change", () => {
			const next = new Set(getCurrentCalendarFilters().hidden_schedule_ids ?? []);
			if (input.checked) {
				next.add(option.id);
			} else {
				next.delete(option.id);
			}
			updateCalendarFilters({
				hidden_schedule_ids: [...next],
			});
		});
		const text = document.createElement("span");
		text.textContent = option.title;
		label.appendChild(input);
		label.appendChild(text);
		filterScheduleListEl.appendChild(label);
	});
}

function applyUserSettings(payload, { rerender = true } = {}) {
	state.userSettings = normalizeUserSettings(payload, state.userSettings);
	if (state.lastCalendarPayload) {
		state.lastCalendarPayload = {
			...state.lastCalendarPayload,
			user_settings: state.userSettings,
		};
	}
	syncFilterInputsFromState();
	renderScheduleFilterOptions(
		state.lastCalendarPayload?.schedules ?? [],
		state.lastCalendarPayload?.occurrences ?? [],
	);
	if (rerender && state.lastCalendarPayload) {
		renderCalendarData(state.lastCalendarPayload);
	}
}

function updateCalendarFilters(patchPayload) {
	const patch = normalizeCalendarFilterPatch({
		calendar_filters: patchPayload,
	});
	if (Object.keys(patch).length === 0) return;
	const optimisticSettings = normalizeUserSettings(
		{
			calendar_filters: {
				...getCurrentCalendarFilters(),
				...patch,
			},
			updated_at: state.userSettings?.updated_at ?? null,
		},
		state.userSettings,
	);
	state.userSettings = optimisticSettings;
	if (state.lastCalendarPayload) {
		state.lastCalendarPayload = {
			...state.lastCalendarPayload,
			user_settings: optimisticSettings,
		};
	}
	syncFilterInputsFromState();
	renderScheduleFilterOptions(
		state.lastCalendarPayload?.schedules ?? [],
		state.lastCalendarPayload?.occurrences ?? [],
	);
	if (state.lastCalendarPayload) {
		renderCalendarData(state.lastCalendarPayload);
	}
	ipcRenderer.send("user-settings-update", {
		calendar_filters: patch,
	});
}

function initFilterControls() {
	hidePastOccurrencesInputEl?.addEventListener("change", () => {
		state.hidePastOccurrences = Boolean(hidePastOccurrencesInputEl.checked);
		if (state.lastCalendarPayload) {
			renderCalendarData(state.lastCalendarPayload);
		}
	});

	document.querySelectorAll("[data-filter-kind]").forEach((input) => {
		input.addEventListener("change", () => {
			const value = String(input?.dataset?.filterKind ?? "").toLowerCase().trim();
			if (!VALID_FILTER_KINDS.has(value)) return;
			const next = new Set(getCurrentCalendarFilters().hidden_kinds ?? []);
			if (input.checked) {
				next.add(value);
			} else {
				next.delete(value);
			}
			updateCalendarFilters({
				hidden_kinds: [...next],
			});
		});
	});

	document.querySelectorAll("[data-filter-state]").forEach((input) => {
		input.addEventListener("change", () => {
			const value = String(input?.dataset?.filterState ?? "").toLowerCase().trim();
			if (!VALID_FILTER_STATES.has(value)) return;
			const next = new Set(getCurrentCalendarFilters().hidden_states ?? []);
			if (input.checked) {
				next.add(value);
			} else {
				next.delete(value);
			}
			updateCalendarFilters({
				hidden_states: [...next],
			});
		});
	});

	clearHiddenSchedulesButtonEl?.addEventListener("click", () => {
		updateCalendarFilters({
			hidden_schedule_ids: [],
		});
	});

	if (filterDetailsEl) {
		document.addEventListener("click", (event) => {
			if (!filterDetailsEl.open) return;
			if (filterDetailsEl.contains(event.target)) return;
			filterDetailsEl.open = false;
		});
	}

	syncFilterInputsFromState();
}

function getVisibilityFiltersForCurrentWeek() {
	const filterSets = getHiddenFilterSets();
	if (!state.hidePastOccurrences) {
		return {
			minTimedTimestamp: null,
			minAllDayDayTimestamp: null,
			plannedOnly: SHOW_ONLY_PLANNED_OCCURRENCES,
			hiddenKinds: filterSets.hiddenKinds,
			hiddenStates: filterSets.hiddenStates,
			hiddenScheduleIds: filterSets.hiddenScheduleIds,
		};
	}

	const now = new Date();
	const weekStart = getStartOfDay(state.currentWeekStart);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);
	const isCurrentWeek = now >= weekStart && now <= weekEnd;
	if (!isCurrentWeek) {
		return {
			minTimedTimestamp: null,
			minAllDayDayTimestamp: null,
			plannedOnly: SHOW_ONLY_PLANNED_OCCURRENCES,
			hiddenKinds: filterSets.hiddenKinds,
			hiddenStates: filterSets.hiddenStates,
			hiddenScheduleIds: filterSets.hiddenScheduleIds,
		};
	}

	return {
		minTimedTimestamp: now.getTime(),
		minAllDayDayTimestamp: getStartOfDay(now).getTime(),
		plannedOnly: SHOW_ONLY_PLANNED_OCCURRENCES,
		hiddenKinds: filterSets.hiddenKinds,
		hiddenStates: filterSets.hiddenStates,
		hiddenScheduleIds: filterSets.hiddenScheduleIds,
	};
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
	const allDaySlot = document.createElement("div");
	allDaySlot.className = "time-slot-label time-slot-label--all-day";
	allDaySlot.innerHTML = "<span>All-day</span>";
	timeGutter.appendChild(allDaySlot);

	for (let i = START_HOUR; i < END_HOUR; i++) {
		const slot = document.createElement("div");
		slot.className = "time-slot-label";
		slot.innerHTML = `<span>${pad(i)}:00</span>`;
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

		const allDayLane = document.createElement("div");
		allDayLane.className = "all-day-lane";
		col.appendChild(allDayLane);

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
		body.scrollTop = ALL_DAY_LANE_HEIGHT + 8 * SLOT_HEIGHT;
	}
}

function updateTimeIndicator(el) {
	const now = new Date();
	const minutes = now.getHours() * 60 + now.getMinutes();
	const top = ALL_DAY_LANE_HEIGHT + (minutes / 60) * SLOT_HEIGHT;
	el.style.top = `${top}px`;

	// Log once per minute (approx) to avoid spam, or just rely on the interval
	if (!window.lastTimeLog || new Date() - window.lastTimeLog > 60000) {
		console.log(`[CalendarWindow] Time Indicator: ${now.toLocaleTimeString()} (${minutes} mins) -> ${top}px`);
		ipcRenderer.send("log", `[CalendarWindow] Time Indicator: ${now.toLocaleTimeString()} (${minutes} mins) -> ${top}px`);
		window.lastTimeLog = new Date();
	}
}

function groupOccurrences(payload, visibilityFilters = {}) {
	const occurrences = Array.isArray(payload?.occurrences) ? payload.occurrences : [];
	const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
	const minTimedTimestamp = Number.isFinite(visibilityFilters?.minTimedTimestamp)
		? visibilityFilters.minTimedTimestamp
		: null;
	const minAllDayDayTimestamp = Number.isFinite(visibilityFilters?.minAllDayDayTimestamp)
		? visibilityFilters.minAllDayDayTimestamp
		: null;
	const plannedOnly = Boolean(visibilityFilters?.plannedOnly);
	const hiddenKinds =
		visibilityFilters?.hiddenKinds instanceof Set
			? visibilityFilters.hiddenKinds
			: new Set();
	const hiddenStates =
		visibilityFilters?.hiddenStates instanceof Set
			? visibilityFilters.hiddenStates
			: new Set();
	const hiddenScheduleIds =
		visibilityFilters?.hiddenScheduleIds instanceof Set
			? visibilityFilters.hiddenScheduleIds
			: new Set();
	const scheduleMap = new Map(
		schedules
			.map((item) => {
				const rawId =
					item?.id ??
					item?.schedule_id ??
					item?.scheduleId ??
					item?.ID ??
					item?.ScheduleID ??
					null;
				const id = rawId ? String(rawId).trim().toLowerCase() : null;
				return id ? [id, item] : null;
			})
			.filter(Boolean),
	);
	const timedEventsByDate = new Map();
	const allDayEventsByDate = new Map();
	const realOccurrenceKeys = new Set();
	const seenRealOccurrenceKeys = new Set();

	const addTimedEvent = (dateKey, event) => {
		const bucket = timedEventsByDate.get(dateKey) ?? [];
		bucket.push(event);
		timedEventsByDate.set(dateKey, bucket);
	};

	const addAllDayEvent = (dateKey, event) => {
		const bucket = allDayEventsByDate.get(dateKey) ?? [];
		bucket.push(event);
		allDayEventsByDate.set(dateKey, bucket);
	};

	const orderedOccurrences = [...occurrences].sort((left, right) => {
		const rankState = (item) => {
			const stateText = String(
				extractNullableStringValue(item?.state ?? item?.State) ?? "",
			)
				.toLowerCase()
				.trim();
			if (stateText === "planned") return 2;
			if (stateText === "canceled") return 1;
			return 0;
		};
		const rightRank = rankState(right);
		const leftRank = rankState(left);
		if (rightRank !== leftRank) return rightRank - leftRank;
		const rightMutated = Date.parse(
			String(
				extractNullableTimeValue(
					right?.mutated_at ?? right?.mutatedAt ?? right?.MutatedAt,
				) ?? "",
			),
		);
		const leftMutated = Date.parse(
			String(
				extractNullableTimeValue(
					left?.mutated_at ?? left?.mutatedAt ?? left?.MutatedAt,
				) ?? "",
			),
		);
		const rightTs = Number.isNaN(rightMutated) ? Number.NEGATIVE_INFINITY : rightMutated;
		const leftTs = Number.isNaN(leftMutated) ? Number.NEGATIVE_INFINITY : leftMutated;
		return rightTs - leftTs;
	});

	orderedOccurrences.forEach((occurrence) => {
		const stateValue = String(
			extractNullableStringValue(occurrence?.state ?? occurrence?.State) ?? "",
		)
			.toLowerCase()
			.trim();
		const canceledAt = extractNullableTimeValue(
			occurrence?.canceled_at ?? occurrence?.canceledAt,
		);
		const normalizedState = stateValue || (canceledAt ? "canceled" : "planned");

		const occursAtValue = extractNullableTimeValue(
			occurrence?.occurs_at ?? occurrence?.occursAt,
		);
		if (!occursAtValue) return;
		const occursDate = new Date(occursAtValue);
		if (Number.isNaN(occursDate.getTime())) return;

		const scheduleId =
			occurrence?.schedule_id ??
			occurrence?.scheduleId ??
			occurrence?.ScheduleID ??
			null;
		const normalizedScheduleId = scheduleId
			? String(scheduleId).trim().toLowerCase()
			: null;
		if (normalizedScheduleId && hiddenScheduleIds.has(normalizedScheduleId)) return;
		const schedule = normalizedScheduleId
			? scheduleMap.get(normalizedScheduleId) ?? null
			: null;
		const occurrencePayload =
			occurrence?.payload &&
			typeof occurrence.payload === "object" &&
			!Array.isArray(occurrence.payload)
				? occurrence.payload
				: {};
		const scheduleTimeZone =
			extractNullableStringValue(
				occurrence?.tz ??
					occurrence?.TZ ??
					occurrencePayload?.tz ??
					occurrencePayload?.TZ,
			) ?? resolveScheduleTimeZone(schedule);
		const scheduleRev = resolveScheduleRev(schedule);

		const payloadKind = String(
			extractNullableStringValue(occurrencePayload.kind ?? occurrencePayload.type) ?? "",
		).toLowerCase();
		const occurrenceKind = String(
			extractNullableStringValue(occurrence?.kind ?? occurrence?.type) ?? payloadKind,
		).toLowerCase();
		const normalizedType = occurrenceKind === "task" ? "task" : "reminder";
		if (hiddenKinds.has(normalizedType)) return;
		const allDay =
			extractNullableBooleanValue(
				occurrence?.is_all_day ?? occurrence?.isAllDay,
				false,
			) ||
			extractNullableBooleanValue(
				occurrencePayload?.is_all_day ?? occurrencePayload?.isAllDay,
				false,
			) ||
			extractNullableBooleanValue(schedule?.is_all_day ?? schedule?.isAllDay, false);
		const stableKey = resolveOccurrenceStableKey({
			occurrence,
			schedule,
			occursDate,
			isAllDay: allDay,
		});
		if (stableKey) {
			if (seenRealOccurrenceKeys.has(stableKey)) {
				return;
			}
			seenRealOccurrenceKeys.add(stableKey);
			realOccurrenceKeys.add(stableKey);
		}

		if (plannedOnly) {
			if (normalizedState !== "planned") return;
			if (canceledAt) return;
		}
		if (hiddenStates.has(normalizedState)) {
			return;
		}
		const isCanceled = normalizedState === "canceled" || normalizedState === "deleted";
		if (!plannedOnly && isCanceled && !SHOW_CANCELED_OCCURRENCES) {
			return;
		}
		const isDimmed = normalizedState !== "planned";

		const eventTitle = resolveOccurrenceTitle(
			{
				...occurrencePayload,
				...occurrence,
			},
			schedule,
		);
		const commonLanguage =
			extractNullableStringValue(
				occurrence?.common_language ??
					occurrence?.commonLanguage ??
					occurrencePayload?.common_language ??
					occurrencePayload?.commonLanguage,
			) ?? null;
		if (allDay) {
			if (minAllDayDayTimestamp !== null) {
				const occurrenceDayTs = getStartOfDay(occursDate).getTime();
				if (occurrenceDayTs < minAllDayDayTimestamp) return;
			}
		} else if (minTimedTimestamp !== null && occursDate.getTime() < minTimedTimestamp) {
			return;
		}
		const allDaySpanDays = normalizeAllDaySpanDays(
			occurrence?.all_day_span_days ??
				occurrence?.allDaySpanDays ??
				occurrencePayload?.all_day_span_days ??
				occurrencePayload?.allDaySpanDays ??
				schedule?.all_day_span_days ??
				schedule?.allDaySpanDays,
			1,
		);
		const durationMinutes = resolveDurationMinutes({
			occurrence,
			occurrencePayload,
			schedule,
			normalizedType,
		});
		const occurrenceId = extractNullableStringValue(
			occurrence?.id ?? occurrence?.occurrence_id ?? occurrence?.OccurrenceID,
		);
		const resolvedScheduleId =
			extractNullableStringValue(scheduleId) ?? resolveScheduleId(schedule);
		const resolvedSeriesUuid =
			extractNullableStringValue(
				occurrence?.series_uuid ?? occurrence?.seriesUuid ?? occurrence?.SeriesUUID,
			) ?? resolveScheduleSeriesUuid(schedule);
		const anchorOccursAtUtc = occursDate.toISOString();
		const sourceRev =
			resolveSourceRev(occurrence) ?? scheduleRev;
		const actionMeta = buildActionMeta({
			occurrenceId,
			scheduleId: resolvedScheduleId,
			seriesUuid: resolvedSeriesUuid,
			anchorOccursAtUtc,
			scheduleTimeZone,
			sourceRev,
		});
		const baseEvent = {
			id:
				occurrence?.id ??
				occurrence?.occurrence_id ??
				`${scheduleId ?? "schedule"}-${occursDate.getTime()}`,
			title: eventTitle,
			timeText: occursDate.toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			}),
			schedule,
			occurrence,
			payload: occurrencePayload,
			type: normalizedType,
			timestamp: occursDate.getTime(),
			start: occursDate,
			duration: durationMinutes,
			commonLanguage,
			state: normalizedState,
			isCanceled,
			isDimmed,
			isAllDay: allDay,
			allDaySpanDays,
			scheduleKind: occurrenceKind,
			isVirtual: false,
			stableKey,
			sourceRev,
			schedule_id: resolvedScheduleId ?? null,
			series_uuid: resolvedSeriesUuid ?? null,
			occurs_at: anchorOccursAtUtc,
			actionMeta,
		};

		if (allDay) {
			for (let offset = 0; offset < allDaySpanDays; offset += 1) {
				const day = new Date(occursDate);
				day.setDate(day.getDate() + offset);
				addAllDayEvent(formatDateKey(day), {
					...baseEvent,
					spanOffset: offset,
				});
			}
			return;
		}

		addTimedEvent(formatDateKey(occursDate), baseEvent);
	});

	timedEventsByDate.forEach((bucket) => {
		bucket.sort((a, b) => a.start - b.start);
	});
	allDayEventsByDate.forEach((bucket) => {
		bucket.sort((a, b) => {
			if ((a.spanOffset ?? 0) !== (b.spanOffset ?? 0)) {
				return (a.spanOffset ?? 0) - (b.spanOffset ?? 0);
			}
			return a.start - b.start;
		});
	});

	return {
		timedEventsByDate,
		allDayEventsByDate,
		realOccurrenceKeys,
	};
}

const getWeekRange = (dates, { bufferDays = 0 } = {}) => {
	if (!dates?.length) return null;
	const start = new Date(dates[0]);
	start.setHours(0, 0, 0, 0);
	const end = new Date(dates[dates.length - 1]);
	end.setHours(23, 59, 59, 999);
	if (Number.isFinite(bufferDays) && bufferDays > 0) {
		start.setDate(start.getDate() - Math.round(bufferDays));
		end.setDate(end.getDate() + Math.round(bufferDays));
	}
	return { start, end };
};

const createEventsFromDates = (dates, schedule) => {
	if (!dates.length) return [];
	const scheduleId = resolveScheduleId(schedule);
	const scheduleSeriesUuid = resolveScheduleSeriesUuid(schedule);
	const scheduleTimeZone = resolveScheduleTimeZone(schedule);
	const scheduleRev = resolveScheduleRev(schedule);
	const title = resolveScheduleTitle(schedule);
	const rawKind =
		(schedule?.kind ?? schedule?.Kind ?? schedule?.type ?? schedule?.Type ?? "").toString().toLowerCase() ||
		null;
	const normalizedType = rawKind === "task" ? "task" : "reminder";
	const durationMinutes = resolveDurationMinutes({
		schedule,
		normalizedType,
	});
	const isAllDay = extractNullableBooleanValue(
		schedule?.is_all_day ?? schedule?.isAllDay,
		false,
	);
	const allDaySpanDays = normalizeAllDaySpanDays(
		schedule?.all_day_span_days ?? schedule?.allDaySpanDays,
		1,
	);

	return dates.map((date) => {
		const anchorOccursAtUtc = date instanceof Date ? date.toISOString() : null;
		const actionMeta = buildActionMeta({
			scheduleId,
			seriesUuid: scheduleSeriesUuid,
			anchorOccursAtUtc,
			scheduleTimeZone,
			sourceRev: scheduleRev,
		});
		return {
			id: `${scheduleId ?? "schedule"}-${date.getTime()}`,
			title,
			timeText: date.toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			}),
			schedule,
			type: normalizedType,
			scheduleKind: rawKind,
			timestamp: date.getTime(),
			start: date,
			duration: durationMinutes,
			isAllDay,
			allDaySpanDays,
			state: "planned",
			isCanceled: false,
			isDimmed: false,
			isVirtual: true,
			schedule_id: scheduleId ?? null,
			series_uuid: scheduleSeriesUuid,
			occurs_at: anchorOccursAtUtc,
			sourceRev: scheduleRev,
			actionMeta,
			stableKey: buildSeriesInstanceKey(
				scheduleSeriesUuid,
				buildInstanceKeyFromDate({
					occursAt: date,
					timeZone: scheduleTimeZone,
					isAllDay,
				}),
			),
		};
	});
};

const buildOccurrenceDatesForSchedule = (schedule, start, end) => {
	if (!schedule) return [];
	const dtstartRaw =
		schedule.start_local ?? schedule.startLocal ?? schedule.start ?? schedule.startTime ?? null;
	const dtstart = dtstartRaw ? new Date(dtstartRaw) : null;
	const ruleText = String(extractNullableStringValue(schedule.rrule) ?? "").trim();
	const untilLocalText = resolveScheduleUntilLocal(schedule);
	const untilLocalTs = untilLocalText ? Date.parse(untilLocalText) : Number.NaN;
	const isWithinUntil = (date) =>
		!Number.isFinite(untilLocalTs) || date.getTime() <= untilLocalTs;

	if (!ruleText) {
		if (!dtstart) return [];
		if (dtstart >= start && dtstart <= end && isWithinUntil(dtstart)) {
			return [dtstart];
		}
		return [];
	}

	try {
		const options = {
			tzid: resolveScheduleTimeZone(schedule),
		};
		if (dtstart) {
			options.dtstart = dtstart;
		}
		const rule = rrulestr(ruleText, options);
		return rule.between(start, end, true).filter((candidate) => {
			if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
				return false;
			}
			return isWithinUntil(candidate);
		});
	} catch (error) {
		console.warn("[calendar] rrule parsing error", error);
		if (dtstart && dtstart >= start && dtstart <= end && isWithinUntil(dtstart)) {
			return [dtstart];
		}
		return [];
	}
};

const mergeSchedulePredictions = (
	timedEventsByDate,
	allDayEventsByDate,
	schedules,
	weekRange,
	visibilityFilters = {},
	mergeState = {},
) => {
	if (!weekRange || !Array.isArray(schedules)) {
		console.log("[CalendarWindow] mergeSchedulePredictions: No schedules or week range");
		return;
	}
	const realOccurrenceKeys =
		mergeState?.realOccurrenceKeys instanceof Set
			? mergeState.realOccurrenceKeys
			: new Set();
	const deletedOccurrenceKeys =
		mergeState?.deletedOccurrenceKeys instanceof Set
			? mergeState.deletedOccurrenceKeys
			: new Set();
	const seenVirtualKeys = new Set();
	const minTimedTimestamp = Number.isFinite(visibilityFilters?.minTimedTimestamp)
		? visibilityFilters.minTimedTimestamp
		: null;
	const minAllDayDayTimestamp = Number.isFinite(visibilityFilters?.minAllDayDayTimestamp)
		? visibilityFilters.minAllDayDayTimestamp
		: null;
	const hiddenKinds =
		visibilityFilters?.hiddenKinds instanceof Set
			? visibilityFilters.hiddenKinds
			: new Set();
	const hiddenStates =
		visibilityFilters?.hiddenStates instanceof Set
			? visibilityFilters.hiddenStates
			: new Set();
	const hiddenScheduleIds =
		visibilityFilters?.hiddenScheduleIds instanceof Set
			? visibilityFilters.hiddenScheduleIds
			: new Set();

	console.log(`[CalendarWindow] Merging predictions for ${schedules.length} schedules within ${weekRange.start.toISOString()} - ${weekRange.end.toISOString()}`);
	ipcRenderer.send("log", `[CalendarWindow] Merging predictions for ${schedules.length} schedules`);

	schedules.forEach((schedule) => {
		const scheduleId = resolveScheduleId(schedule);
		if (!scheduleId) return;
		const normalizedScheduleId = String(scheduleId).trim().toLowerCase();
		if (hiddenScheduleIds.has(normalizedScheduleId)) return;
		if (!resolveScheduleActive(schedule)) return;
		if (hiddenStates.has("planned")) return;
		const rawKind = String(
			extractNullableStringValue(
				schedule?.kind ?? schedule?.Kind ?? schedule?.type ?? schedule?.Type,
			) ?? "",
		)
			.toLowerCase()
			.trim();
		const normalizedType = rawKind === "task" ? "task" : "reminder";
		if (hiddenKinds.has(normalizedType)) return;
		const deletedAt = extractNullableTimeValue(
			schedule?.deleted_at ?? schedule?.deletedAt ?? schedule?.DeletedAt,
		);
		if (deletedAt) return;

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

		const generated = createEventsFromDates(occurrences, schedule);
		generated.forEach((event) => {
			const fallbackKey = `${scheduleId}::${event.start.toISOString()}::${event.isAllDay ? "all-day" : "timed"}`;
			const stableKey = event.stableKey ?? fallbackKey;
			if (
				(stableKey && realOccurrenceKeys.has(stableKey)) ||
				(stableKey && deletedOccurrenceKeys.has(stableKey)) ||
				(stableKey && seenVirtualKeys.has(stableKey))
			) {
				return;
			}
			if (stableKey) {
				seenVirtualKeys.add(stableKey);
			}

			const baseVirtualEvent = {
				...event,
				stableKey,
			};

			if (baseVirtualEvent.isAllDay) {
				for (let offset = 0; offset < baseVirtualEvent.allDaySpanDays; offset += 1) {
					const day = new Date(baseVirtualEvent.start);
					day.setDate(day.getDate() + offset);
					const dayStartTs = getStartOfDay(day).getTime();
					if (
						minAllDayDayTimestamp !== null &&
						dayStartTs < minAllDayDayTimestamp
					) {
						continue;
					}
					const dayKey = formatDateKey(day);
					const bucket = allDayEventsByDate.get(dayKey) ?? [];
					bucket.push({
						...baseVirtualEvent,
						spanOffset: offset,
					});
					allDayEventsByDate.set(dayKey, bucket);
				}
				return;
			}

			if (minTimedTimestamp !== null && baseVirtualEvent.start.getTime() < minTimedTimestamp) {
				return;
			}

			const dateKey = formatDateKey(baseVirtualEvent.start);
			const timedBucket = timedEventsByDate.get(dateKey) ?? [];
			timedBucket.push(baseVirtualEvent);
			timedEventsByDate.set(dateKey, timedBucket);
		});
	});

	timedEventsByDate.forEach((bucket) => {
		bucket.sort((a, b) => a.start - b.start);
	});
	allDayEventsByDate.forEach((bucket) => {
		bucket.sort((a, b) => {
			if ((a.spanOffset ?? 0) !== (b.spanOffset ?? 0)) {
				return (a.spanOffset ?? 0) - (b.spanOffset ?? 0);
			}
			return a.start - b.start;
		});
	});
};

function renderAllDayEvents(allDayEventsByDate) {
	const MAX_VISIBLE_EVENTS = 3;
	allDayEventsByDate.forEach((events, dateKey) => {
		const col = document.querySelector(`.day-col[data-date="${dateKey}"]`);
		if (!col) return;
		const lane = col.querySelector(".all-day-lane");
		if (!lane) return;

		const sortedEvents = [...events].sort((a, b) => {
			if ((a.spanOffset ?? 0) !== (b.spanOffset ?? 0)) {
				return (a.spanOffset ?? 0) - (b.spanOffset ?? 0);
			}
			return a.start - b.start;
		});
		const visibleEvents = sortedEvents.slice(0, MAX_VISIBLE_EVENTS);
		visibleEvents.forEach((eventItem) => {
			const el = document.createElement("button");
			el.type = "button";
			el.className = "all-day-event";
			el.classList.add(`all-day-event--${eventItem.type ?? "reminder"}`);
			if (eventItem.isCanceled) {
				el.classList.add("all-day-event--canceled");
			} else if (eventItem.isDimmed) {
				el.classList.add("all-day-event--dimmed");
			}
			if ((eventItem.spanOffset ?? 0) > 0) {
				el.classList.add("all-day-event--continuation");
			}
			const prefix = (eventItem.spanOffset ?? 0) > 0 ? "↳ " : "";
			el.textContent = `${prefix}${eventItem.title}`;
			el.title = formatAllDayLabel(eventItem);
			el.addEventListener("click", (clickEvent) => {
				clickEvent.stopPropagation();
				showEventDetail(eventItem);
			});
			lane.appendChild(el);
		});

		if (sortedEvents.length > MAX_VISIBLE_EVENTS) {
			const overflow = document.createElement("span");
			overflow.className = "all-day-overflow";
			overflow.textContent = `+${sortedEvents.length - MAX_VISIBLE_EVENTS} more`;
			lane.appendChild(overflow);
		}
	});
}

function renderEvents(timedEventsByDate) {
	console.log(`[CalendarWindow] Rendering events for ${timedEventsByDate.size} dates`);
	timedEventsByDate.forEach((events, dateKey) => {
		const col = document.querySelector(`.day-col[data-date="${dateKey}"]`);
		if (!col) {
			console.warn(`[CalendarWindow] Column not found for date: ${dateKey}`);
			return;
		}
		const sortedEvents = [...events].sort((left, right) => {
			const startDelta = left.start - right.start;
			if (startDelta !== 0) return startDelta;
			return (right.duration ?? 0) - (left.duration ?? 0);
		});
		const placedRanges = [];
		const overlapGapPx = 2;
		const maxTimelineHeight = ALL_DAY_LANE_HEIGHT + (END_HOUR - START_HOUR) * SLOT_HEIGHT;

		sortedEvents.forEach((eventItem) => {
			const el = document.createElement("div");
			el.className = "calendar-event";
			const typeClass = eventItem.type ? `calendar-event--${eventItem.type}` : "";
			if (typeClass) {
				el.classList.add(typeClass);
			}
			if (eventItem.isCanceled) {
				el.classList.add("calendar-event--canceled");
			} else if (eventItem.isDimmed) {
				el.classList.add("calendar-event--dimmed");
			}

			const startHour = eventItem.start.getHours();
			const startMin = eventItem.start.getMinutes();
			const top = ALL_DAY_LANE_HEIGHT + (startHour + startMin / 60) * SLOT_HEIGHT;
			const baseHeight = (eventItem.duration / 60) * SLOT_HEIGHT;
			const isReminderScheduleEvent =
				(eventItem.scheduleKind ?? eventItem.type ?? "").toString().toLowerCase() === "reminder";
			const height =
				eventItem.type === "reminder" || isReminderScheduleEvent
					? Math.max(14, Math.min(baseHeight, 20))
					: Math.max(18, baseHeight);
			const maxTop = Math.max(ALL_DAY_LANE_HEIGHT, maxTimelineHeight - height);
			let resolvedTop = Math.min(top, maxTop);

			let guard = 0;
			while (guard < placedRanges.length + 5) {
				let collisionBottom = null;
				for (const placed of placedRanges) {
					const overlapsVertically =
						resolvedTop < placed.bottom && resolvedTop + height > placed.top;
					if (!overlapsVertically) continue;
					collisionBottom =
						collisionBottom === null
							? placed.bottom
							: Math.max(collisionBottom, placed.bottom);
				}
				if (collisionBottom === null) break;
				const candidateTop = Math.min(collisionBottom + overlapGapPx, maxTop);
				if (candidateTop === resolvedTop) break;
				resolvedTop = candidateTop;
				guard += 1;
			}

			placedRanges.push({
				top: resolvedTop,
				bottom: resolvedTop + height + overlapGapPx,
			});

			el.style.top = `${resolvedTop}px`;
			el.style.height = `${height}px`;
			el.style.left = "0";
			el.style.width = "100%";
			el.style.right = "auto";

			console.log(`[CalendarWindow] Rendering event "${eventItem.title}" at ${resolvedTop}px (height: ${height}px) in ${dateKey}`);

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
	const safePayload =
		payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
	state.lastCalendarPayload = safePayload;
	const incomingUserSettings =
		safePayload.user_settings ?? safePayload.userSettings ?? safePayload.UserSettings;
	if (incomingUserSettings) {
		applyUserSettings(incomingUserSettings, { rerender: false });
	}

	buildGridStructure(); // Rebuild grid
	const visibilityFilters = getVisibilityFiltersForCurrentWeek();

	const { timedEventsByDate, allDayEventsByDate, realOccurrenceKeys } = groupOccurrences(
		safePayload,
		visibilityFilters,
	);
	const deletedOccurrenceKeys = parseDeletedOccurrenceKeys(safePayload);

	// Get dates for current week to pass to mergeSchedulePredictions
	const dates = [];
	const start = new Date(state.currentWeekStart);
	for (let i = 0; i < 7; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		dates.push(d);
	}

	const weekRange = getWeekRange(dates, {
		bufferDays: CALENDAR_WINDOW_BUFFER_DAYS,
	});
	if (ENABLE_LOCAL_SCHEDULE_PROJECTIONS) {
		mergeSchedulePredictions(
			timedEventsByDate,
			allDayEventsByDate,
			safePayload?.schedules,
			weekRange,
			visibilityFilters,
			{
				realOccurrenceKeys,
				deletedOccurrenceKeys,
			},
		);
	}

	renderAllDayEvents(allDayEventsByDate);
	renderEvents(timedEventsByDate);

	const hasEvents = timedEventsByDate.size > 0 || allDayEventsByDate.size > 0;
	setEmptyState(!hasEvents);
	renderScheduleFilterOptions(
		safePayload?.schedules ?? [],
		safePayload?.occurrences ?? [],
	);
}

function requestWeek(startDate) {
	if (!startDate) return;
	const start = new Date(startDate);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	end.setHours(23, 59, 59, 999);
	const fetchStart = new Date(start);
	const fetchEnd = new Date(end);
	if (CALENDAR_WINDOW_BUFFER_DAYS > 0) {
		fetchStart.setDate(fetchStart.getDate() - CALENDAR_WINDOW_BUFFER_DAYS);
		fetchEnd.setDate(fetchEnd.getDate() + CALENDAR_WINDOW_BUFFER_DAYS);
	}
	fetchStart.setHours(0, 0, 0, 0);
	fetchEnd.setHours(23, 59, 59, 999);
	state.lastResponseRange = {
		start: fetchStart.toISOString(),
		end: fetchEnd.toISOString(),
	};
	setLoading(true);
	ipcRenderer.send("calendar-fetch-occurrences", state.lastResponseRange);
	ipcRenderer.send("schedule-list");

	if (ENABLE_MOCK_CALENDAR_FALLBACK) {
		// Optional local fallback for UI-only debugging.
		if (window.mockDataTimeout) clearTimeout(window.mockDataTimeout);
		window.mockDataTimeout = setTimeout(() => {
			if (state.isLoading) {
				injectMockData();
			}
		}, 2000);
	}
}

function attemptPendingConflictRetry(payload) {
	const pending = state.pendingConflictRetry;
	if (!pending || !pending.payload) return;
	const occurrences = Array.isArray(payload?.occurrences) ? payload.occurrences : [];
	const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
	const retryPayload =
		pending.payload && typeof pending.payload === "object"
			? { ...pending.payload }
			: {};
	if (
		pending.channel === "occurrence-edit" &&
		normalizeApplyScopeValue(retryPayload.apply_scope ?? retryPayload.applyScope) !== "single"
	) {
		const latestOccurrence = findOccurrenceForMutation(occurrences, retryPayload);
		const latestScheduleId = extractNullableStringValue(
			latestOccurrence?.schedule_id ?? retryPayload.schedule_id,
		);
		const latestSchedule = findScheduleById(schedules, latestScheduleId);
		const latestScheduleRev = resolveScheduleRev(latestSchedule);
		if (latestScheduleRev !== null) {
			retryPayload.expected_source_rev = latestScheduleRev;
		} else {
			const latestSourceRev = resolveSourceRev(latestOccurrence);
			if (latestSourceRev !== null) {
				retryPayload.expected_source_rev = latestSourceRev;
			} else {
				delete retryPayload.expected_source_rev;
			}
		}
		if (latestOccurrence) {
			const refreshedOccurrenceId = extractNullableStringValue(
				latestOccurrence?.id ??
					latestOccurrence?.occurrence_id ??
					latestOccurrence?.OccurrenceID,
			);
			if (refreshedOccurrenceId) {
				retryPayload.occurrence_id = refreshedOccurrenceId;
				delete retryPayload.schedule_id;
				delete retryPayload.anchor_occurs_at;
			}
		} else {
			const scheduleId = extractNullableStringValue(retryPayload.schedule_id);
			const anchorOccursAt = extractNullableStringValue(retryPayload.anchor_occurs_at);
			if (!scheduleId || !anchorOccursAt) {
				delete retryPayload.occurrence_id;
			}
		}
	}

	state.pendingConflictRetry = null;
	state.pendingMutation = {
		...pending,
		payload: retryPayload,
		createdAt: Date.now(),
	};
	ipcRenderer.send(pending.channel, retryPayload);
}

function attemptPendingAnchorRetry(payload) {
	const pending = state.pendingAnchorRetry;
	if (!pending || !pending.payload) return;
	const occurrences = Array.isArray(payload?.occurrences) ? payload.occurrences : [];
	const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
	const retryPayload =
		pending.payload && typeof pending.payload === "object"
			? { ...pending.payload }
			: {};
	const latestOccurrence = findOccurrenceForAnchorRetry(occurrences, pending);

	if (!latestOccurrence) {
		state.pendingAnchorRetry = null;
		state.pendingMutation = null;
		window.alert("This instance is no longer available in this schedule segment.");
		return;
	}

	const latestOccurrenceId = extractNullableStringValue(
		latestOccurrence?.id ?? latestOccurrence?.occurrence_id ?? latestOccurrence?.OccurrenceID,
	);
	const latestScheduleId = extractNullableStringValue(
		latestOccurrence?.schedule_id ??
			latestOccurrence?.scheduleId ??
			latestOccurrence?.ScheduleID,
	);
	const latestAnchorOccursAt = extractNullableTimeValue(
		latestOccurrence?.occurs_at ?? latestOccurrence?.occursAt ?? latestOccurrence?.OccursAt,
	);
	const latestSeriesUuid = extractNullableStringValue(
		latestOccurrence?.series_uuid ??
			latestOccurrence?.seriesUuid ??
			latestOccurrence?.SeriesUUID ??
			pending?.eventMeta?.series_uuid,
	);
	const latestSchedule = findScheduleById(schedules, latestScheduleId);
	const latestScheduleRev = resolveScheduleRev(latestSchedule);
	const latestScheduleTz = resolveScheduleTimeZone(latestSchedule);
	const latestExpectedSourceRev =
		latestScheduleRev !== null ? latestScheduleRev : resolveSourceRev(latestOccurrence);

	if (latestOccurrenceId) {
		retryPayload.occurrence_id = latestOccurrenceId;
		delete retryPayload.schedule_id;
		delete retryPayload.anchor_occurs_at;
	} else {
		if (!latestScheduleId || !latestAnchorOccursAt || !isRfc3339Timestamp(latestAnchorOccursAt)) {
			state.pendingAnchorRetry = null;
			state.pendingMutation = null;
			window.alert("This instance is no longer available in this schedule segment.");
			return;
		}
		retryPayload.schedule_id = latestScheduleId;
		retryPayload.anchor_occurs_at = latestAnchorOccursAt;
		delete retryPayload.occurrence_id;
	}

	if (
		pending.channel === "occurrence-edit" &&
		normalizeApplyScopeValue(retryPayload.apply_scope ?? retryPayload.applyScope) !== "single"
	) {
		if (latestExpectedSourceRev !== null) {
			retryPayload.expected_source_rev = latestExpectedSourceRev;
		} else {
			delete retryPayload.expected_source_rev;
		}
	}

	state.pendingAnchorRetry = null;
	state.pendingMutation = {
		...pending,
		payload: retryPayload,
		eventMeta: {
			...(pending?.eventMeta ?? {}),
			occurrence_id: latestOccurrenceId ?? undefined,
			schedule_id: latestScheduleId ?? pending?.eventMeta?.schedule_id,
			series_uuid: latestSeriesUuid ?? pending?.eventMeta?.series_uuid,
			anchor_occurs_at_utc: latestAnchorOccursAt ?? pending?.eventMeta?.anchor_occurs_at_utc,
			schedule_tz: latestScheduleTz ?? pending?.eventMeta?.schedule_tz,
			source_rev: latestExpectedSourceRev ?? pending?.eventMeta?.source_rev,
		},
		retryCount: Number(pending?.retryCount ?? 0),
		createdAt: Date.now(),
	};
	ipcRenderer.send(pending.channel, retryPayload);
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
	if (state.pendingAnchorRetry) {
		attemptPendingAnchorRetry(payload);
	} else if (state.pendingConflictRetry) {
		attemptPendingConflictRetry(payload);
	} else if (
		state.pendingMutation &&
		Number(state.pendingMutation.retryCount ?? 0) > 0
	) {
		state.pendingMutation = null;
	}
	if (
		state.pendingMutation &&
		Date.now() - Number(state.pendingMutation.createdAt ?? 0) > 20000
	) {
		state.pendingMutation = null;
	}
});

ipcRenderer.on("calendar-user-settings", (_, payload) => {
	applyUserSettings(payload, {
		rerender: true,
	});
});

ipcRenderer.on("calendar-error", (_, payload) => {
	console.warn("[CalendarWindow] Calendar websocket error:", payload);
	const code = Number(payload?.code);
	const type = String(payload?.type ?? "").toLowerCase();
	const message = String(payload?.message ?? "Calendar request failed");
	const errorKey = `${code}|${type}|${message}`;
	const now = Date.now();
	const canNotify = state.lastErrorKey !== errorKey || now - state.lastErrorAt > 3000;
	state.lastErrorKey = errorKey;
	state.lastErrorAt = now;

	const errorCode = Number(payload?.code);
	const errorType = String(payload?.type ?? "").toLowerCase();
	if (errorCode === 409 || errorType === "conflict") {
		const pending = state.pendingMutation;
		const pendingIsRecent = pending && Date.now() - Number(pending.createdAt ?? 0) <= 20000;
		const canRetryConflict =
			Boolean(pendingIsRecent && pending?.allowConflictRetry) &&
			Number(pending?.retryCount ?? 0) < 1;
		if (canRetryConflict) {
			state.pendingConflictRetry = {
				...pending,
				retryCount: Number(pending?.retryCount ?? 0) + 1,
			};
		}
		state.pendingAnchorRetry = null;
		if (canNotify) {
			window.alert(
				`${message}\n\nThe calendar will refresh with the latest backend state${
					canRetryConflict ? " and retry once." : "."
				}`,
			);
		}
		ipcRenderer.send("schedule-list");
		requestWeek(state.currentWeekStart);
		return;
	}
	if (errorCode === 404) {
		const lower = message.toLowerCase();
		if (lower.includes("anchor") || lower.includes("segment") || lower.includes("schedule_id")) {
			const pending = state.pendingMutation;
			const pendingPayload =
				pending?.payload && typeof pending.payload === "object" ? pending.payload : null;
			const pendingIsRecent =
				Boolean(pending) && Date.now() - Number(pending?.createdAt ?? 0) <= 20000;
			const hasScheduleAnchorTarget = Boolean(
				extractNullableStringValue(pendingPayload?.schedule_id) &&
					extractNullableStringValue(pendingPayload?.anchor_occurs_at),
			);
			const canRetryAnchor =
				pendingIsRecent &&
				hasScheduleAnchorTarget &&
				Number(pending?.retryCount ?? 0) < 1;
			if (canRetryAnchor) {
				state.pendingAnchorRetry = {
					...pending,
					retryCount: Number(pending?.retryCount ?? 0) + 1,
				};
			} else {
				state.pendingAnchorRetry = null;
				state.pendingMutation = null;
			}
			state.pendingConflictRetry = null;
			if (canNotify) {
				window.alert(
					canRetryAnchor
						? `${message}\n\nRefreshing schedules and occurrences, then retrying once with updated metadata.`
						: "This instance is no longer available in this schedule segment.",
				);
			}
			ipcRenderer.send("schedule-list");
			requestWeek(state.currentWeekStart);
			return;
		}
		if (canNotify) {
			window.alert(message);
		}
	} else if (errorCode === 400 || errorCode === 403 || errorCode === 500) {
		if (canNotify) {
			window.alert(message);
		}
	}
	state.pendingMutation = null;
	state.pendingConflictRetry = null;
	state.pendingAnchorRetry = null;
	setLoading(false);
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

	document.head.appendChild(createListSummaryStyles());
	initDetailOverlay();
	initFilterControls();

	// Initialize grid immediately to replace static HTML
	buildGridStructure();
	ipcRenderer.send("user-settings-get");

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
