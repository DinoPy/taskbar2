export function createSchedulesController({ sendEvent, log = console.log }) {
    const state = {
        schedules: new Map(), // id -> schedule object
    };
    const VALID_SCHEDULE_DELETE_MODES = new Set([
        "schedule_only",
        "schedule_and_future_occurrences",
        "schedule_and_future_occurrences_after_date",
    ]);
    const RFC3339_TIMESTAMP_REGEX =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

    const isValidRfc3339Timestamp = (value) => {
        if (typeof value !== "string") return false;
        const trimmed = value.trim();
        if (!RFC3339_TIMESTAMP_REGEX.test(trimmed)) return false;
        return !Number.isNaN(Date.parse(trimmed));
    };

    const extractNullableString = (field) => {
        if (!field) return "";
        if (typeof field === "string") return field;
        if (typeof field.String === "string") {
            if (field.Valid === false) return "";
            return field.String;
        }
        if (field.Valid && typeof field.String === "string") return field.String;
        return "";
    };

    const extractNullableTime = (field) => {
        if (!field) return null;
        if (typeof field === "string") return field;
        if (typeof field.Time === "string") {
            if (field.Valid === false) return null;
            return field.Time;
        }
        if (field.Valid && field.Time) return field.Time;
        return null;
    };

    const extractNullableBoolean = (field, fallback = false) => {
        if (typeof field === "boolean") return field;
        if (typeof field === "string") {
            const normalized = field.toLowerCase().trim();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
        }
        if (field && typeof field === "object") {
            if (typeof field.Bool === "boolean") {
                if (field.Valid === false) return fallback;
                return field.Bool;
            }
            if (typeof field.Boolean === "boolean") {
                if (field.Valid === false) return fallback;
                return field.Boolean;
            }
        }
        return fallback;
    };

    const extractNullableInteger = (field, fallback = 0) => {
        if (typeof field === "number" && Number.isFinite(field)) {
            return Math.max(0, Math.round(field));
        }
        if (typeof field === "string") {
            const numeric = Number(field);
            if (Number.isFinite(numeric)) {
                return Math.max(0, Math.round(numeric));
            }
            return fallback;
        }
        if (field && typeof field === "object") {
            const nullableCandidates = [field.Int32, field.Int64, field.Integer, field.Value];
            for (const candidate of nullableCandidates) {
                const numeric = Number(candidate);
                if (Number.isFinite(numeric)) {
                    if (field.Valid === false) return fallback;
                    return Math.max(0, Math.round(numeric));
                }
            }
        }
        return fallback;
    };

    const normalizeAllDaySpanDays = (field, fallback = 1) => {
        const normalized = extractNullableInteger(field, fallback);
        return Math.max(1, normalized || fallback || 1);
    };

    const normalizeUrgency = (raw, fallback = "normal") => {
        const value = extractNullableString(raw).toLowerCase().trim();
        if (value === "low") return "low";
        if (value === "normal" || value === "medium") return "normal";
        if (value === "high") return "high";
        if (value === "max") return "max";
        if (value === "ultimate" || value === "urgent") return "ultimate";
        return fallback;
    };

    const mapUrgencyToPriority = (urgency) => {
        if (urgency === "ultimate" || urgency === "max") return "urgent";
        if (urgency === "high") return "high";
        if (urgency === "low") return "low";
        return "normal";
    };

    const normalizeKind = (rawKind) => {
        const kind = extractNullableString(rawKind).toLowerCase().trim();
        if (kind === "task" || kind === "reminder") return kind;
        return "reminder";
    };

    const normalizeOffsetArray = (raw) => {
        const toMinutesArray = (source) =>
            source
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value >= 0)
                .map((value) => Math.round(value));

        if (!raw) return [];
        if (Array.isArray(raw)) return toMinutesArray(raw);

        if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (!trimmed || trimmed === "{}") return [];

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return toMinutesArray(parsed);
                }
            } catch {
                // Fall through and attempt postgres-style array parsing.
            }

            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                const inner = trimmed.slice(1, -1).trim();
                if (!inner) return [];
                return toMinutesArray(inner.split(",").map((token) => token.trim()));
            }

            return toMinutesArray(
                trimmed
                    .split(",")
                    .map((token) => token.trim())
                    .filter(Boolean),
            );
        }

        if (typeof raw === "object") {
            if (raw.Valid === false) return [];
            const candidates = [
                raw.Int32Array,
                raw.Int64Array,
                raw.Array,
                raw.Ints,
                raw.Values,
            ];
            for (const candidate of candidates) {
                if (Array.isArray(candidate)) {
                    return toMinutesArray(candidate);
                }
            }
        }

        return [];
    };

    const detectTimeZone = () => {
        try {
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (typeof timeZone === "string" && timeZone.trim()) {
                return timeZone.trim();
            }
        } catch {
            // Ignore and fallback.
        }
        return "UTC";
    };

    const toIanaTimeZone = (raw) => {
        const candidate = extractNullableString(raw).trim();
        if (candidate) return candidate;
        return detectTimeZone();
    };

    const deriveScheduleStartLocal = (input = {}) => {
        const fromPayload = extractNullableTime(
            input.start_local ?? input.startLocal ?? input.StartLocal,
        );
        if (fromPayload) return fromPayload;

        const instantIso = input?.schedule?.instant?.iso;
        if (typeof instantIso === "string" && instantIso.trim()) {
            return instantIso.trim();
        }

        const recurrenceStart = input?.schedule?.recurrence?.start;
        if (typeof recurrenceStart === "string" && recurrenceStart.trim()) {
            return recurrenceStart.trim();
        }

        return null;
    };

    const normalizeScheduleDeleteMode = (value) => {
        const mode = extractNullableString(value).toLowerCase().trim();
        if (VALID_SCHEDULE_DELETE_MODES.has(mode)) {
            return mode;
        }
        return "schedule_only";
    };

    const buildScheduleDeletePayload = (input) => {
        const source =
            input && typeof input === "object"
                ? input
                : {
                    id: input,
                };

        const id =
            source.id ??
            source.schedule_id ??
            source.scheduleId ??
            source.ID ??
            source.ScheduleID;
        if (!id) return null;

        const deleteMode = normalizeScheduleDeleteMode(
            source.delete_mode ?? source.deleteMode ?? source.DeleteMode,
        );
        const payload = {
            id: String(id),
            delete_mode: deleteMode,
        };

        if (deleteMode === "schedule_and_future_occurrences_after_date") {
            const futureFrom = extractNullableString(
                source.future_from ?? source.futureFrom ?? source.FutureFrom,
            ).trim();
            if (!futureFrom || !isValidRfc3339Timestamp(futureFrom)) {
                return null;
            }
            payload.future_from = futureFrom;
        }

        return payload;
    };

    const buildScheduleMutationPayload = (input = {}, { requireId = false } = {}) => {
        const id =
            input.id ??
            input.schedule_id ??
            input.uuid ??
            input.ID ??
            input.ScheduleID ??
            input.UUID;
        if (requireId && !id) return null;

        const startLocal = deriveScheduleStartLocal(input);
        if (!startLocal) return null;
        if (!isValidRfc3339Timestamp(startLocal)) return null;

        const kind = normalizeKind(input.kind ?? input.type ?? input.Kind ?? input.Type);
        const urgency = normalizeUrgency(input.urgency ?? input.Urgency, "normal");
        const title = extractNullableString(input.title).trim() || "Untitled schedule";
        const showBeforeMinutes = extractNullableInteger(
            input.show_before_minutes ?? input.showBeforeMinutes ?? input.ShowBeforeMinutes,
            0,
        );
        const durationMinutes = extractNullableInteger(
            input.duration_minutes ?? input.durationMinutes ?? input.DurationMinutes,
            0,
        );
        const isAllDay = extractNullableBoolean(input.is_all_day ?? input.isAllDay, false);
        const allDaySpanDays = normalizeAllDaySpanDays(
            input.all_day_span_days ?? input.allDaySpanDays,
            1,
        );

        const payload = {
            kind,
            title,
            tz: toIanaTimeZone(input.tz ?? input.TZ ?? input.TimeZone),
            start_local: startLocal,
            urgency,
            notify_offsets_min: normalizeOffsetArray(
                input.notify_offsets_min ?? input.notifyOffsetsMin ?? input.NotifyOffsetsMin,
            ),
            muted_offsets_min: normalizeOffsetArray(
                input.muted_offsets_min ?? input.mutedOffsetsMin ?? input.MutedOffsetsMin,
            ),
            is_all_day: isAllDay,
            all_day_span_days: allDaySpanDays,
            duration_minutes: durationMinutes,
        };

        if (requireId) {
            payload.id = id;
        }

        const hasRruleField =
            Object.prototype.hasOwnProperty.call(input, "rrule") ||
            Object.prototype.hasOwnProperty.call(input, "RRule") ||
            Object.prototype.hasOwnProperty.call(input, "RRULE");
        if (hasRruleField) {
            const rrule = extractNullableString(input.rrule ?? input.RRule ?? input.RRULE).trim();
            payload.rrule = rrule.length > 0 ? rrule : null;
        }

        const hasUntilField =
            Object.prototype.hasOwnProperty.call(input, "until_local") ||
            Object.prototype.hasOwnProperty.call(input, "untilLocal") ||
            Object.prototype.hasOwnProperty.call(input, "UntilLocal");
        if (hasUntilField) {
            const rawUntilLocal = input.until_local ?? input.untilLocal ?? input.UntilLocal;
            if (rawUntilLocal === null || rawUntilLocal === "") {
                payload.until_local = null;
            } else {
                const untilLocal = extractNullableTime(rawUntilLocal);
                if (!untilLocal || !isValidRfc3339Timestamp(untilLocal)) return null;
                payload.until_local = untilLocal;
            }
        }

        payload.show_before_minutes = showBeforeMinutes;

        const hasCategoryField =
            Object.prototype.hasOwnProperty.call(input, "category") ||
            Object.prototype.hasOwnProperty.call(input, "Category");
        if (hasCategoryField) {
            const rawCategory = input.category ?? input.Category;
            const category = extractNullableString(rawCategory).trim();
            payload.category = category.length > 0 ? category : null;
        } else {
            const category = extractNullableString(input.category ?? input.Category).trim();
            if (category) payload.category = category;
        }

        const hasCommonLanguageField =
            Object.prototype.hasOwnProperty.call(input, "common_language") ||
            Object.prototype.hasOwnProperty.call(input, "commonLanguage") ||
            Object.prototype.hasOwnProperty.call(input, "CommonLanguage");
        if (hasCommonLanguageField) {
            const rawCommonLanguage =
                input.common_language ?? input.commonLanguage ?? input.CommonLanguage;
            const commonLanguage = extractNullableString(rawCommonLanguage).trim();
            payload.common_language = commonLanguage.length > 0 ? commonLanguage : null;
        } else {
            const commonLanguage = extractNullableString(
                input.common_language ?? input.commonLanguage ?? input.CommonLanguage,
            ).trim();
            if (commonLanguage) payload.common_language = commonLanguage;
        }

        if (input.template_use && typeof input.template_use === "object") {
            payload.template_use = input.template_use;
        }

        return payload;
    };

    const buildReminderSubmitPayload = (input = {}) => {
        if (!input || typeof input !== "object") {
            return input;
        }

        const kind = normalizeKind(input.kind ?? input.type ?? input.Kind ?? input.Type);
        const urgency = normalizeUrgency(input.urgency ?? input.Urgency, "normal");
        const startLocal = deriveScheduleStartLocal(input);
        const title = extractNullableString(input.title).trim() || "Untitled schedule";
        const showBeforeMinutes = extractNullableInteger(
            input.show_before_minutes ?? input.showBeforeMinutes ?? input.ShowBeforeMinutes,
            0,
        );
        const durationMinutes = extractNullableInteger(
            input.duration_minutes ?? input.durationMinutes ?? input.DurationMinutes,
            0,
        );
        const isAllDay = extractNullableBoolean(input.is_all_day ?? input.isAllDay, false);
        const allDaySpanDays = normalizeAllDaySpanDays(
            input.all_day_span_days ?? input.allDaySpanDays,
            1,
        );
        const untilLocal = extractNullableTime(
            input.until_local ?? input.untilLocal ?? input.UntilLocal,
        );

        const payload = {
            ...input,
            kind,
            title,
            tz: toIanaTimeZone(input.tz ?? input.TZ ?? input.TimeZone),
            urgency,
            priority: mapUrgencyToPriority(urgency),
            notify_offsets_min: normalizeOffsetArray(
                input.notify_offsets_min ?? input.notifyOffsetsMin ?? input.NotifyOffsetsMin,
            ),
            muted_offsets_min: normalizeOffsetArray(
                input.muted_offsets_min ?? input.mutedOffsetsMin ?? input.MutedOffsetsMin,
            ),
            show_before_minutes: showBeforeMinutes,
            is_all_day: isAllDay,
            all_day_span_days: allDaySpanDays,
            duration_minutes: durationMinutes,
        };
        if (startLocal && isValidRfc3339Timestamp(startLocal)) {
            payload.start_local = startLocal;
        } else {
            delete payload.start_local;
        }
        if (untilLocal && isValidRfc3339Timestamp(untilLocal)) {
            payload.until_local = untilLocal;
        } else if (untilLocal) {
            delete payload.until_local;
        }
        return payload;
    };

    const parseRruleString = (rruleString) => {
        if (!rruleString) return { startTime: null, recurrenceRule: "" };

        const lines = rruleString
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line);
        let startTime = null;
        let recurrenceRule = "";

        for (const line of lines) {
            if (line.startsWith("DTSTART:")) {
                const dtstart = line.substring(8);
                try {
                    const year = dtstart.substring(0, 4);
                    const month = dtstart.substring(4, 6);
                    const day = dtstart.substring(6, 8);
                    const hour = dtstart.substring(9, 11);
                    const minute = dtstart.substring(11, 13);
                    const second = dtstart.substring(13, 15);

                    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
                    startTime = date.toLocaleString();
                } catch (e) {
                    startTime = dtstart;
                }
            } else if (line.startsWith("RRULE:")) {
                recurrenceRule = line.substring(6);
            }
        }

        if (!recurrenceRule) {
            recurrenceRule = lines.find((line) => !line.startsWith("DTSTART:")) ?? "";
        }

        return { startTime, recurrenceRule };
    };

    const normalizeSchedule = (raw) => {
        if (!raw) return null;
        const id =
            raw.id ??
            raw.schedule_id ??
            raw.uuid ??
            raw.ID ??
            raw.ScheduleID ??
            raw.UUID;
        if (!id) return null;

        // Extract rrule string from Go nullable type
        const rruleText = extractNullableString(raw.rrule ?? raw.RRule ?? raw.RRULE);
        const startLocal = extractNullableTime(
            raw.start_local ?? raw.startLocal ?? raw.StartLocal,
        );
        const untilLocal = extractNullableTime(
            raw.until_local ?? raw.untilLocal ?? raw.UntilLocal,
        );
        const active = extractNullableBoolean(
            raw.active ?? raw.is_active ?? raw.Active ?? raw.IsActive,
            true,
        );
        const showBeforeMinutes = extractNullableInteger(
            raw.show_before_minutes ?? raw.showBeforeMinutes ?? raw.ShowBeforeMinutes,
            0,
        );
        const deletedAt = extractNullableTime(raw.deleted_at ?? raw.deletedAt ?? raw.DeletedAt);
        const isAllDay = extractNullableBoolean(
            raw.is_all_day ?? raw.isAllDay ?? raw.IsAllDay,
            false,
        );
        const allDaySpanDays = normalizeAllDaySpanDays(
            raw.all_day_span_days ?? raw.allDaySpanDays ?? raw.AllDaySpanDays,
            1,
        );
        const durationMinutes = extractNullableInteger(
            raw.duration_minutes ?? raw.durationMinutes ?? raw.DurationMinutes,
            0,
        );

        const deriveTitle = () => {
            const sources = [
                raw.title,
                raw.name,
                raw.label,
                raw.summary,
                raw.description,
            ];
            for (const source of sources) {
                if (!source) continue;
                if (typeof source === "string" && source.trim()) {
                    return source.trim();
                }
                if (typeof source === "object") {
                    const extracted = extractNullableString(source);
                    if (extracted) {
                        return extracted;
                    }
                }
            }
            return "";
        };
        const displayTitle = deriveTitle();

        let displayInfo = {
            startTime: null,
            recurrenceRule: ""
        };

        if (!rruleText || rruleText === "") {
            // No rrule, use start_local for one-time schedules
            if (startLocal) {
                try {
                    const date = new Date(startLocal);
                    displayInfo.startTime = date.toLocaleString();
                    displayInfo.recurrenceRule = "One-time schedule";
                } catch (e) {
                    displayInfo.startTime = startLocal;
                    displayInfo.recurrenceRule = "One-time schedule";
                }
            } else {
                displayInfo.recurrenceRule = "No schedule information";
            }
        } else {
            // Has rrule, parse it
            displayInfo = parseRruleString(rruleText);
        }

        const formatDisplayDate = (value) => {
            if (!value) return null;
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return String(value);
            return parsed.toLocaleString();
        };
        const untilDisplay = formatDisplayDate(untilLocal);
        const recurrenceRuleDisplay = displayInfo.recurrenceRule
            ? untilDisplay
                ? `${displayInfo.recurrenceRule} (until ${untilDisplay})`
                : displayInfo.recurrenceRule
            : untilDisplay
                ? `Recurs until ${untilDisplay}`
                : displayInfo.recurrenceRule;

        return {
            ...raw,
            id,
            title: displayTitle,
            kind: normalizeKind(raw.kind ?? raw.type ?? raw.Kind ?? raw.Type),
            tz: toIanaTimeZone(raw.tz ?? raw.TZ ?? raw.TimeZone),
            start_local: startLocal,
            until_local: untilLocal,
            rrule: rruleText,
            urgency: normalizeUrgency(raw.urgency ?? raw.Urgency, "normal"),
            notify_offsets_min: normalizeOffsetArray(
                raw.notify_offsets_min ?? raw.notifyOffsetsMin ?? raw.NotifyOffsetsMin,
            ),
            muted_offsets_min: normalizeOffsetArray(
                raw.muted_offsets_min ?? raw.mutedOffsetsMin ?? raw.MutedOffsetsMin,
            ),
            show_before_minutes: showBeforeMinutes,
            duration_minutes: durationMinutes,
            deleted_at: deletedAt,
            is_all_day: isAllDay,
            all_day_span_days: allDaySpanDays,
            startTime: displayInfo.startTime,
            recurrenceRule: recurrenceRuleDisplay,
            active,
            isActive: active,
        };
    };

    const bootstrap = (schedules = []) => {
        state.schedules.clear();
        schedules.forEach((item) => {
            const normalized = normalizeSchedule(item);
            if (!normalized || normalized.deleted_at) return;
            state.schedules.set(normalized.id, normalized);
        });
    };

    const getAllSchedules = () => {
        const schedules = Array.from(state.schedules.values());
        
        // Sort schedules: one-time first (by start time), then recurring (by title)
        return schedules.sort((a, b) => {
            const aIsOneTime = !a.rrule || a.rrule === "";
            const bIsOneTime = !b.rrule || b.rrule === "";
            
            // One-time schedules come first
            if (aIsOneTime && !bIsOneTime) return -1;
            if (!aIsOneTime && bIsOneTime) return 1;
            
            if (aIsOneTime && bIsOneTime) {
                // For one-time schedules, sort by start_local (closest first)
                const getStartTime = (schedule) => {
                    if (!schedule.start_local) return 0;
                    return new Date(schedule.start_local).getTime() || 0;
                };
                const aStart = getStartTime(a);
                const bStart = getStartTime(b);
                return aStart - bStart;
            }
            
            const titleSort = a.title.localeCompare(b.title);
            if (titleSort !== 0) return titleSort;
            const getStartTime = (schedule) => {
                if (!schedule.start_local) return 0;
                return new Date(schedule.start_local).getTime() || 0;
            };
            return getStartTime(a) - getStartTime(b);
        });
    };

    const deleteSchedule = (input) => {
        const payload = buildScheduleDeletePayload(input);
        if (!payload) return false;
        sendEvent?.("schedule_delete", payload);
        state.schedules.delete(payload.id);
        return true;
    };

    const createSchedule = (scheduleData = {}) => {
        const payload = buildScheduleMutationPayload(scheduleData, { requireId: false });
        if (!payload) return false;
        sendEvent?.("schedule_create", payload);
        return true;
    };

    const editSchedule = (scheduleData = {}) => {
        const payload = buildScheduleMutationPayload(scheduleData, { requireId: true });
        if (!payload) return false;
        sendEvent?.("schedule_edit", payload);
        return true;
    };

    const handleScheduleUpserted = (schedule) => {
        const normalized = normalizeSchedule(schedule);
        if (!normalized) return;
        if (normalized.deleted_at) {
            state.schedules.delete(normalized.id);
            return;
        }
        state.schedules.set(normalized.id, normalized);
    };

    const handleScheduleDeleted = (scheduleId) => {
        state.schedules.delete(scheduleId);
    };

    return {
        bootstrap,
        getAllSchedules,
        deleteSchedule,
        createSchedule,
        editSchedule,
        buildReminderSubmitPayload,
        handleScheduleUpserted,
        handleScheduleDeleted,
    };
}
