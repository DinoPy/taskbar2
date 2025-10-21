import {
	parseChrono,
	ensureDefaultTime,
	isRecurring,
	buildRRuleFromV4,
	getNextWeekday,
	ZONE,
} from "../common-language-parser/src/parser-browser.js";

const { ipcRenderer } = window.require("electron");

const titleInput = document.querySelector('[data-input="title"]');
const typeButtons = Array.from(document.querySelectorAll('[data-step="type"] [data-value]'));
const scheduleInput = document.querySelector('[data-input="schedule"]');
const previewStatus = document.querySelector('[data-preview-status]');
const previewCards = document.querySelector('[data-preview-cards]');
const leadHoursInput = document.querySelector('[data-input="lead-hours"]');
const leadMinutesInput = document.querySelector('[data-input="lead-minutes"]');
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

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: ZONE,
	weekday: "short",
	day: "2-digit",
	month: "short",
});

let currentStepId = "title";
let escapePrimed = false;
let escapeTimer = null;

const clamp = (value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return null;
	return Math.min(Math.max(numeric, min), max);
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

const sanitizeRecurrence = (result) => {
	try {
		const nextOccurrences = result.rule.all((_, index) => index < 3);
		return {
			text: result.text ?? result.rule.toText(),
			rule: result.rule.toString(),
			start: result.start.toISOString(),
			next: nextOccurrences.map((occurrence) => occurrence.toISOString()),
		};
	} catch (error) {
		console.warn("Failed to build recurrence preview", error);
		return {
			text: result.text ?? "",
			rule: result.rule.toString(),
			start: result.start.toISOString(),
			next: [],
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
		const meta = [];
		if (recurrenceInfo.start) {
			const startDate = new Date(recurrenceInfo.start);
			meta.push(`Starts: ${formatDate(startDate)}`);
		}
		if (recurrenceInfo.next?.length) {
			const preview = recurrenceInfo.next.map((iso) => formatDate(new Date(iso)));
			meta.push(`Next: ${preview.join(" • ")}`);
		}
		cards.push(
			createPreviewCard({
				variant: "info",
				label: "Repeats",
				value: recurrenceInfo.text || "Custom recurrence",
				meta,
			}),
		);
	}

	if (!instantInfo && !recurrenceInfo) {
		setPreviewStatus("We're still figuring this out. Try a bit more detail.", "warn");
		previewCards.innerHTML = "";
		state.scheduleResult = null;
		return;
	}

	previewCards.innerHTML = "";
	cards.forEach((card) => previewCards.appendChild(card));
	setPreviewStatus("Looks good. Press Enter to continue.", "ok");

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
	const payload = {
		title: state.title,
		kind: state.kind,
		scheduleInput: state.scheduleText,
		schedule: {
			instant: state.scheduleResult?.instant ?? null,
			recurrence: state.scheduleResult?.recurrence ?? null,
		},
		show_before_minutes: state.leadMinutes,
	};
	if (state.kind === "task") {
		payload.show_before_minutes = state.leadMinutes;
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

updateTypeSelection(state.kind);
setActiveStep("title");
normalizeLeadInputs();
parseSchedule(scheduleInput?.value ?? "");
focusActiveStep();
