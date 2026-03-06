import {
	parseChrono,
	ensureDefaultTime,
	isRecurring,
	buildRRuleFromV4,
	getNextWeekday,
	ZONE,
} from "../common-language-parser/src/parser-browser.js";
import { renderListSummary, createListSummaryStyles } from "./listSummary.js";

const { ipcRenderer } = window.require("electron");

const titleInput = document.querySelector('[data-input="title"]');
const typeButtons = Array.from(document.querySelectorAll('[data-step="type"] [data-value]'));
const scheduleInput = document.querySelector('[data-input="schedule"]');
const previewStatus = document.querySelector('[data-preview-status]');
const previewCards = document.querySelector('[data-preview-cards]');
const urgencySelect = document.querySelector('[data-input="urgency"]');
const notifyOffsetsInput = document.querySelector('[data-input="notify-offsets"]');
const mutedOffsetsInput = document.querySelector('[data-input="muted-offsets"]');
const leadHoursInput = document.querySelector('[data-input="lead-hours"]');
const leadMinutesInput = document.querySelector('[data-input="lead-minutes"]');
const categorySelect = document.querySelector('[data-input="category"]');
const escapeHint = document.querySelector('[data-escape-hint]');
const progressLabel = document.querySelector("[data-progress]");
const closeButton = document.querySelector('[data-action="close"]');

const stepElements = new Map([
	["title", document.querySelector('[data-step="title"]')],
	["type", document.querySelector('[data-step="type"]')],
	["schedule", document.querySelector('[data-step="schedule"]')],
	["lead", document.querySelector('[data-step="lead"]')],
]);

const pillElements = new Map([
	["title", document.querySelector('[data-pill="title"]')],
	["type", document.querySelector('[data-pill="type"]')],
	["schedule", document.querySelector('[data-pill="schedule"]')],
	["lead", document.querySelector('[data-pill="lead"]')],
]);

const flows = {
	reminder: ["title", "type", "schedule"],
	task: ["title", "type", "schedule", "lead"],
};

const state = {
	title: "",
	kind: "reminder",
	scheduleText: "",
	scheduleResult: null,
	leadMinutes: 15,
	category: "Life",
	urgency: "normal",
	notifyOffsetsMin: [],
	mutedOffsetsMin: [],
	templateUse: null,
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: ZONE,
	weekday: "short",
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: ZONE,
	month: "short",
});

const RRULE_FREQ_UNITS = Object.freeze({
	0: "year",
	1: "month",
	2: "week",
	3: "day",
	4: "hour",
	5: "minute",
	6: "second",
});

const WEEKDAY_LABELS = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

let currentStepId = "title";
let escapePrimed = false;
let escapeTimer = null;

const clamp = (value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return null;
	return Math.min(Math.max(numeric, min), max);
};

const normalizeUrgency = (value, fallback = "normal") => {
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

const parseOffsetMinutes = (rawValue) => {
	if (!rawValue || typeof rawValue !== "string") return [];
	const values = rawValue
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean)
		.map((token) => Number(token))
		.filter((token) => Number.isFinite(token) && token >= 0)
		.map((token) => Math.round(token));

	return [...new Set(values)];
};

const detectLocalTimeZone = () => {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (typeof zone === "string" && zone.trim().length > 0) {
			return zone.trim();
		}
	} catch {
		// Ignore and fallback.
	}
	return ZONE;
};

const toOffsetDateTimeString = (source) => {
	if (!source) return null;
	const date = source instanceof Date ? source : new Date(source);
	if (Number.isNaN(date.getTime())) return null;

	const pad = (value) => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hour = pad(date.getHours());
	const minute = pad(date.getMinutes());
	const second = pad(date.getSeconds());
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absoluteOffset = Math.abs(offsetMinutes);
	const offsetHours = pad(Math.floor(absoluteOffset / 60));
	const offsetMins = pad(absoluteOffset % 60);

	return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetMins}`;
};

const deriveStartLocal = (scheduleResult) => {
	if (!scheduleResult) return null;
	const startSource =
		scheduleResult?.instant?.iso ??
		scheduleResult?.recurrence?.start ??
		null;
	if (!startSource) return null;
	return toOffsetDateTimeString(startSource) ?? startSource;
};

const debounce = (fn, delay = 160) => {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), delay);
	};
};

const getFlow = () => flows[state.kind === "task" ? "task" : "reminder"];

const showError = (key, visible) => {
	const el = document.querySelector(`[data-error="${key}"]`);
	if (!el) return;
	if (visible) {
		el.removeAttribute("hidden");
	} else {
		el.setAttribute("hidden", "");
	}
};

const setPreviewStatus = (message, variant = "muted") => {
	if (!previewStatus) return;
	previewStatus.textContent = message;
	previewStatus.classList.remove("ok", "warn", "error");
	if (variant === "ok") {
		previewStatus.classList.add("ok");
	} else if (variant === "warn") {
		previewStatus.classList.add("warn");
	} else if (variant === "error") {
		previewStatus.classList.add("error");
	}
};

const resetEscapePrime = () => {
	escapePrimed = false;
	if (escapeTimer) {
		clearTimeout(escapeTimer);
		escapeTimer = null;
	}
	if (escapeHint) {
		escapeHint.classList.remove("visible");
		escapeHint.setAttribute("hidden", "");
	}
};

const focusActiveStep = () => {
	switch (currentStepId) {
		case "title":
			titleInput?.focus();
			titleInput?.select();
			break;
		case "type": {
			const selected = typeButtons.find((btn) => btn.dataset.value === state.kind) ?? typeButtons[0];
			selected?.focus();
			break;
		}
		case "schedule":
			scheduleInput?.focus();
			scheduleInput?.select();
			break;
		case "lead":
			leadHoursInput?.focus();
			leadHoursInput?.select();
			break;
		default:
			break;
	}
};

const updateProgress = () => {
	const flow = getFlow();
	const index = flow.indexOf(currentStepId);
	if (index === -1) return;
	const total = flow.length;
	progressLabel.textContent = `Step ${index + 1} of ${total}`;
};

const updatePills = () => {
	const flow = getFlow();
	pillElements.forEach((el, id) => {
		if (!el) return;
		if (!flow.includes(id)) {
			el.classList.add("hidden");
			el.classList.remove("active", "completed");
			return;
		}
		el.classList.remove("hidden");
		const index = flow.indexOf(id);
		const currentIndex = flow.indexOf(currentStepId);
		el.classList.toggle("active", id === currentStepId);
		el.classList.toggle("completed", index < currentIndex);
	});
};

const setActiveStep = (stepId) => {
	const flow = getFlow();
	if (!flow.includes(stepId)) {
		stepId = flow[flow.length - 1];
	}
	currentStepId = stepId;
	stepElements.forEach((element, id) => {
		if (!element) return;
		if (id === stepId) {
			element.classList.add("active");
		} else {
			element.classList.remove("active");
		}
		if (getFlow().includes(id)) {
			element.removeAttribute("hidden");
		} else {
			element.setAttribute("hidden", "");
		}
	});
	updateProgress();
	updatePills();
	const flowIndex = flow.indexOf(stepId);
	if (flowIndex > 0) {
		resetEscapePrime();
	}
	focusActiveStep();
};

const closeWindow = () => {
	ipcRenderer.send("lists-unsubscribe");
	ipcRenderer.send("reminder-close-window");
	window.close();
};

const ensureFutureDate = (date, now) => {
	if (!date || !now) return date;
	if (date > now) return date;
	const future = new Date(date.getTime());
	future.setDate(future.getDate() + 1);
	return future;
};

const formatDate = (date) => dateTimeFormatter.format(date);

const createPreviewCard = ({ variant = "info", label, value, meta = [] }) => {
	const card = document.createElement("div");
	card.className = `preview-card ${variant}`;
	const labelEl = document.createElement("span");
	labelEl.className = "preview-label";
	labelEl.textContent = label;
	card.appendChild(labelEl);
	const valueEl = document.createElement("div");
	valueEl.className = "preview-value";
	valueEl.textContent = value;
	card.appendChild(valueEl);
	meta.forEach((line) => {
		const metaEl = document.createElement("div");
		metaEl.className = "preview-meta";
		metaEl.textContent = line;
		card.appendChild(metaEl);
	});
	return card;
};

const toFiniteNumber = (value) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return null;
	return numeric;
};

const toValidDate = (value) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
};

const toNumberList = (value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
	if (!Array.isArray(value)) return [];
	const unique = new Set();
	value.forEach((item) => {
		const numeric = toFiniteNumber(item);
		if (numeric === null) return;
		if (numeric < min || numeric > max) return;
		unique.add(Math.round(numeric));
	});
	return Array.from(unique).sort((left, right) => left - right);
};

const formatList = (values, { maxItems = 10 } = {}) => {
	if (!Array.isArray(values) || values.length === 0) return "";
	if (values.length <= maxItems) return values.join(", ");
	const head = values.slice(0, maxItems).join(", ");
	return `${head} (+${values.length - maxItems} more)`;
};

const ordinal = (value) => {
	const abs = Math.abs(value);
	const remainder10 = abs % 10;
	const remainder100 = abs % 100;
	let suffix = "th";
	if (remainder10 === 1 && remainder100 !== 11) suffix = "st";
	else if (remainder10 === 2 && remainder100 !== 12) suffix = "nd";
	else if (remainder10 === 3 && remainder100 !== 13) suffix = "rd";
	return `${abs}${suffix}`;
};

const normalizeWeekdayToken = (weekday) => {
	if (typeof weekday === "number") {
		const normalized = ((weekday % 7) + 7) % 7;
		return WEEKDAY_LABELS[normalized] ?? null;
	}

	if (typeof weekday === "string") {
		const token = weekday.toUpperCase().trim();
		const index = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].indexOf(token);
		if (index === -1) return null;
		return WEEKDAY_LABELS[index];
	}

	if (weekday && typeof weekday === "object") {
		const base = normalizeWeekdayToken(weekday.weekday);
		if (!base) return null;
		if (typeof weekday.n === "number" && Number.isFinite(weekday.n) && weekday.n !== 0) {
			if (weekday.n < 0) {
				return `${ordinal(Math.abs(weekday.n))} last ${base}`;
			}
			return `${ordinal(weekday.n)} ${base}`;
		}
		return base;
	}

	return null;
};

const describeWeekdays = (byweekday) => {
	if (!Array.isArray(byweekday) || byweekday.length === 0) return "";
	const labels = [];
	byweekday.forEach((entry) => {
		const label = normalizeWeekdayToken(entry);
		if (!label) return;
		if (!labels.includes(label)) {
			labels.push(label);
		}
	});
	return formatList(labels, { maxItems: 8 });
};

const describeMonths = (bymonth) => {
	const monthNumbers = toNumberList(bymonth, { min: 1, max: 12 });
	if (monthNumbers.length === 0) return "";
	const names = monthNumbers.map((month) => {
		const sample = new Date(Date.UTC(2026, month - 1, 1, 12, 0, 0));
		return monthFormatter.format(sample);
	});
	return formatList(names, { maxItems: 8 });
};

const pad2 = (value) => String(value).padStart(2, "0");

const describeTimes = (options, startDate) => {
	const byhour = toNumberList(options.byhour, { min: 0, max: 23 });
	const byminute = toNumberList(options.byminute, { min: 0, max: 59 });
	const bysecond = toNumberList(options.bysecond, { min: 0, max: 59 });

	const validStart = toValidDate(startDate);
	const fallbackHour = validStart ? validStart.getUTCHours() : 0;
	const fallbackMinute = validStart ? validStart.getUTCMinutes() : 0;
	const fallbackSecond = validStart ? validStart.getUTCSeconds() : 0;

	const hours = byhour.length > 0 ? byhour : [fallbackHour];
	const minutes = byminute.length > 0 ? byminute : [fallbackMinute];
	const seconds = bysecond.length > 0 ? bysecond : [fallbackSecond];

	const includeSeconds = bysecond.length > 0;
	const shouldExpand = hours.length * minutes.length <= 10 && seconds.length <= 2;

	if (shouldExpand) {
		const values = [];
		hours.forEach((hour) => {
			minutes.forEach((minute) => {
				seconds.forEach((second) => {
					values.push(
						includeSeconds
							? `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
							: `${pad2(hour)}:${pad2(minute)}`,
					);
				});
			});
		});
		return `At ${formatList(values, { maxItems: 8 })}`;
	}

	const pieces = [];
	if (hours.length > 0) {
		pieces.push(`hours ${formatList(hours.map((hour) => pad2(hour)), { maxItems: 10 })}`);
	}
	if (minutes.length > 0) {
		pieces.push(`minutes ${formatList(minutes.map((minute) => pad2(minute)), { maxItems: 10 })}`);
	}
	if (includeSeconds) {
		pieces.push(`seconds ${formatList(seconds.map((second) => pad2(second)), { maxItems: 10 })}`);
	}
	if (pieces.length === 0) return "";
	return `Time pattern: ${pieces.join(" | ")}`;
};

const describeRulePattern = (options) => {
	const frequencyUnit = RRULE_FREQ_UNITS[options.freq] ?? "interval";
	const interval = toFiniteNumber(options.interval) ?? 1;
	if (frequencyUnit === "interval") {
		return interval <= 1 ? "Custom recurrence pattern" : `Repeats every ${interval} intervals`;
	}
	if (interval <= 1) {
		return `Every ${frequencyUnit}`;
	}
	return `Every ${interval} ${frequencyUnit}s`;
};

const collectNextOccurrences = (rule, startDate, limit = 8) => {
	if (!rule || typeof rule.after !== "function") return [];
	const seed = toValidDate(startDate) ?? new Date();
	const result = [];
	let cursor = new Date(seed.getTime() - 1);
	for (let index = 0; index < limit; index += 1) {
		const next = rule.after(cursor, false);
		if (!(next instanceof Date) || Number.isNaN(next.getTime())) break;
		result.push(next);
		cursor = new Date(next.getTime() + 1);
	}
	return result;
};

const mapParserWarning = (warning) => {
	const raw = String(warning ?? "").trim();
	if (!raw) return "";
	if (raw.startsWith("EXPORTER_COMPAT:")) {
		return "Compatibility note: complex include/exclude rules may export differently in external calendars.";
	}
	if (raw.startsWith("REGION_SENSITIVE:")) {
		return "Region-sensitive rule detected; verify locale assumptions before saving.";
	}
	return raw;
};

const buildRecurrenceDetails = (result) => {
	const options = result?.rule?.options ?? {};
	const startDate = toValidDate(result?.start);
	const details = [];

	if (startDate) {
		details.push(`Starts: ${formatDate(startDate)}`);
	}

	details.push(`Pattern: ${describeRulePattern(options)}`);

	const weekdays = describeWeekdays(options.byweekday);
	if (weekdays) {
		details.push(`Weekdays: ${weekdays}`);
	}

	const monthDays = toNumberList(options.bymonthday, { min: -31, max: 31 })
		.filter((value) => value !== 0)
		.map((value) => String(value));
	if (monthDays.length > 0) {
		details.push(`Month days: ${formatList(monthDays, { maxItems: 10 })}`);
	}

	const months = describeMonths(options.bymonth);
	if (months) {
		details.push(`Months: ${months}`);
	}

	const setPos = toNumberList(options.bysetpos, { min: -366, max: 366 })
		.filter((value) => value !== 0)
		.map((value) => (value < 0 ? `${ordinal(Math.abs(value))} last` : ordinal(value)));
	if (setPos.length > 0) {
		details.push(`Positions: ${formatList(setPos, { maxItems: 8 })}`);
	}

	const timeDetails = describeTimes(options, startDate);
	if (timeDetails) {
		details.push(timeDetails);
	}

	const until = toValidDate(options.until);
	const count = toFiniteNumber(options.count);
	if (until) {
		details.push(`Ends: ${formatDate(until)}`);
	} else if (count && count > 0) {
		details.push(`Ends after: ${Math.round(count)} occurrences`);
	} else {
		details.push("Ends: no explicit end date");
	}

	if (Array.isArray(result?.rdates) && result.rdates.length > 0) {
		details.push(`Extra include dates: ${result.rdates.length}`);
	}
	if (Array.isArray(result?.exdates) && result.exdates.length > 0) {
		details.push(`Excluded dates: ${result.exdates.length}`);
	}
	if (result?.completionBased === true) {
		details.push("Recurrence mode: completion-based");
	}

	const nextOccurrences = collectNextOccurrences(result?.rule, startDate ?? new Date(), 8);
	if (nextOccurrences.length > 0) {
		details.push(`Next ${nextOccurrences.length}: ${nextOccurrences.map((date) => formatDate(date)).join(" • ")}`);
	}

	const warnings = Array.isArray(result?.warnings)
		? result.warnings.map((item) => mapParserWarning(item)).filter(Boolean)
		: [];

	const fallbackText = typeof result?.text === "string" ? result.text.trim() : "";
	const summary = fallbackText.length > 0 ? fallbackText : describeRulePattern(options);

	return {
		summary,
		details,
		warnings,
		next: nextOccurrences.map((date) => date.toISOString()),
	};
};

const sanitizeRecurrence = (result) => {
	if (!result?.rule || typeof result.rule.toString !== "function") return null;
	const startDate = toValidDate(result.start);
	try {
		const details = buildRecurrenceDetails(result);
		const fallbackText = (result.text ?? result.rule.toText() ?? "").trim();
		return {
			text: details.summary || fallbackText,
			rule: result.rule.toString(),
			start: startDate ? startDate.toISOString() : null,
			next: details.next,
			details: details.details,
			warnings: details.warnings,
		};
	} catch (error) {
		console.warn("Failed to build recurrence preview", error);
		const fallbackDetails = [];
		if (startDate) {
			fallbackDetails.push(`Starts: ${formatDate(startDate)}`);
		}
		const fallbackWarnings = Array.isArray(result?.warnings)
			? result.warnings.map((item) => mapParserWarning(item)).filter(Boolean)
			: [];
		return {
			text: result.text ?? "",
			rule: result.rule.toString(),
			start: startDate ? startDate.toISOString() : null,
			next: [],
			details: fallbackDetails,
			warnings: fallbackWarnings,
		};
	}
};

const parseSchedule = (rawText) => {
	const text = (rawText ?? "").trim();
	state.scheduleText = text;
	if (text.length === 0) {
		setPreviewStatus("Start typing to see what we understand.");
		previewCards.innerHTML = "";
		state.scheduleResult = null;
		scheduleInput.classList.remove("invalid");
		showError("schedule", false);
		return;
	}

	const now = new Date();
	let chronoResult = null;
	try {
		chronoResult = parseChrono(text, now);
	} catch (error) {
		console.warn("Chrono parsing failed", error);
	}
	const recurring = isRecurring(text);

	let instantInfo = null;
	if (chronoResult && !recurring) {
		ensureDefaultTime(chronoResult);
		const parsed = chronoResult.date();
		const weekdayMatch = text.toLowerCase().match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
		let targetDate = parsed;
		if (weekdayMatch) {
			const nextWeekday = getNextWeekday(weekdayMatch[1], now);
			if (nextWeekday) {
				nextWeekday.setHours(parsed.getHours(), parsed.getMinutes(), 0, 0);
				targetDate = nextWeekday;
			}
		}
		const future = ensureFutureDate(targetDate, now);
		instantInfo = {
			label: formatDate(future),
			iso: future.toISOString(),
		};
	}

	let recurrenceInfo = null;
	if (recurring) {
		try {
			const recurrence = buildRRuleFromV4(text, now, chronoResult);
			if (recurrence) {
				recurrenceInfo = sanitizeRecurrence(recurrence);
			}
		} catch (error) {
			console.warn("Failed to build recurrence", error);
		}
	}

	const cards = [];
	if (instantInfo) {
		cards.push(
			createPreviewCard({
				variant: "ok",
				label: "Instant reminder",
				value: instantInfo.label,
			}),
		);
	}

	if (recurrenceInfo) {
		const meta = Array.isArray(recurrenceInfo.details) ? recurrenceInfo.details.slice() : [];
		if (meta.length === 0 && recurrenceInfo.start) {
			const startDate = toValidDate(recurrenceInfo.start);
			if (startDate) {
				meta.push(`Starts: ${formatDate(startDate)}`);
			}
		}
		if (meta.length === 0 && Array.isArray(recurrenceInfo.next) && recurrenceInfo.next.length > 0) {
			const preview = recurrenceInfo.next
				.map((iso) => toValidDate(iso))
				.filter(Boolean)
				.map((date) => formatDate(date));
			if (preview.length > 0) {
				meta.push(`Next: ${preview.join(" • ")}`);
			}
		}
		cards.push(
			createPreviewCard({
				variant: "info",
				label: "Repeats",
				value: recurrenceInfo.text || "Custom recurrence",
				meta,
			}),
		);
		if (Array.isArray(recurrenceInfo.warnings) && recurrenceInfo.warnings.length > 0) {
			cards.push(
				createPreviewCard({
					variant: "warn",
					label: "Check",
					value: "Review recurrence caveats",
					meta: recurrenceInfo.warnings,
				}),
			);
		}
	}

	if (!instantInfo && !recurrenceInfo) {
		setPreviewStatus("We're still figuring this out. Try a bit more detail.", "warn");
		previewCards.innerHTML = "";
		state.scheduleResult = null;
		return;
	}

	previewCards.innerHTML = "";
	cards.forEach((card) => previewCards.appendChild(card));
	const hasWarnings = Boolean(recurrenceInfo && Array.isArray(recurrenceInfo.warnings) && recurrenceInfo.warnings.length > 0);
	setPreviewStatus(
		hasWarnings
			? "Looks good with caveats. Review notes below, then press Enter."
			: "Looks good. Press Enter to continue.",
		hasWarnings ? "warn" : "ok",
	);

	state.scheduleResult = {
		input: text,
		instant: instantInfo,
		recurrence: recurrenceInfo,
	};
	showError("schedule", false);
	scheduleInput.classList.remove("invalid");
};

const validateTitle = ({ showMessage = true } = {}) => {
	const value = titleInput.value.trim();
	const valid = value.length > 0;
	if (valid) {
		state.title = value;
	}
	if (showMessage) {
		titleInput.classList.toggle("invalid", !valid);
		showError("title", !valid);
	}
	return valid;
};

const validateType = () => !!state.kind;

const validateSchedule = ({ showMessage = true } = {}) => {
	const hasResult = Boolean(state.scheduleResult && (state.scheduleResult.instant || state.scheduleResult.recurrence));
	if (showMessage && !hasResult) {
		scheduleInput.classList.add("invalid");
		showError("schedule", true);
	}
	return hasResult;
};

const normalizeLeadInputs = () => {
	if (!leadHoursInput || !leadMinutesInput) {
		// Inputs not available, use state values
		const totalMinutes = state.leadMinutes || 15;
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return { hours, minutes };
	}
	
	const hours = clamp(leadHoursInput.value || "0", { min: 0, max: 168 });
	const minutes = clamp(leadMinutesInput.value || "0", { min: 0, max: 59 });
	if (hours === null || minutes === null) {
		return null;
	}
	leadHoursInput.value = String(hours);
	leadMinutesInput.value = String(minutes);
	return { hours, minutes };
};

const validateLead = ({ showMessage = true } = {}) => {
	const parsed = normalizeLeadInputs();
	const valid = parsed !== null && parsed.hours >= 0 && parsed.minutes >= 0;
	if (valid) {
		state.leadMinutes = parsed.hours * 60 + parsed.minutes;
	}
	if (showMessage) {
		const inputs = [leadHoursInput, leadMinutesInput];
		inputs.forEach((input) => input.classList.toggle("invalid", !valid));
		showError("lead", !valid);
	}
	return valid;
};

const validateCurrentStep = (options) => {
	switch (currentStepId) {
		case "title":
			return validateTitle(options);
		case "type":
			return validateType();
		case "schedule":
			return validateSchedule(options);
		case "lead":
			return validateLead(options);
		default:
			return true;
	}
};

const moveToStep = (direction) => {
	const flow = getFlow();
	const index = flow.indexOf(currentStepId);
	const nextIndex = index + direction;
	if (nextIndex < 0 || nextIndex >= flow.length) return false;
	setActiveStep(flow[nextIndex]);
	return true;
};

const submit = () => {
	if (!validateCurrentStep({ showMessage: true })) return;
	const normalizedUrgency = normalizeUrgency(urgencySelect?.value ?? state.urgency, "normal");
	const notifyOffsetsMin = parseOffsetMinutes(notifyOffsetsInput?.value ?? "");
	const mutedOffsetsMin = parseOffsetMinutes(mutedOffsetsInput?.value ?? "");
	const startLocal = deriveStartLocal(state.scheduleResult);
	const showBeforeMinutes = state.kind === "task" ? state.leadMinutes : 0;

	state.urgency = normalizedUrgency;
	state.notifyOffsetsMin = notifyOffsetsMin;
	state.mutedOffsetsMin = mutedOffsetsMin;

	const payload = {
		title: state.title,
		kind: state.kind,
		tz: detectLocalTimeZone(),
		start_local: startLocal,
		urgency: normalizedUrgency,
		notify_offsets_min: notifyOffsetsMin,
		muted_offsets_min: mutedOffsetsMin,
		scheduleInput: state.scheduleText,
		schedule: {
			instant: state.scheduleResult?.instant ?? null,
			recurrence: state.scheduleResult?.recurrence ?? null,
		},
		show_before_minutes: showBeforeMinutes,
		category: state.category,
	};
	if (state.templateUse) {
		payload.template_use = state.templateUse;
	}
	const trimmedLanguage = (state.scheduleText ?? "").trim();
	if (trimmedLanguage) {
		payload.common_language = trimmedLanguage;
	}
	ipcRenderer.send("reminder-submit", payload);
	window.close();
};

const handleEnter = () => {
	if (!validateCurrentStep({ showMessage: true })) return;
	const progressed = moveToStep(1);
	if (!progressed) {
		submit();
	}
};

const handleEscape = () => {
	const movedBack = moveToStep(-1);
	if (movedBack) return;
	if (!escapePrimed) {
		escapePrimed = true;
		if (escapeHint) {
			escapeHint.removeAttribute("hidden");
			requestAnimationFrame(() => escapeHint.classList.add("visible"));
		}
		escapeTimer = setTimeout(() => {
			resetEscapePrime();
		}, 1600);
		return;
	}
	closeWindow();
};

const updateTypeSelection = (value) => {
	if (value !== "reminder" && value !== "task") return;
	if (state.kind === value) return;
	state.kind = value;
	typeButtons.forEach((button) => {
		const isActive = button.dataset.value === value;
		button.classList.toggle("selected", isActive);
		button.setAttribute("aria-checked", String(isActive));
	});
	updatePills();
	updateProgress();
	const flow = getFlow();
	if (!flow.includes(currentStepId)) {
		setActiveStep(flow[flow.length - 1]);
	}
	if (currentStepId === "lead" && value !== "task") {
		setActiveStep("schedule");
	}
};

const handleTypeToggle = (direction) => {
	const ordered = ["reminder", "task"];
	const index = ordered.indexOf(state.kind);
	if (index === -1) return;
	const nextIndex = (index + direction + ordered.length) % ordered.length;
	updateTypeSelection(ordered[nextIndex]);
	const button = typeButtons.find((btn) => btn.dataset.value === ordered[nextIndex]);
	button?.focus();
};

const handleGlobalKeyDown = (event) => {
	if (event.key === "Enter") {
		event.preventDefault();
		handleEnter();
	} else if (event.key === "Escape") {
		event.preventDefault();
		handleEscape();
	}
};

titleInput?.addEventListener("input", () => {
	state.title = titleInput.value.trim();
	if (state.title.length > 0) {
		titleInput.classList.remove("invalid");
		showError("title", false);
	}
});

typeButtons.forEach((button) => {
	button.addEventListener("click", () => {
		updateTypeSelection(button.dataset.value);
		if (currentStepId === "type") {
			setTimeout(() => handleEnter(), 120);
		}
	});
	button.addEventListener("keydown", (event) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			handleTypeToggle(-1);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			handleTypeToggle(1);
		}
	});
});

if (leadHoursInput) {
	leadHoursInput.addEventListener("input", () => {
		normalizeLeadInputs();
		leadHoursInput.classList.remove("invalid");
		showError("lead", false);
	});
}

if (leadMinutesInput) {
	leadMinutesInput.addEventListener("input", () => {
		normalizeLeadInputs();
		leadMinutesInput.classList.remove("invalid");
		showError("lead", false);
	});
}

categorySelect?.addEventListener("change", () => {
	state.category = categorySelect.value;
});

urgencySelect?.addEventListener("change", () => {
	state.urgency = normalizeUrgency(urgencySelect.value, "normal");
});

notifyOffsetsInput?.addEventListener("input", () => {
	state.notifyOffsetsMin = parseOffsetMinutes(notifyOffsetsInput.value);
});

mutedOffsetsInput?.addEventListener("input", () => {
	state.mutedOffsetsMin = parseOffsetMinutes(mutedOffsetsInput.value);
});

const debouncedSchedule = debounce(parseSchedule, 140);
scheduleInput?.addEventListener("input", (event) => {
	const value = event.target.value;
	debouncedSchedule(value);
	scheduleInput.classList.remove("invalid");
	if (value.trim().length === 0) {
		showError("schedule", false);
	}
});

document.addEventListener("keydown", handleGlobalKeyDown, true);
closeButton?.addEventListener("click", closeWindow);

ipcRenderer.on("reminder-categories", (_, categories) => {
	if (!categorySelect) return;
	categorySelect.innerHTML = "";
	categories.forEach((cat) => {
		const option = document.createElement("option");
		option.value = cat;
		option.textContent = cat;
		option.selected = cat === state.category;
		categorySelect.appendChild(option);
	});
});

ipcRenderer.on("reminder-template-use", (_, templateUse) => {
	if (!templateUse) return;
	state.templateUse = templateUse;
	state.kind = "task";
	state.title = "(from template)";
	updateTypeSelection("task");
	titleInput.value = state.title;
	titleInput.disabled = true;
	titleInput.classList.add("disabled");
	setActiveStep("schedule");
});

document.head.appendChild(createListSummaryStyles());

// Listen for data-from-parent in case window is opened to edit an existing schedule
ipcRenderer.on("data-from-parent", (_, data) => {
	const scheduleId = data?.schedule_id ?? data?.scheduleId ?? null;
	if (!scheduleId) return;

	const listTarget = { kind: "schedule", id: scheduleId };
	const container = document.createElement("div");
	container.id = "reminderListSummaryContainer";
	container.style.margin = "8px 0";
	// Insert before the close button or at end of body
	const insertBefore = document.querySelector('[data-action="close"]');
	if (insertBefore && insertBefore.parentElement) {
		insertBefore.parentElement.insertBefore(container, insertBefore);
	} else {
		document.body.appendChild(container);
	}

	ipcRenderer.send("lists-fetch", { target: listTarget });
	const onListsData = (__, payload) => {
		if (!payload?.target || payload.target.kind !== "schedule" || payload.target.id !== scheduleId) return;
		ipcRenderer.removeListener("lists-data", onListsData);
		container.innerHTML = "";
		const summary = renderListSummary({
			lists: payload.lists ?? [],
			target: listTarget,
		});
		container.appendChild(summary);
	};
	ipcRenderer.on("lists-data", onListsData);
});

updateTypeSelection(state.kind);
setActiveStep("title");
normalizeLeadInputs();
parseSchedule(scheduleInput?.value ?? "");
if (urgencySelect) {
	urgencySelect.value = state.urgency;
}
if (notifyOffsetsInput) {
	notifyOffsetsInput.value = state.notifyOffsetsMin.join(", ");
}
if (mutedOffsetsInput) {
	mutedOffsetsInput.value = state.mutedOffsetsMin.join(", ");
}
focusActiveStep();
