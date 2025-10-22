export function createSchedulesController({ sendEvent, log = console.log }) {
    const state = {
        schedules: new Map(), // id -> schedule object
    };

    const extractNullableString = (field) => {
        if (!field) return "";
        if (typeof field === "string") return field;
        if (field.Valid && typeof field.String === "string") return field.String;
        return "";
    };

    const extractNullableTime = (field) => {
        if (!field) return null;
        if (typeof field === "string") return field;
        if (field.Valid && field.Time) return field.Time;
        return null;
    };

    const parseRruleString = (rruleString) => {
        if (!rruleString) return { startTime: null, recurrenceRule: "" };
        
        const lines = rruleString.split('\n').map(line => line.trim()).filter(line => line);
        let startTime = null;
        let recurrenceRule = "";
        
        for (const line of lines) {
            if (line.startsWith('DTSTART:')) {
                const dtstart = line.substring(8); // Remove 'DTSTART:'
                try {
                    // Parse ISO format like 20251021T181800Z
                    const year = dtstart.substring(0, 4);
                    const month = dtstart.substring(4, 6);
                    const day = dtstart.substring(6, 8);
                    const hour = dtstart.substring(9, 11);
                    const minute = dtstart.substring(11, 13);
                    const second = dtstart.substring(13, 15);
                    
                    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
                    startTime = date.toLocaleString();
                } catch (e) {
                    startTime = dtstart; // Fallback to raw string
                }
            } else if (line.startsWith('RRULE:')) {
                recurrenceRule = line.substring(6); // Remove 'RRULE:'
            }
        }
        
        return { startTime, recurrenceRule };
    };

    const normalizeSchedule = (raw) => {
        if (!raw) return null;
        const id = raw.id ?? raw.schedule_id ?? raw.uuid;
        if (!id) return null;

        // Extract rrule string from Go nullable type
        const rruleText = extractNullableString(raw.rrule);
        const startLocal = extractNullableTime(raw.start_local);
        
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

        return {
            ...raw,
            id,
            title: raw.title ?? "",
            rrule: rruleText,
            startTime: displayInfo.startTime,
            recurrenceRule: displayInfo.recurrenceRule,
            isActive: raw.is_active ?? raw.active ?? true,
        };
    };

    const bootstrap = (schedules = []) => {
        state.schedules.clear();
        schedules.forEach((item) => {
            const normalized = normalizeSchedule(item);
            if (normalized) state.schedules.set(normalized.id, normalized);
        });
    };

    const getAllSchedules = () => {
        const schedules = Array.from(state.schedules.values());
        
        // Sort schedules: one-time first, then recurring
        return schedules.sort((a, b) => {
            const aIsOneTime = !a.rrule || a.rrule === "";
            const bIsOneTime = !b.rrule || b.rrule === "";
            
            // One-time schedules come first
            if (aIsOneTime && !bIsOneTime) return -1;
            if (!aIsOneTime && bIsOneTime) return 1;
            
            // Within same type, sort by title alphabetically
            return a.title.localeCompare(b.title);
        });
    };

    const deleteSchedule = (id) => {
        if (!state.schedules.has(id)) return false;
        sendEvent?.("schedule_delete", { id: id });
        state.schedules.delete(id);
        return true;
    };

    const handleScheduleUpserted = (schedule) => {
        const normalized = normalizeSchedule(schedule);
        if (normalized) state.schedules.set(normalized.id, normalized);
    };

    const handleScheduleDeleted = (scheduleId) => {
        state.schedules.delete(scheduleId);
    };

    return {
        bootstrap,
        getAllSchedules,
        deleteSchedule,
        handleScheduleUpserted,
        handleScheduleDeleted,
    };
}
