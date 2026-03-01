const VALID_SCOPES = new Set(["single", "following", "all"]);
const VALID_HIDDEN_KINDS = new Set(["task", "reminder"]);
const VALID_HIDDEN_STATES = new Set([
	"planned",
	"canceled",
	"deleted",
	"completed",
	"skipped",
]);
const DEFAULT_CALENDAR_FILTERS = Object.freeze({
	hidden_kinds: [],
	hidden_states: [],
	hidden_schedule_ids: [],
});
const DEFAULT_USER_SETTINGS = Object.freeze({
	calendar_filters: DEFAULT_CALENDAR_FILTERS,
	updated_at: null,
});

const parseJson = (value, fallback = null) => {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const parseList = (value) => {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	const parsed = parseJson(value, null);
	return Array.isArray(parsed) ? parsed : [];
};

const parseObject = (value) => {
	if (!value || typeof value !== "object") {
		const parsed = parseJson(value, null);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	}
	return Array.isArray(value) ? {} : value;
};

const cloneDefaultCalendarFilters = () => ({
	hidden_kinds: [],
	hidden_states: [],
	hidden_schedule_ids: [],
});

const cloneDefaultUserSettings = () => ({
	calendar_filters: cloneDefaultCalendarFilters(),
	updated_at: null,
});

const normalizeNullableString = (value, fallback = null) => {
	if (value === null || value === undefined) return fallback;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value === "object") {
		if (value.Valid === false) return fallback;
		const candidates = [
			value.String,
			value.Time,
			value.Value,
			value.value,
			value.time,
			value.Name,
			value.Category,
		];
		for (const candidate of candidates) {
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim();
			}
		}
	}
	return fallback;
};

const parseArrayLike = (value) => {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return [];
		const parsed = parseJson(trimmed, null);
		if (Array.isArray(parsed)) return parsed;
		return trimmed
			.split(",")
			.map((token) => token.trim())
			.filter(Boolean);
	}
	if (typeof value === "object") {
		if (value.Valid === false) return [];
		const candidates = [value.Array, value.Values, value.Int32Array, value.Int64Array];
		for (const candidate of candidates) {
			if (Array.isArray(candidate)) return candidate;
		}
	}
	return [];
};

const normalizeEnumArray = ({ value, allowedSet, fallback = [] }) => {
	const source = value === undefined ? fallback : value;
	const normalized = [];
	parseArrayLike(source).forEach((item) => {
		const entry = normalizeNullableString(item, "").toLowerCase();
		if (!entry || !allowedSet.has(entry) || normalized.includes(entry)) return;
		normalized.push(entry);
	});
	return normalized.sort((left, right) => left.localeCompare(right));
};

const normalizeStringArray = ({ value, fallback = [] }) => {
	const source = value === undefined ? fallback : value;
	const normalized = [];
	parseArrayLike(source).forEach((item) => {
		const entry = normalizeNullableString(item, "");
		if (!entry || normalized.includes(entry)) return;
		normalized.push(entry);
	});
	return normalized.sort((left, right) => left.localeCompare(right));
};

const normalizeCalendarFilters = (value, fallbackValue = DEFAULT_CALENDAR_FILTERS) => {
	const fallback = parseObject(fallbackValue);
	const raw = parseObject(value);
	return {
		hidden_kinds: normalizeEnumArray({
			value: raw.hidden_kinds ?? raw.hiddenKinds,
			allowedSet: VALID_HIDDEN_KINDS,
			fallback: fallback.hidden_kinds ?? [],
		}),
		hidden_states: normalizeEnumArray({
			value: raw.hidden_states ?? raw.hiddenStates,
			allowedSet: VALID_HIDDEN_STATES,
			fallback: fallback.hidden_states ?? [],
		}),
		hidden_schedule_ids: normalizeStringArray({
			value: raw.hidden_schedule_ids ?? raw.hiddenScheduleIds,
			fallback: fallback.hidden_schedule_ids ?? [],
		}),
	};
};

const normalizeUserSettings = (value, fallbackValue = DEFAULT_USER_SETTINGS) => {
	const fallback = parseObject(fallbackValue);
	const raw = parseObject(value);
	const rawFilters = raw.calendar_filters ?? raw.calendarFilters ?? raw.CalendarFilters;
	return {
		calendar_filters: normalizeCalendarFilters(
			rawFilters,
			fallback.calendar_filters ?? DEFAULT_CALENDAR_FILTERS,
		),
		updated_at: normalizeNullableTime(
			raw.updated_at ?? raw.updatedAt ?? raw.UpdatedAt,
			fallback.updated_at ?? null,
		),
	};
};

const normalizeCalendarFilterPatch = (value) => {
	const raw = parseObject(value);
	const rawFilters = parseObject(raw.calendar_filters ?? raw.calendarFilters ?? raw);
	const patch = {};
	if ("hidden_kinds" in rawFilters || "hiddenKinds" in rawFilters) {
		patch.hidden_kinds = normalizeEnumArray({
			value: rawFilters.hidden_kinds ?? rawFilters.hiddenKinds,
			allowedSet: VALID_HIDDEN_KINDS,
			fallback: [],
		});
	}
	if ("hidden_states" in rawFilters || "hiddenStates" in rawFilters) {
		patch.hidden_states = normalizeEnumArray({
			value: rawFilters.hidden_states ?? rawFilters.hiddenStates,
			allowedSet: VALID_HIDDEN_STATES,
			fallback: [],
		});
	}
	if ("hidden_schedule_ids" in rawFilters || "hiddenScheduleIds" in rawFilters) {
		patch.hidden_schedule_ids = normalizeStringArray({
			value: rawFilters.hidden_schedule_ids ?? rawFilters.hiddenScheduleIds,
			fallback: [],
		});
	}
	return patch;
};

const normalizeNullableBoolean = (value, fallback = false) => {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.toLowerCase().trim();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	if (!value || typeof value !== "object") return fallback;
	if (value.Valid === false) return fallback;
	if (typeof value.Bool === "boolean") return value.Bool;
	if (typeof value.Boolean === "boolean") return value.Boolean;
	return fallback;
};

const normalizeNullableNumber = (value, fallback = 0) => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.round(value);
	}
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return Math.round(numeric);
		return fallback;
	}
	if (value && typeof value === "object") {
		if (value.Valid === false) return fallback;
		const candidates = [value.Int32, value.Int64, value.Integer, value.Value, value.value];
		for (const candidate of candidates) {
			const numeric = Number(candidate);
			if (Number.isFinite(numeric)) {
				return Math.round(numeric);
			}
		}
	}
	return fallback;
};

const normalizeNullableTime = (value, fallback = null) => {
	const raw = normalizeNullableString(value, null);
	if (!raw) return fallback;
	const timestamp = Date.parse(raw);
	return Number.isNaN(timestamp) ? fallback : new Date(timestamp).toISOString();
};

const unwrapSqlNullable = (value) => {
	if (!value || typeof value !== "object" || !("Valid" in value)) return undefined;
	if (value.Valid === false) return null;
	if ("String" in value) return typeof value.String === "string" ? value.String : null;
	if ("Time" in value) return typeof value.Time === "string" ? value.Time : null;
	if ("Bool" in value) return typeof value.Bool === "boolean" ? value.Bool : null;
	if ("Boolean" in value) return typeof value.Boolean === "boolean" ? value.Boolean : null;
	if ("Int32" in value) return Number.isFinite(Number(value.Int32)) ? Number(value.Int32) : null;
	if ("Int64" in value) return Number.isFinite(Number(value.Int64)) ? Number(value.Int64) : null;
	if ("Integer" in value) {
		return Number.isFinite(Number(value.Integer)) ? Number(value.Integer) : null;
	}
	if ("Float64" in value) {
		return Number.isFinite(Number(value.Float64)) ? Number(value.Float64) : null;
	}
	if ("Value" in value) return value.Value ?? null;
	return null;
};

const normalizeSqlNullableDeep = (value) => {
	if (Array.isArray(value)) {
		return value.map((item) => normalizeSqlNullableDeep(item));
	}
	if (!value || typeof value !== "object") return value;
	const unwrapped = unwrapSqlNullable(value);
	if (unwrapped !== undefined) {
		return normalizeSqlNullableDeep(unwrapped);
	}
	const next = {};
	Object.entries(value).forEach(([key, nested]) => {
		next[key] = normalizeSqlNullableDeep(nested);
	});
	return next;
};

const normalizeCustomizedFields = (value) => {
	const list = parseList(value);
	const normalized = [];
	list.forEach((item) => {
		const field = normalizeNullableString(item, null);
		if (!field) return;
		if (!normalized.includes(field)) normalized.push(field);
	});
	return normalized;
};

const normalizeOccurrenceKind = (value, fallback = "reminder") => {
	const normalized = normalizeNullableString(value, "").toLowerCase();
	if (normalized === "task" || normalized === "reminder") return normalized;
	return fallback;
};

const normalizeAllDaySpanDays = (value) => Math.max(1, normalizeNullableNumber(value, 1));

const detectLocalTimeZone = () => {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (typeof zone === "string" && zone.trim()) return zone.trim();
	} catch {
		// Ignore and fallback.
	}
	return "UTC";
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

const buildInstanceKeyFromDate = ({ occursAt, timeZone, isAllDay = false } = {}) => {
	const parts = getTimePartsInZone(occursAt, timeZone);
	if (!parts) return null;
	if (isAllDay) {
		return `${parts.year}${parts.month}${parts.day}`;
	}
	return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
};

const normalizeOccurrence = (rawValue) => {
	const raw = normalizeSqlNullableDeep(parseObject(rawValue));
	if (!raw || typeof raw !== "object") return null;

	const id = normalizeNullableString(
		raw.id ?? raw.occurrence_id ?? raw.ID ?? raw.OccurrenceID,
		null,
	);
	if (!id) return null;

	const snapshot = normalizeSqlNullableDeep(parseObject(raw.snapshot ?? raw.Snapshot));
	const overrides = normalizeSqlNullableDeep(parseObject(raw.overrides ?? raw.Overrides));
	const rawPayload = raw.payload ?? raw.Payload;
	if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
		console.warn(
			`[CalendarController] Dropping occurrence ${id}: payload must be a JSON object`,
		);
		return null;
	}
	const payload = normalizeSqlNullableDeep(rawPayload);
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		console.warn(
			`[CalendarController] Dropping occurrence ${id}: payload normalization failed`,
		);
		return null;
	}

	const rawState = normalizeNullableString(raw.state ?? raw.State, "planned");
	const occursAt = normalizeNullableTime(
		raw.occurs_at ?? raw.occursAt ?? raw.OccursAt,
		null,
	);
	const customReason = normalizeNullableString(
		raw.custom_reason ?? raw.customReason ?? raw.CustomReason,
		null,
	);
	const commonLanguage = normalizeNullableString(
		raw.common_language ?? raw.commonLanguage ?? raw.CommonLanguage,
		null,
	);
	const payloadTitle = normalizeNullableString(payload.title, null);
	const payloadKind = normalizeOccurrenceKind(payload.kind ?? payload.type, "reminder");
	const title =
		normalizeNullableString(
			raw.title ??
				raw.name ??
				raw.summary ??
				raw.description ??
				raw.Title ??
				raw.Name ??
				raw.Summary ??
				raw.Description,
			null,
		) ??
		payloadTitle ??
		"Untitled event";
	const kind = normalizeOccurrenceKind(raw.kind ?? raw.type ?? raw.Kind ?? raw.Type, payloadKind);
	const isAllDay = normalizeNullableBoolean(
		raw.is_all_day ?? raw.isAllDay ?? raw.IsAllDay,
		false,
	);
	const allDaySpanDays = normalizeAllDaySpanDays(
		raw.all_day_span_days ?? raw.allDaySpanDays ?? raw.AllDaySpanDays,
	);
	const canceledAt = normalizeNullableTime(
		raw.canceled_at ?? raw.canceledAt ?? raw.CanceledAt,
		null,
	);
	const rev = normalizeNullableNumber(raw.rev ?? raw.Rev, Number.NaN);
	const sourceRev = normalizeNullableNumber(
		raw.source_rev ?? raw.sourceRev ?? raw.SourceRev,
		Number.NaN,
	);

	return {
		...raw,
		id,
		occurrence_id: id,
		schedule_id: normalizeNullableString(
			raw.schedule_id ?? raw.scheduleId ?? raw.ScheduleID,
			null,
		),
		user_id: normalizeNullableString(raw.user_id ?? raw.userId ?? raw.UserID, null),
		series_uuid: normalizeNullableString(
			raw.series_uuid ?? raw.seriesUuid ?? raw.SeriesUUID,
			null,
		),
		instance_key: normalizeNullableString(
			raw.instance_key ?? raw.instanceKey ?? raw.InstanceKey,
			null,
		),
		occurs_at: occursAt,
		...(Number.isFinite(rev) ? { rev } : {}),
		...(Number.isFinite(sourceRev) ? { source_rev: sourceRev } : {}),
		snapshot,
		overrides,
		customized_fields: normalizeCustomizedFields(
			raw.customized_fields ?? raw.customizedFields ?? raw.CustomizedFields,
		),
		payload,
		state: rawState,
		mutated_at: normalizeNullableTime(
			raw.mutated_at ?? raw.mutatedAt ?? raw.MutatedAt,
			null,
		),
		canceled_at: canceledAt,
		custom_reason: customReason,
		task_activate_at: normalizeNullableTime(
			raw.task_activate_at ?? raw.taskActivateAt ?? raw.TaskActivateAt,
			null,
		),
		notification_activate_at: normalizeNullableTime(
			raw.notification_activate_at ??
				raw.notificationActivateAt ??
				raw.NotificationActivateAt,
			null,
		),
		task_materialized_at: normalizeNullableTime(
			raw.task_materialized_at ??
				raw.taskMaterializedAt ??
				raw.TaskMaterializedAt,
			null,
		),
		notification_materialized_at: normalizeNullableTime(
			raw.notification_materialized_at ??
				raw.notificationMaterializedAt ??
				raw.NotificationMaterializedAt,
			null,
		),
		duration_minutes: Math.max(
			0,
			normalizeNullableNumber(
				raw.duration_minutes ?? raw.durationMinutes ?? raw.DurationMinutes,
				0,
			),
		),
		kind,
		title,
		common_language: commonLanguage,
		is_all_day: isAllDay,
		all_day_span_days: allDaySpanDays,
	};
};

const normalizeOccurrences = (value) => parseList(value).map(normalizeOccurrence).filter(Boolean);

const normalizeScheduleReferences = (value) =>
	parseList(value)
		.map((item) => normalizeSqlNullableDeep(parseObject(item)))
		.filter((item) => item && typeof item === "object")
		.map((item) => {
			const id = normalizeNullableString(
				item.id ?? item.schedule_id ?? item.uuid ?? item.ID ?? item.ScheduleID ?? item.UUID,
				null,
			);
			if (!id) return null;
			return {
				...item,
				id,
				is_all_day: normalizeNullableBoolean(
					item.is_all_day ?? item.isAllDay ?? item.IsAllDay,
					false,
				),
				all_day_span_days: normalizeAllDaySpanDays(
					item.all_day_span_days ?? item.allDaySpanDays ?? item.AllDaySpanDays,
				),
				deleted_at: normalizeNullableTime(
					item.deleted_at ?? item.deletedAt ?? item.DeletedAt,
					null,
				),
			};
		})
		.filter((item) => item && !item.deleted_at);

const normalizeRange = (rawPayload, fallbackRange = null) => {
	const rawRange = parseObject(rawPayload?.range);
	const start =
		normalizeNullableTime(
			rawPayload?.start ??
				rawPayload?.Start ??
				rawPayload?.occurrences_start ??
				rawPayload?.occurrencesStart ??
				rawPayload?.OccurrencesStart ??
				rawRange.start ??
				rawRange.Start,
			null,
		) ??
		fallbackRange?.start ??
		null;
	const end =
		normalizeNullableTime(
			rawPayload?.end ??
				rawPayload?.End ??
				rawPayload?.occurrences_end ??
				rawPayload?.occurrencesEnd ??
				rawPayload?.OccurrencesEnd ??
				rawRange.end ??
				rawRange.End,
			null,
		) ??
		fallbackRange?.end ??
		null;
	if (!start || !end) return null;
	return { start, end };
};

const normalizeApplyScope = (scope) => {
	const normalized = normalizeNullableString(scope, "single").toLowerCase();
	return VALID_SCOPES.has(normalized) ? normalized : "single";
};

const getOccurrenceSortTs = (occurrence) => {
	const ts = Date.parse(occurrence?.occurs_at ?? "");
	return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
};

const isOccurrenceInRange = (occurrence, range) => {
	if (!range?.start || !range?.end) return true;
	const ts = Date.parse(occurrence?.occurs_at ?? "");
	const start = Date.parse(range.start);
	const end = Date.parse(range.end);
	if (Number.isNaN(ts) || Number.isNaN(start) || Number.isNaN(end)) return true;
	return ts >= start && ts <= end;
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
		occurrenceById: new Map(),
		occurrenceBySeriesAndInstance: new Map(),
		deletedOccurrenceByKey: new Map(),
		backgroundRefetchTimer: null,
		userSettings: cloneDefaultUserSettings(),
	};

	const getCalendarWindow = () =>
		windowManager.getCalendarWindow && windowManager.getCalendarWindow();

	const forwardToWindow = (payload) => {
		const win = getCalendarWindow();
		if (!win || win.isDestroyed()) return;
		win.webContents.send("calendar-data", payload);
	};

	const forwardError = (payload) => {
		const win = getCalendarWindow();
		if (!win || win.isDestroyed()) return;
		win.webContents.send("calendar-error", payload);
	};

	const forwardUserSettings = (payload) => {
		const win = getCalendarWindow();
		if (!win || win.isDestroyed()) return;
		win.webContents.send("calendar-user-settings", payload);
	};

	const reindexOccurrences = (occurrences) => {
		state.occurrenceById.clear();
		state.occurrenceBySeriesAndInstance.clear();
		occurrences.forEach((occurrence) => {
			state.occurrenceById.set(occurrence.id, occurrence);
			if (occurrence.series_uuid && occurrence.instance_key) {
				state.occurrenceBySeriesAndInstance.set(
					`${occurrence.series_uuid}::${occurrence.instance_key}`,
					occurrence,
				);
			}
		});
	};

	const buildSeriesInstanceKey = (seriesUuid, instanceKey) => {
		if (!seriesUuid || !instanceKey) return null;
		return `${seriesUuid}::${instanceKey}`;
	};

	const resolveScheduleById = (scheduleId) => {
		if (!scheduleId) return null;
		const schedules = schedulesController?.getAllSchedules?.() ?? [];
		return (
			schedules.find((item) => {
				const id = normalizeNullableString(
					item?.id ?? item?.schedule_id ?? item?.scheduleId ?? item?.ScheduleID,
					null,
				);
				return id === scheduleId;
			}) ?? null
		);
	};

	const recordDeletedOccurrence = ({ seriesUuid, instanceKey, occursAt = null } = {}) => {
		const key = buildSeriesInstanceKey(seriesUuid, instanceKey);
		if (!key) return;
		state.deletedOccurrenceByKey.set(key, {
			key,
			series_uuid: seriesUuid,
			instance_key: instanceKey,
			occurs_at: occursAt,
			deleted_at: new Date().toISOString(),
		});
	};

	const pruneDeletedOccurrences = () => {
		const now = Date.now();
		const maxAgeMs = 45 * 24 * 60 * 60 * 1000;
		const maxEntries = 4000;
		for (const [key, entry] of state.deletedOccurrenceByKey.entries()) {
			const deletedAtTs = Date.parse(entry?.deleted_at ?? "");
			if (!Number.isNaN(deletedAtTs) && now - deletedAtTs > maxAgeMs) {
				state.deletedOccurrenceByKey.delete(key);
			}
		}
		if (state.deletedOccurrenceByKey.size <= maxEntries) return;
		const entries = [...state.deletedOccurrenceByKey.entries()].sort(
			(a, b) => Date.parse(a[1]?.deleted_at ?? "") - Date.parse(b[1]?.deleted_at ?? ""),
		);
		const overflow = state.deletedOccurrenceByKey.size - maxEntries;
		for (let i = 0; i < overflow; i += 1) {
			const key = entries[i]?.[0];
			if (key) state.deletedOccurrenceByKey.delete(key);
		}
	};

	const clearDeletedOccurrenceTombstonesPresentInOccurrences = (occurrences = []) => {
		occurrences.forEach((occurrence) => {
			const key = buildSeriesInstanceKey(occurrence?.series_uuid, occurrence?.instance_key);
			if (key) {
				state.deletedOccurrenceByKey.delete(key);
			}
		});
	};

	const buildDeletedOccurrenceKeyList = () => {
		pruneDeletedOccurrences();
		return [...state.deletedOccurrenceByKey.keys()];
	};

	const queueBackgroundRefetch = ({ includeSchedules = false, delayMs = 350 } = {}) => {
		if (state.backgroundRefetchTimer) {
			clearTimeout(state.backgroundRefetchTimer);
		}
		state.backgroundRefetchTimer = setTimeout(() => {
			state.backgroundRefetchTimer = null;
			const range = state.pendingRange ?? state.lastPayload?.range ?? null;
			if (includeSchedules) {
				requestSchedulesList();
			}
			if (range?.start && range?.end) {
				requestOccurrences(range);
			}
		}, delayMs);
	};

	const resolveSchedules = (rawSchedules) => {
		const controllerSchedules = schedulesController?.getAllSchedules?.() ?? [];
		if (controllerSchedules.length > 0) return controllerSchedules;
		return normalizeScheduleReferences(rawSchedules);
	};

	const enrichPayload = (rawPayload, fallbackRange = null) => {
		const payload = parseObject(rawPayload);
		if (!payload || typeof payload !== "object") return null;

		const range = normalizeRange(payload, fallbackRange);
		const occurrences = normalizeOccurrences(payload.occurrences);
		const schedules = resolveSchedules(payload.schedules ?? payload.schedule_list ?? []);

		return {
			start: range?.start ?? fallbackRange?.start ?? null,
			end: range?.end ?? fallbackRange?.end ?? null,
			range: range ?? fallbackRange ?? null,
			occurrences,
			schedules,
		};
	};

	const commitPayload = (payload, { shouldForward = true } = {}) => {
		if (!payload) return;
		clearDeletedOccurrenceTombstonesPresentInOccurrences(payload.occurrences ?? []);
		const mergedPayload = {
			...payload,
			deleted_occurrence_keys: buildDeletedOccurrenceKeyList(),
			user_settings: normalizeUserSettings(
				payload.user_settings ?? payload.userSettings,
				state.userSettings,
			),
		};
		state.userSettings = mergedPayload.user_settings;
		state.lastPayload = mergedPayload;
		if (mergedPayload.start && mergedPayload.end) {
			state.pendingRange = { start: mergedPayload.start, end: mergedPayload.end };
		}
		reindexOccurrences(mergedPayload.occurrences ?? []);
		if (shouldForward) {
			forwardToWindow(mergedPayload);
		}
	};

	const requestOccurrences = (range) => {
		const normalizedRange = normalizeRange(range);
		if (!normalizedRange?.start || !normalizedRange?.end) return;
		const startTs = Date.parse(normalizedRange.start);
		const endTs = Date.parse(normalizedRange.end);
		if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs < startTs) {
			log("[CalendarController] Skipping occurrences_fetch: invalid range");
			return;
		}
		state.pendingRange = normalizedRange;
		log(
			`[CalendarController] Requesting occurrences for range: ${normalizedRange.start} - ${normalizedRange.end}`,
		);
		sendEvent?.("occurrences_fetch", normalizedRange);
	};

	const requestSchedulesList = () => {
		sendEvent?.("schedule_list", {});
	};

	const requestUserSettings = () => {
		sendEvent?.("user_settings_get", {});
	};

	const applyUserSettings = (payload, { shouldForward = true } = {}) => {
		const normalized = normalizeUserSettings(payload, state.userSettings);
		state.userSettings = normalized;
		if (!shouldForward) return normalized;
		forwardUserSettings(normalized);
		if (state.lastPayload) {
			commitPayload({
				...state.lastPayload,
				user_settings: normalized,
			});
		}
		return normalized;
	};

	const updateUserSettings = (patchPayload) => {
		const patch = normalizeCalendarFilterPatch(patchPayload);
		if (Object.keys(patch).length === 0) {
			log("[CalendarController] user_settings_update skipped: empty patch");
			return false;
		}
		const optimistic = normalizeUserSettings(
			{
				calendar_filters: {
					...(state.userSettings?.calendar_filters ?? cloneDefaultCalendarFilters()),
					...patch,
				},
				updated_at: state.userSettings?.updated_at ?? null,
			},
			state.userSettings,
		);
		state.userSettings = optimistic;
		forwardUserSettings(optimistic);
		if (state.lastPayload) {
			commitPayload({
				...state.lastPayload,
				user_settings: optimistic,
			});
		}
		sendEvent?.("user_settings_update", {
			calendar_filters: patch,
		});
		return true;
	};

	const requestVisibleRangeRefetch = ({ includeSchedules = true } = {}) => {
		const range = state.pendingRange ?? state.lastPayload?.range ?? null;
		if (includeSchedules) {
			requestSchedulesList();
		}
		if (range?.start && range?.end) {
			requestOccurrences(range);
		}
	};

	const handleOccurrencesList = (payload) => {
		const normalized = enrichPayload(payload, state.pendingRange);
		if (!normalized) {
			log("[CalendarController] Failed to normalize occurrences payload");
			return;
		}
		log(
			`[CalendarController] Received occurrences list with ${normalized.occurrences.length} items`,
		);
		commitPayload(normalized);
	};

	const handleConnectedPayload = (payload) => {
		if (!payload) return;
		const connectedUserSettings =
			payload.user_settings ?? payload.userSettings ?? payload.UserSettings ?? null;
		if (connectedUserSettings) {
			applyUserSettings(connectedUserSettings, { shouldForward: false });
		}
		const connected = {
			start:
				payload.occurrences_start ??
				payload.occurrencesStart ??
				payload.OccurrencesStart ??
				payload.start ??
				payload.Start,
			end:
				payload.occurrences_end ??
				payload.occurrencesEnd ??
				payload.OccurrencesEnd ??
				payload.end ??
				payload.End,
			occurrences: payload.occurrences ?? payload.Occurrences ?? [],
			schedules:
				payload.schedules ??
				payload.Schedules ??
				payload.schedule_list ??
				payload.ScheduleList ??
				[],
		};
		const connectedRange = normalizeRange(connected, null);
		if (connectedRange?.start && connectedRange?.end) {
			const normalized = enrichPayload(connected, state.pendingRange);
			if (!normalized) return;
			commitPayload(normalized);
			return;
		}

		// Backend contract v2: connected payload no longer includes occurrences.
		const resolvedSchedules = resolveSchedules(connected.schedules);
		if (state.lastPayload) {
			commitPayload({
				...state.lastPayload,
				schedules: resolvedSchedules,
				user_settings: state.userSettings,
			});
		}

		const rangeToRefetch = state.pendingRange ?? state.lastPayload?.range ?? null;
		if (rangeToRefetch?.start && rangeToRefetch?.end) {
			log(
				`[CalendarController] Connected payload has no occurrences window; refetching ${rangeToRefetch.start} - ${rangeToRefetch.end}`,
			);
			requestOccurrences(rangeToRefetch);
		}
	};

	const refreshWindowFromState = () => {
		if (!state.lastPayload) return;
		const payload = {
			...state.lastPayload,
			schedules: resolveSchedules(state.lastPayload.schedules),
		};
		commitPayload(payload);
	};

	const handleSchedulesChanged = () => {
		if (!state.lastPayload) return;
		log("[CalendarController] Schedules changed, refreshing calendar payload");
		refreshWindowFromState();
	};

	const handleOccurrenceUpdated = (payload) => {
		const normalized = normalizeOccurrence(payload);
		if (!normalized) return;
		if (!state.lastPayload) {
			log("[CalendarController] Occurrence update received before initial payload; requesting range");
			if (state.pendingRange?.start && state.pendingRange?.end) {
				requestOccurrences(state.pendingRange);
			}
			return;
		}

		const range = state.lastPayload.range ?? state.pendingRange;
		const next = [...(state.lastPayload.occurrences ?? [])];
		const index = next.findIndex((item) => item.id === normalized.id);
		if (!isOccurrenceInRange(normalized, range)) {
			if (index >= 0) {
				next.splice(index, 1);
			}
		} else if (index >= 0) {
			next[index] = {
				...next[index],
				...normalized,
			};
		} else {
			next.push(normalized);
		}

		next.sort((a, b) => getOccurrenceSortTs(a) - getOccurrenceSortTs(b));
		commitPayload({
			...state.lastPayload,
			occurrences: next,
		});
		queueBackgroundRefetch();
	};

	const handleOccurrenceDeleted = (payload) => {
		const parsed = parseObject(payload);
		const occurrenceId = normalizeNullableString(
			parsed.occurrence_id ?? parsed.occurrenceId ?? parsed.id ?? parsed.ID ?? parsed.OccurrenceID,
			null,
		);
		const scheduleId = normalizeNullableString(
			parsed.schedule_id ?? parsed.scheduleId ?? parsed.ScheduleID,
			null,
		);
		const seriesUuid = normalizeNullableString(
			parsed.series_uuid ?? parsed.seriesUuid ?? parsed.SeriesUUID,
			null,
		);
		const instanceKey = normalizeNullableString(
			parsed.instance_key ?? parsed.instanceKey ?? parsed.InstanceKey,
			null,
		);
		const resolvedKey = buildSeriesInstanceKey(seriesUuid, instanceKey);
		const fallbackById = occurrenceId ? state.occurrenceById.get(occurrenceId) : null;
		const fallbackBySeries =
			resolvedKey ? state.occurrenceBySeriesAndInstance.get(resolvedKey) : null;
		const fallbackOccurrence = fallbackById ?? fallbackBySeries ?? null;
		const resolvedScheduleId =
			scheduleId ?? normalizeNullableString(fallbackOccurrence?.schedule_id, null);
		const scheduleRef = resolveScheduleById(resolvedScheduleId);
		const deletedSeriesUuid =
			seriesUuid ??
			normalizeNullableString(fallbackOccurrence?.series_uuid, null) ??
			normalizeNullableString(
				scheduleRef?.series_uuid ?? scheduleRef?.seriesUuid ?? scheduleRef?.SeriesUUID,
				null,
			);
		const deletedInstanceKey =
			instanceKey ??
			normalizeNullableString(fallbackOccurrence?.instance_key, null);
		const deletedOccursAt =
			normalizeNullableTime(parsed.occurs_at ?? parsed.occursAt ?? parsed.OccursAt, null) ??
			normalizeNullableTime(fallbackOccurrence?.occurs_at, null);
		const deletedIsAllDay = normalizeNullableBoolean(
			parsed.is_all_day ??
				parsed.isAllDay ??
				parsed.IsAllDay ??
				fallbackOccurrence?.is_all_day ??
				fallbackOccurrence?.isAllDay ??
				scheduleRef?.is_all_day ??
				scheduleRef?.isAllDay,
			false,
		);
		const scheduleTimeZone =
			normalizeNullableString(
				scheduleRef?.tz ?? scheduleRef?.TZ ?? scheduleRef?.TimeZone,
				null,
			) ?? detectLocalTimeZone();
		const derivedInstanceKey =
			deletedInstanceKey ??
			buildInstanceKeyFromDate({
				occursAt: deletedOccursAt,
				timeZone: scheduleTimeZone,
				isAllDay: deletedIsAllDay,
			});
		recordDeletedOccurrence({
			seriesUuid: deletedSeriesUuid,
			instanceKey: derivedInstanceKey,
			occursAt: deletedOccursAt,
		});

		if (!state.lastPayload) return;
		const next = [...(state.lastPayload.occurrences ?? [])];
		let changed = false;

		if (occurrenceId) {
			const index = next.findIndex((item) => item.id === occurrenceId);
			if (index >= 0) {
				next.splice(index, 1);
				changed = true;
			}
		}

		if (!changed && seriesUuid && instanceKey) {
			const cached = state.occurrenceBySeriesAndInstance.get(`${seriesUuid}::${instanceKey}`);
			if (cached?.id) {
				const index = next.findIndex((item) => item.id === cached.id);
				if (index >= 0) {
					next.splice(index, 1);
					changed = true;
				}
			}
		}

		if (!changed && seriesUuid && instanceKey) {
			const index = next.findIndex(
				(item) => item.series_uuid === seriesUuid && item.instance_key === instanceKey,
			);
			if (index >= 0) {
				next.splice(index, 1);
				changed = true;
			}
		}

		if (!changed) {
			commitPayload({
				...state.lastPayload,
				occurrences: next,
			});
			queueBackgroundRefetch();
			return;
		}
		commitPayload({
			...state.lastPayload,
			occurrences: next,
		});
		queueBackgroundRefetch();
	};

	const handleOccurrenceCanceled = (payload) => {
		const parsed = parseObject(payload);
		const normalized = normalizeOccurrence(parsed);
		if (!state.lastPayload) return;

		const next = [...(state.lastPayload.occurrences ?? [])];
		let updated = null;
		let index = -1;

		if (normalized?.id) {
			index = next.findIndex((item) => item.id === normalized.id);
			if (index >= 0) {
				updated = {
					...next[index],
					...normalized,
					state: "canceled",
					canceled_at:
						normalized.canceled_at ??
						next[index]?.canceled_at ??
						new Date().toISOString(),
				};
			}
		}

		if (!updated) {
			const occurrenceId = normalizeNullableString(
				parsed.occurrence_id ??
					parsed.occurrenceId ??
					parsed.id ??
					parsed.ID ??
					parsed.OccurrenceID,
				null,
			);
			const seriesUuid = normalizeNullableString(
				parsed.series_uuid ?? parsed.seriesUuid ?? parsed.SeriesUUID,
				null,
			);
			const instanceKey = normalizeNullableString(
				parsed.instance_key ?? parsed.instanceKey ?? parsed.InstanceKey,
				null,
			);

			if (occurrenceId) {
				index = next.findIndex((item) => item.id === occurrenceId);
			}
			if (index < 0 && seriesUuid && instanceKey) {
				index = next.findIndex(
					(item) => item.series_uuid === seriesUuid && item.instance_key === instanceKey,
				);
			}
			if (index >= 0) {
				const canceledAt =
					normalizeNullableTime(
						parsed.canceled_at ?? parsed.canceledAt ?? parsed.CanceledAt,
						null,
					) ?? next[index]?.canceled_at ?? new Date().toISOString();
				const reason =
					normalizeNullableString(
						parsed.reason ??
							parsed.custom_reason ??
							parsed.customReason ??
							parsed.CustomReason,
						null,
					) ?? next[index]?.custom_reason ?? null;

				updated = {
					...next[index],
					state: "canceled",
					canceled_at: canceledAt,
					custom_reason: reason,
					mutated_at:
						normalizeNullableTime(
							parsed.mutated_at ?? parsed.mutatedAt ?? parsed.MutatedAt,
							null,
						) ?? next[index]?.mutated_at ?? null,
				};
			}
		}

		if (!updated || index < 0) return;
		next[index] = updated;
		next.sort((a, b) => getOccurrenceSortTs(a) - getOccurrenceSortTs(b));
		commitPayload({
			...state.lastPayload,
			occurrences: next,
		});
		queueBackgroundRefetch();
	};

	const handleOccurrenceSeriesUpdated = (payload) => {
		const parsed = parseObject(payload);
		const applyScope = normalizeApplyScope(
			parsed.apply_scope ?? parsed.applyScope ?? parsed.ApplyScope ?? parsed.apply_mode,
		);
		const seriesUuid = normalizeNullableString(
			parsed.series_uuid ?? parsed.seriesUuid ?? parsed.SeriesUUID,
			"",
		);
		const action = normalizeNullableString(parsed.action ?? parsed.Action, "update");
		log(
			`[CalendarController] occurrence_series_updated received for ${seriesUuid || "unknown-series"} (${applyScope}, ${action}); refetching`,
		);
		requestVisibleRangeRefetch({ includeSchedules: true });
	};

	const handleConnectionError = (payload) => {
		const parsed = parseObject(payload);
		const errorData = {
			type: normalizeNullableString(parsed.type, "unknown"),
			message: normalizeNullableString(parsed.message, "Unknown websocket error"),
			code: normalizeNullableNumber(parsed.code, 0),
		};
		log(
			`[CalendarController] connection_error ${errorData.code} (${errorData.type}): ${errorData.message}`,
		);
		forwardError(errorData);
	};

	const handleUserSettingsUpdated = (payload) => {
		applyUserSettings(payload, { shouldForward: true });
	};

	return {
		requestOccurrences,
		requestSchedulesList,
		requestUserSettings,
		updateUserSettings,
		requestVisibleRangeRefetch,
		handleOccurrencesList,
		handleConnectedPayload,
		handleSchedulesChanged,
		handleOccurrenceUpdated,
		handleOccurrenceDeleted,
		handleOccurrenceCanceled,
		handleOccurrenceSeriesUpdated,
		handleConnectionError,
		handleUserSettingsUpdated,
		forwardToWindow,
	};
}
