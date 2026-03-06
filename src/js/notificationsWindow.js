import { renderListSummary, createListSummaryStyles } from "./listSummary.js";

const { ipcRenderer } = window.require("electron");

const MAX_HEIGHT = 420;
const LOAD_MORE_THRESHOLD = 12;

const rootEl = document.querySelector(".notifications-root");
const subtitleEl = document.querySelector(".notifications-subtitle");
const unseenListEl = document.getElementById("unseenList");
const unseenScrollEl = document.querySelector(".unseen-scroll");
const historyListEl = document.getElementById("historyList");
const historyScrollEl = document.querySelector(".history-scroll");
const historyLoadingEl = document.getElementById("historyLoading");
const toggleHistoryBtn = document.querySelector('[data-action="toggle-history"]');
const unseenEmptyState = document.querySelector('[data-empty="unseen"]');
const historyEmptyState = document.querySelector('[data-empty="history"]');
const schedulesScrollEl = document.querySelector(".schedules-scroll");

// Tab elements
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const schedulesListEl = document.getElementById("schedulesList");
const schedulesEmptyState = document.querySelector('[data-empty="schedules"]');

// Snoozed tab elements
const snoozedListEl = document.getElementById("snoozedList");
const snoozedScrollEl = document.querySelector(".snoozed-scroll");
const snoozedLoadingEl = document.getElementById("snoozedLoading");
const snoozedEmptyState = document.querySelector('[data-empty="snoozed"]');

// Archived tab elements
const archivedListEl = document.getElementById("archivedList");
const archivedScrollEl = document.querySelector(".archived-scroll");
const archivedLoadingEl = document.getElementById("archivedLoading");
const archivedEmptyState = document.querySelector('[data-empty="archived"]');

const state = {
	activeTab: "unseen",
	showHistory: false,
	hasMoreHistory: false,
	loadingMore: false,
	lastHistoryLength: 0,
	// Snoozed tab state
	showSnoozed: false,
	hasMoreSnoozed: false,
	loadingMoreSnoozed: false,
	lastSnoozedLength: 0,
	// Archived tab state
	showArchived: false,
	hasMoreArchived: false,
	loadingMoreArchived: false,
	lastArchivedLength: 0,
	mode: "hidden",
	suppressAutoSwitch: false,
};

const URGENCY_LEVELS = ["low", "normal", "high", "max", "ultimate"];
const SCHEDULE_DELETE_AFTER_DATE_MODE = "schedule_and_future_occurrences_after_date";

const REMINDER_OPTIONS = [
	{ label: "15 min", minutes: 15 },
	{ label: "30 min", minutes: 30 },
	{ label: "1 hour", minutes: 60 },
	{ label: "2 hours", minutes: 120 },
	{ label: "3 hours", minutes: 180 },
	{ label: "6 hours", minutes: 360 },
	{ label: "12 hours", minutes: 720 },
	{ label: "24 hours", minutes: 1440 },
	{ label: "Custom…", minutes: null },
];

let activeReminderMenu = null;
let activeReminderButton = null;
let activeCustomForm = null;
let activeScheduleDeleteDialog = null;

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

const normalizePriority = (value, fallback = "normal") => {
	const normalized = String(value ?? "")
		.toLowerCase()
		.trim();
	if (normalized === "low") return "low";
	if (normalized === "normal" || normalized === "medium") return "normal";
	if (normalized === "high") return "high";
	if (normalized === "urgent" || normalized === "max") return "urgent";
	return fallback;
};

const resolveNotificationUrgency = (notification = {}) => {
	const payloadUrgency = normalizeUrgency(notification?.payload?.urgency, null);
	if (payloadUrgency) {
		return payloadUrgency;
	}

	const mappedPriority = normalizePriority(notification?.priority, "normal");
	if (mappedPriority === "urgent") {
		return "ultimate";
	}
	return normalizeUrgency(mappedPriority, "normal");
};

const formatUrgencyLabel = (urgency) => {
	if (urgency === "ultimate") return "ULTIMATE";
	if (urgency === "max") return "MAX";
	if (urgency === "high") return "HIGH";
	if (urgency === "low") return "LOW";
	return "NORMAL";
};

const closeReminderMenu = () => {
	if (activeReminderMenu) {
		activeReminderMenu.remove();
		activeReminderMenu = null;
	}
	if (activeReminderButton) {
		activeReminderButton.classList.remove("active");
		activeReminderButton = null;
	}
	activeCustomForm = null;
};

const parseCustomReminderInput = (input) => {
	if (!input) return null;
	const [datePart, timePart] = input.split("T");
	if (!datePart || !timePart) return null;
	const [year, month, day] = datePart.split("-").map(Number);
	const [hour, minute] = timePart.split(":").map(Number);
	if (!year || !month || !day || hour === undefined || minute === undefined) return null;
	const selected = new Date(year, month - 1, day, hour, minute, 0, 0);
	if (Number.isNaN(selected.getTime())) return null;
	const diffMs = selected.getTime() - Date.now();
	if (diffMs <= 0) return null;
	return Math.ceil(diffMs / 60000);
};

const openReminderMenu = (button) => {
	if (activeReminderButton === button) {
		closeReminderMenu();
		return;
	}

	closeReminderMenu();
	activeReminderButton = button;
	button.classList.add("active");

	const menu = document.createElement("div");
	menu.className = "reminder-menu";
	const selectedUrgency = normalizeUrgency(button.dataset.urgency, "normal");
	menu.dataset.selectedUrgency = selectedUrgency;

	const urgencyPicker = document.createElement("div");
	urgencyPicker.className = "reminder-urgency-picker";
	const urgencyLabel = document.createElement("span");
	urgencyLabel.className = "reminder-urgency-label";
	urgencyLabel.textContent = "Snooze urgency";
	urgencyPicker.appendChild(urgencyLabel);

	const urgencyButtons = document.createElement("div");
	urgencyButtons.className = "reminder-urgency-buttons";
	URGENCY_LEVELS.forEach((urgencyLevel) => {
		const urgencyBtn = document.createElement("button");
		urgencyBtn.type = "button";
		urgencyBtn.className = `reminder-urgency-btn urgency-${urgencyLevel}`;
		urgencyBtn.dataset.action = "remind-urgency";
		urgencyBtn.dataset.urgency = urgencyLevel;
		urgencyBtn.dataset.id = button.dataset.id;
		urgencyBtn.textContent = formatUrgencyLabel(urgencyLevel);
		if (urgencyLevel === selectedUrgency) {
			urgencyBtn.classList.add("active");
		}
		urgencyButtons.appendChild(urgencyBtn);
	});
	urgencyPicker.appendChild(urgencyButtons);
	menu.appendChild(urgencyPicker);

	REMINDER_OPTIONS.forEach((option) => {
		const optionBtn = document.createElement("button");
		optionBtn.type = "button";
		optionBtn.className = "reminder-option";
		optionBtn.dataset.action = option.minutes === null ? "remind-custom" : "remind-option";
		optionBtn.dataset.id = button.dataset.id;
		if (option.minutes !== null) {
			optionBtn.dataset.minutes = String(option.minutes);
		} else {
			optionBtn.classList.add("custom");
		}
		optionBtn.textContent = option.label;
		menu.appendChild(optionBtn);
	});

	button.parentElement?.appendChild(menu);
	activeReminderMenu = menu;

	// Check if menu would overflow bottom of window and position above if needed
	const menuRect = menu.getBoundingClientRect();
	const windowHeight = window.innerHeight;
	if (menuRect.bottom > windowHeight) {
		menu.classList.add("position-above");
	}
};

const openCustomReminderForm = (id) => {
	if (!activeReminderMenu) return;
	if (activeCustomForm) {
		activeCustomForm.remove();
		activeCustomForm = null;
	}

	const form = document.createElement("form");
	form.className = "reminder-custom";
	form.dataset.id = id;

	const label = document.createElement("label");
	label.textContent = "Pick date & time";

	const input = document.createElement("input");
	input.type = "datetime-local";
	const now = new Date();
	const tzOffset = now.getTimezoneOffset() * 60000;
	const defaultDate = new Date(now.getTime() + 30 * 60000);
	const minValue = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
	const defaultValue = new Date(defaultDate.getTime() - tzOffset).toISOString().slice(0, 16);
	input.min = minValue;
	input.value = defaultValue;

	const submit = document.createElement("button");
	submit.type = "submit";
	submit.textContent = "Set reminder";

	form.appendChild(label);
	form.appendChild(input);
	form.appendChild(submit);
	activeReminderMenu.appendChild(form);
	activeCustomForm = form;

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const minutes = parseCustomReminderInput(input.value);
		if (!minutes) return;
		const urgency = normalizeUrgency(activeReminderMenu?.dataset?.selectedUrgency, "normal");
		// Convert datetime-local to UTC ISO string for proper timezone handling
		const [datePart, timePart] = input.value.split("T");
		const [year, month, day] = datePart.split("-").map(Number);
		const [hour, minute] = timePart.split(":").map(Number);
		const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
		const isoString = localDate.toISOString();
		ipcRenderer.send("notifications-snooze", { id, minutes, until: isoString, urgency });
		closeReminderMenu();
	});
};

const toIsoFromDateTimeLocal = (inputValue) => {
	const text = String(inputValue ?? "").trim();
	if (!text) return null;
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
};

const closeScheduleDeleteDialog = () => {
	if (!activeScheduleDeleteDialog) return;
	if (activeScheduleDeleteDialog.keydownHandler) {
		document.removeEventListener("keydown", activeScheduleDeleteDialog.keydownHandler, true);
	}
	activeScheduleDeleteDialog.overlay?.remove();
	activeScheduleDeleteDialog = null;
};

const openScheduleDeleteDialog = ({ id, title }) => {
	if (!id) return;
	closeScheduleDeleteDialog();

	const safeTitle = String(title ?? "").trim() || "this schedule";
	const overlay = document.createElement("div");
	overlay.className = "schedule-delete-overlay";
	overlay.innerHTML = `
		<div class="schedule-delete-dialog" role="dialog" aria-modal="true" aria-label="Delete schedule">
			<h3>Delete schedule</h3>
			<p class="schedule-delete-summary">Choose how to delete <strong data-schedule-delete-title></strong>.</p>
			<form class="schedule-delete-form">
				<label class="schedule-delete-option">
					<input type="radio" name="schedule-delete-mode" value="schedule_only" checked />
					<span>Schedule only</span>
				</label>
				<label class="schedule-delete-option">
					<input type="radio" name="schedule-delete-mode" value="schedule_and_future_occurrences" />
					<span>Schedule and future occurrences</span>
				</label>
				<label class="schedule-delete-option">
					<input type="radio" name="schedule-delete-mode" value="${SCHEDULE_DELETE_AFTER_DATE_MODE}" />
					<span>Schedule and future occurrences after date</span>
				</label>
				<label class="schedule-delete-date-field hidden">
					<span>Delete future occurrences from</span>
					<input type="datetime-local" step="1" />
				</label>
				<p class="schedule-delete-validation hidden"></p>
				<div class="schedule-delete-actions">
					<button type="button" class="schedule-delete-cancel">Cancel</button>
					<button type="submit" class="schedule-delete-confirm">Delete</button>
				</div>
			</form>
		</div>
	`;
	document.body.appendChild(overlay);
	const titleEl = overlay.querySelector("[data-schedule-delete-title]");
	if (titleEl) {
		titleEl.textContent = safeTitle;
	}

	const form = overlay.querySelector(".schedule-delete-form");
	const dateField = overlay.querySelector(".schedule-delete-date-field");
	const dateInput = dateField?.querySelector("input[type='datetime-local']");
	const validationEl = overlay.querySelector(".schedule-delete-validation");
	const cancelBtn = overlay.querySelector(".schedule-delete-cancel");

	const now = new Date();
	const tzOffset = now.getTimezoneOffset() * 60000;
	const localNow = new Date(now.getTime() - tzOffset).toISOString().slice(0, 19);
	const localNowInput = localNow.slice(0, 16);
	if (dateInput) {
		dateInput.min = localNowInput;
		dateInput.value = localNowInput;
	}

	const updateDateFieldVisibility = () => {
		const selectedMode = overlay.querySelector(
			'input[name="schedule-delete-mode"]:checked',
		)?.value;
		const needsDate = selectedMode === SCHEDULE_DELETE_AFTER_DATE_MODE;
		dateField?.classList.toggle("hidden", !needsDate);
		if (!needsDate && validationEl) {
			validationEl.classList.add("hidden");
			validationEl.textContent = "";
		}
	};

	overlay
		.querySelectorAll('input[name="schedule-delete-mode"]')
		.forEach((input) => input.addEventListener("change", updateDateFieldVisibility));

	cancelBtn?.addEventListener("click", () => {
		closeScheduleDeleteDialog();
	});

	form?.addEventListener("submit", (event) => {
		event.preventDefault();
		const selectedMode = overlay.querySelector(
			'input[name="schedule-delete-mode"]:checked',
		)?.value;
		const deleteMode =
			selectedMode === "schedule_and_future_occurrences" ||
			selectedMode === SCHEDULE_DELETE_AFTER_DATE_MODE
				? selectedMode
				: "schedule_only";
		const payload = {
			id: String(id),
			delete_mode: deleteMode,
		};

		if (deleteMode === SCHEDULE_DELETE_AFTER_DATE_MODE) {
			const futureFromIso = toIsoFromDateTimeLocal(dateInput?.value);
			if (!futureFromIso) {
				if (validationEl) {
					validationEl.textContent =
						"Please choose a valid date/time for future_from.";
					validationEl.classList.remove("hidden");
				}
				return;
			}
			payload.future_from = futureFromIso;
		}

		ipcRenderer.send("schedule-delete", payload);
		closeScheduleDeleteDialog();
	});

	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) {
			closeScheduleDeleteDialog();
		}
	});

	const keydownHandler = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closeScheduleDeleteDialog();
		}
	};
	document.addEventListener("keydown", keydownHandler, true);
	activeScheduleDeleteDialog = { overlay, keydownHandler };
	updateDateFieldVisibility();
};

const formatTime = (timestamp) => {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (timestamp) => {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatBadgeDateTime = (timestamp) => {
	const datePart = formatDate(timestamp);
	const timePart = formatTime(timestamp);
	if (datePart && timePart) return `${datePart} · ${timePart}`;
	return datePart || timePart || "";
};

const parseTimestampValue = (value) => {
	if (!value) return null;
	if (value instanceof Date) {
		const time = value.getTime();
		return Number.isNaN(time) ? null : time;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return null;
		return value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length === 0) return null;
		const numeric = Number(trimmed);
		if (!Number.isNaN(numeric) && numeric > 0) {
			return numeric > 1e12 ? numeric : numeric > 1e9 ? numeric * 1000 : null;
		}
		const parsed = Date.parse(trimmed);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
};

const getSnoozedUntilTimestamp = (notification) => {
	const sources = [
		notification?.snooze_until,
		notification?.snoozedUntil,
		notification?.snoozed_until,
		notification?.meta?.snoozedUntil,
		notification?.meta?.snoozed_until,
		notification?.payload?.snoozedUntil,
		notification?.payload?.snoozed_until,
	];
	for (const candidate of sources) {
		const parsed = parseTimestampValue(candidate);
		if (parsed) return parsed;
	}
	return null;
};

const appendNotifications = (target, notifications, options) => {
	if (!target || !Array.isArray(notifications) || notifications.length === 0) return;
	const rendered = new Set();
	notifications.forEach((notification) => {
		const id = notification?.id ?? notification?.notification_id ?? notification?.uuid;
		if (!id || rendered.has(id)) return;
		rendered.add(id);
		target.appendChild(createNotificationItem(notification, options));
	});
};

const createNotificationItem = (notification, { isUnseen }) => {
	const li = document.createElement("li");
	li.className = `notifications-item ${isUnseen ? "unseen" : ""}`;
	li.dataset.id = notification.id;
	const urgency = resolveNotificationUrgency(notification);
	li.classList.add(`urgency-${urgency}`);
	const snoozedUntilTs = getSnoozedUntilTimestamp(notification);
	if (snoozedUntilTs) {
		li.classList.add("snoozed");
	}

	const infoWrapper = document.createElement("div");

	const title = document.createElement("p");
	title.className = "notification-title";
	title.textContent = notification.description || notification.title || "Notification";
	infoWrapper.appendChild(title);

	const meta = document.createElement("div");
	meta.className = "notification-meta";

	const metaLeft = document.createElement("div");
	metaLeft.className = "notification-meta-left";

	const timePill = document.createElement("span");
	timePill.className = "pill";
	timePill.textContent = formatBadgeDateTime(notification.createdAt);
	metaLeft.appendChild(timePill);

	const urgencyPill = document.createElement("span");
	urgencyPill.className = `pill urgency-pill urgency-${urgency}`;
	urgencyPill.textContent = formatUrgencyLabel(urgency);
	metaLeft.appendChild(urgencyPill);

	if (notification.meta?.scope) {
		const scopePill = document.createElement("span");
		scopePill.className = "pill";
		scopePill.textContent = notification.meta.scope;
		metaLeft.appendChild(scopePill);
	}

	meta.appendChild(metaLeft);

	if (snoozedUntilTs) {
		const metaRight = document.createElement("div");
		metaRight.className = "notification-meta-right";
		const snoozeText = document.createElement("span");
		snoozeText.className = "notification-snoozed-text";
		const snoozeLabel = formatBadgeDateTime(snoozedUntilTs);
		snoozeText.textContent = snoozeLabel
			? `Snoozed until ${snoozeLabel}`
			: "Snoozed until unknown time";
		metaRight.appendChild(snoozeText);
		meta.appendChild(metaRight);
	}

	infoWrapper.appendChild(meta);
	li.appendChild(infoWrapper);

	const actions = document.createElement("div");
	actions.className = "notification-actions";

	if (isUnseen) {
		const acknowledgeBtn = document.createElement("button");
		acknowledgeBtn.className = "hover-btn icon-btn";
		acknowledgeBtn.dataset.action = "ack";
		acknowledgeBtn.dataset.id = notification.id;
		acknowledgeBtn.title = "Mark as viewed";
		acknowledgeBtn.innerHTML = `<img src="../images/done.svg" alt="Viewed" class="icon" />`;
		actions.appendChild(acknowledgeBtn);
	}

	const remindBtn = document.createElement("button");
	remindBtn.className = "hover-btn icon-btn reminder-btn";
	remindBtn.dataset.action = "remind";
	remindBtn.dataset.id = notification.id;
	remindBtn.dataset.urgency = urgency;
	remindBtn.title = "Remind me later";
	remindBtn.innerHTML = `<img src="../images/clock.svg" alt="Remind later" class="icon" />`;
	actions.appendChild(remindBtn);

	// Add archive button (for non-archived notifications)
	if (notification.status !== "archived") {
		const archiveBtn = document.createElement("button");
		archiveBtn.className = "hover-btn icon-btn";
		archiveBtn.dataset.action = "archive";
		archiveBtn.dataset.id = notification.id;
		archiveBtn.title = "Archive";
		archiveBtn.innerHTML = `<img src="../images/archive.svg" alt="Archive" class="icon" />`;
		actions.appendChild(archiveBtn);
	}

	li.appendChild(actions);

	// List summary integration
	const rawPayload = notification.payload;
	const parsedPayload = typeof rawPayload === "string" ? (() => { try { return JSON.parse(rawPayload); } catch { return null; } })() : rawPayload;
	const hasListData = parsedPayload &&
		((Array.isArray(parsedPayload.list_run_ids) && parsedPayload.list_run_ids.length > 0) ||
		 (parsedPayload.open_required_list_count > 0));

	if (hasListData && notification.id) {
		const listContainer = document.createElement("div");
		listContainer.className = "notification-list-summary";
		li.appendChild(listContainer);

		const listTarget = { kind: "notification", id: notification.id };
		ipcRenderer.send("lists-fetch", { target: listTarget });

		const onListsData = (_, payload) => {
			if (!payload?.target || payload.target.kind !== "notification" || payload.target.id !== notification.id) return;
			ipcRenderer.removeListener("lists-data", onListsData);
			listContainer.innerHTML = "";
			const summary = renderListSummary({
				lists: payload.lists ?? [],
				target: listTarget,
			});
			listContainer.appendChild(summary);
		};
		ipcRenderer.on("lists-data", onListsData);
	}

	return li;
};

const clearList = (target) => {
	while (target.firstChild) {
		target.removeChild(target.firstChild);
	}
};

const updateEmptyStates = ({ unseenCount, historyCount, snoozedCount, archivedCount }) => {
	if (unseenEmptyState) {
		unseenEmptyState.classList.toggle("is-visible", unseenCount === 0);
	}

	if (historyEmptyState) {
		const shouldShow = state.showHistory && historyCount === 0;
		historyEmptyState.classList.toggle("is-visible", shouldShow);
	}

	if (snoozedEmptyState) {
		const shouldShow = state.showSnoozed && snoozedCount === 0;
		snoozedEmptyState.classList.toggle("is-visible", shouldShow);
	}

	if (archivedEmptyState) {
		const shouldShow = state.showArchived && archivedCount === 0;
		archivedEmptyState.classList.toggle("is-visible", shouldShow);
	}
};

const updateSubtitle = (unseenCount) => {
	if (!subtitleEl) return;
	if (unseenCount === 0) {
		subtitleEl.textContent = "No new notifications";
	} else if (unseenCount === 1) {
		subtitleEl.textContent = "1 new notification";
	} else {
		subtitleEl.textContent = `${unseenCount} new notifications`;
	}
};

// Tab switching
const switchTab = (tabName) => {
	state.activeTab = tabName;

	tabButtons.forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.tab === tabName);
	});

	tabContents.forEach((content) => {
		content.classList.toggle("active", content.dataset.tabContent === tabName);
	});

	// Load history on first view
	if (tabName === "history" && !state.showHistory) {
		ipcRenderer.send("notifications-history-visibility", { show: true });
	}

	// Load snoozed on first view
	if (tabName === "snoozed" && !state.showSnoozed) {
		ipcRenderer.send("notifications-snoozed-visibility", { show: true });
	}

	// Load archived on first view
	if (tabName === "archived" && !state.showArchived) {
		ipcRenderer.send("notifications-archived-visibility", { show: true });
	}

	resizeWindow();
};

// Schedule item creation
const createScheduleItem = (schedule, isInstant = false) => {
	const li = document.createElement("li");
	li.className = "schedule-item";
	li.dataset.id = schedule.id;

	// Add active/inactive class for instant schedules
	if (isInstant) {
		li.classList.add(schedule.active ? "is-active" : "is-inactive");
	}

	const info = document.createElement("div");
	info.className = "schedule-info";

	const title = document.createElement("p");
	title.className = "schedule-title";
	title.textContent = schedule.title || "Untitled schedule";

	// Add status badge for instant schedules
	if (isInstant) {
		const status = document.createElement("span");
		status.className = `schedule-status ${schedule.active ? "active" : "inactive"}`;
		status.textContent = schedule.active ? "Pending" : "Consumed";
		title.appendChild(status);
	}

	// Create recurrence rule element with date/time included
	const rrule = document.createElement("p");
	rrule.className = "schedule-rrule";
	
	let ruleText = schedule.recurrenceRule || "No recurrence rule";
	if (schedule.startTime) {
		ruleText = schedule.startTime + "\n" + ruleText;
	}
	rrule.textContent = ruleText;

	info.appendChild(title);
	info.appendChild(rrule);

	const deleteBtn = document.createElement("button");
	deleteBtn.className = "hover-btn icon-btn schedule-delete-btn";
	deleteBtn.dataset.action = "schedule-delete";
	deleteBtn.dataset.id = schedule.id;
	deleteBtn.dataset.title = schedule.title || "Untitled schedule";
	deleteBtn.title = "Delete schedule";
	deleteBtn.innerHTML = `<img src="../images/close.svg" alt="Delete" class="icon" />`;

	li.appendChild(info);
	li.appendChild(deleteBtn);

	return li;
};

// Render schedules
const renderSchedules = (schedules = []) => {
	clearList(schedulesListEl);
	
	// Separate one-time and recurring schedules
	const oneTimeSchedules = schedules.filter(schedule => !schedule.rrule || schedule.rrule === "");
	const recurringSchedules = schedules.filter(schedule => schedule.rrule && schedule.rrule !== "");
	
	// Render one-time schedules section
	if (oneTimeSchedules.length > 0) {
		const instantHeader = document.createElement("li");
		instantHeader.className = "schedule-section-header";
		instantHeader.textContent = "Instant";
		schedulesListEl.appendChild(instantHeader);
		
		oneTimeSchedules.forEach((schedule) => {
			schedulesListEl.appendChild(createScheduleItem(schedule, true));
		});
	}

	// Render recurring schedules section
	if (recurringSchedules.length > 0) {
		const recurringHeader = document.createElement("li");
		recurringHeader.className = "schedule-section-header";
		recurringHeader.textContent = "Recurring";
		schedulesListEl.appendChild(recurringHeader);

		recurringSchedules.forEach((schedule) => {
			schedulesListEl.appendChild(createScheduleItem(schedule, false));
		});
	}
	
	schedulesEmptyState.classList.toggle("is-visible", schedules.length === 0);
};

const resizeWindow = () => {
	if (!rootEl) return;
	const totalItems = rootEl.querySelectorAll(".notifications-item").length;
	const historyVisibleCount = historyListEl.childElementCount;
	const visible = state.mode === "manual"
		? true
		: totalItems > 0 || (state.showHistory && historyVisibleCount > 0);

	const contentHeight = visible
		? Math.min(Math.ceil(rootEl.scrollHeight + 4), MAX_HEIGHT)
		: 0;

	ipcRenderer.send("notifications-window-resize", {
		height: contentHeight,
		visible,
	});
};

const renderNotifications = (payload) => {
	const unseen = payload.unseen ?? [];
	const history = payload.history ?? [];
	const snoozed = payload.snoozed ?? [];
	const archived = payload.archived ?? [];
	const schedules = payload.schedules ?? [];

	closeReminderMenu();
	closeScheduleDeleteDialog();

	state.mode = payload.visibilityMode ?? "hidden";
	state.showHistory = Boolean(payload.showHistory);
	state.showSnoozed = Boolean(payload.showSnoozed);
	state.showArchived = Boolean(payload.showArchived);

	// Auto-switch tabs based on context
	if (!state.suppressAutoSwitch) {
		// Switch to schedules tab if opening after a new schedule was created
		if (payload.switchToSchedulesTab && payload.visibilityMode === "manual") {
			switchTab("schedules");
		}
		// Switch to "unseen" tab when window opens with new notifications
		else if (
			payload.visibilityMode === "auto" &&
			Array.isArray(unseen) &&
			unseen.length > 0
		) {
			switchTab("unseen");
		}
	}

	// History loading state
	if (!state.loadingMore || history.length > state.lastHistoryLength) {
		state.loadingMore = false;
	}
	state.hasMoreHistory = Boolean(payload.hasMoreHistory);
	state.lastHistoryLength = history.length;

	// Snoozed loading state
	if (!state.loadingMoreSnoozed || snoozed.length > state.lastSnoozedLength) {
		state.loadingMoreSnoozed = false;
	}
	state.hasMoreSnoozed = Boolean(payload.hasMoreSnoozed);
	state.lastSnoozedLength = snoozed.length;

	// Archived loading state
	if (!state.loadingMoreArchived || archived.length > state.lastArchivedLength) {
		state.loadingMoreArchived = false;
	}
	state.hasMoreArchived = Boolean(payload.hasMoreArchived);
	state.lastArchivedLength = archived.length;

	// Render unseen
	clearList(unseenListEl);
	appendNotifications(unseenListEl, unseen, { isUnseen: true });

	// Render history
	clearList(historyListEl);
	if (state.showHistory) {
		appendNotifications(historyListEl, history, { isUnseen: false });
	}

	// Render snoozed
	clearList(snoozedListEl);
	if (state.showSnoozed) {
		appendNotifications(snoozedListEl, snoozed, { isUnseen: false });
	}

	// Render archived
	clearList(archivedListEl);
	if (state.showArchived) {
		appendNotifications(archivedListEl, archived, { isUnseen: false });
	}

	renderSchedules(schedules);

	updateEmptyStates({
		unseenCount: unseen.length,
		historyCount: history.length,
		snoozedCount: snoozed.length,
		archivedCount: archived.length,
	});
	updateSubtitle(unseen.length);

	if (toggleHistoryBtn) {
		toggleHistoryBtn.textContent = state.showHistory ? "Hide history" : "Show history";
		toggleHistoryBtn.classList.toggle("active", state.showHistory);
	}

	historyScrollEl.classList.toggle("hidden", !state.showHistory);
	historyLoadingEl.classList.toggle("is-visible", state.loadingMore);

	// Update snoozed loading indicator
	if (snoozedScrollEl) {
		snoozedScrollEl.classList.toggle("hidden", !state.showSnoozed);
	}
	if (snoozedLoadingEl) {
		snoozedLoadingEl.classList.toggle("is-visible", state.loadingMoreSnoozed);
	}

	// Update archived loading indicator
	if (archivedScrollEl) {
		archivedScrollEl.classList.toggle("hidden", !state.showArchived);
	}
	if (archivedLoadingEl) {
		archivedLoadingEl.classList.toggle("is-visible", state.loadingMoreArchived);
	}

	state.suppressAutoSwitch = false;

	resizeWindow();
};

rootEl?.addEventListener("click", (event) => {
	const actionTarget = event.target.closest("[data-action]");
	if (!actionTarget) {
		return;
	}

	const { action, id } = actionTarget.dataset;

	switch (action) {
		case "ack": {
			if (!id) return;
			ipcRenderer.send("notifications-acknowledge", { id });
			closeReminderMenu();
			break;
		}
		case "remind": {
			event.preventDefault();
			event.stopPropagation();
			openReminderMenu(actionTarget);
			break;
		}
		case "remind-option": {
			event.preventDefault();
			event.stopPropagation();
			if (!id) return;
			const minutesParam = actionTarget.dataset.minutes;
			if (minutesParam === undefined || minutesParam === null || minutesParam === "") {
				return;
			}
			const numericValue = Number(minutesParam);
			if (Number.isNaN(numericValue) || numericValue <= 0) {
				return;
			}
			const menu = actionTarget.closest(".reminder-menu");
			const urgency = normalizeUrgency(menu?.dataset?.selectedUrgency, "normal");
			ipcRenderer.send("notifications-snooze", { id, minutes: numericValue, urgency });
			closeReminderMenu();
			break;
		}
		case "remind-urgency": {
			event.preventDefault();
			event.stopPropagation();
			const menu = actionTarget.closest(".reminder-menu");
			if (!menu) return;
			const urgency = normalizeUrgency(actionTarget.dataset.urgency, "normal");
			menu.dataset.selectedUrgency = urgency;
			menu
				.querySelectorAll('[data-action="remind-urgency"]')
				.forEach((button) => {
					button.classList.toggle(
						"active",
						normalizeUrgency(button.dataset.urgency, "normal") === urgency,
					);
				});
			break;
		}
		case "remind-custom": {
			event.preventDefault();
			event.stopPropagation();
			if (!id) return;
			openCustomReminderForm(id);
			break;
		}
		case "mark-all": {
			ipcRenderer.send("notifications-acknowledge-all");
			closeReminderMenu();
			break;
		}
		case "toggle-history": {
			const nextValue = !state.showHistory;
			ipcRenderer.send("notifications-history-visibility", { show: nextValue });
			closeReminderMenu();
			break;
		}
		case "schedule-delete": {
			if (!id) return;
			closeReminderMenu();
			openScheduleDeleteDialog({
				id,
				title: actionTarget.dataset.title ?? "this schedule",
			});
			break;
		}
		case "archive": {
			if (!id) return;
			ipcRenderer.send("notifications-archive", { id });
			closeReminderMenu();
			break;
		}
		default:
			break;
	}
});

if (historyScrollEl) {
	historyScrollEl.addEventListener("scroll", () => {
		closeReminderMenu();
		if (!state.showHistory || !state.hasMoreHistory || state.loadingMore) return;
		const { scrollTop, clientHeight, scrollHeight } = historyScrollEl;
		if (scrollHeight - (scrollTop + clientHeight) <= LOAD_MORE_THRESHOLD) {
			state.loadingMore = true;
			state.suppressAutoSwitch = true;
			historyLoadingEl.classList.add("is-visible");
			ipcRenderer.send("notifications-load-more");
		}
	});
}

if (snoozedScrollEl) {
	snoozedScrollEl.addEventListener("scroll", () => {
		closeReminderMenu();
		if (!state.showSnoozed || !state.hasMoreSnoozed || state.loadingMoreSnoozed) return;
		const { scrollTop, clientHeight, scrollHeight } = snoozedScrollEl;
		if (scrollHeight - (scrollTop + clientHeight) <= LOAD_MORE_THRESHOLD) {
			state.loadingMoreSnoozed = true;
			state.suppressAutoSwitch = true;
			if (snoozedLoadingEl) snoozedLoadingEl.classList.add("is-visible");
			ipcRenderer.send("notifications-load-more-snoozed");
		}
	});
}

if (archivedScrollEl) {
	archivedScrollEl.addEventListener("scroll", () => {
		closeReminderMenu();
		if (!state.showArchived || !state.hasMoreArchived || state.loadingMoreArchived) return;
		const { scrollTop, clientHeight, scrollHeight } = archivedScrollEl;
		if (scrollHeight - (scrollTop + clientHeight) <= LOAD_MORE_THRESHOLD) {
			state.loadingMoreArchived = true;
			state.suppressAutoSwitch = true;
			if (archivedLoadingEl) archivedLoadingEl.classList.add("is-visible");
			ipcRenderer.send("notifications-load-more-archived");
		}
	});
}

document.addEventListener("click", (event) => {
	if (!activeReminderMenu) return;
	if (event.target.closest(".reminder-menu")) return;
	if (event.target.closest("[data-action=\"remind\"]")) return;
	closeReminderMenu();
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		closeReminderMenu();
		closeScheduleDeleteDialog();
	}
});

window.addEventListener("resize", () => {
	closeReminderMenu();
	closeScheduleDeleteDialog();
});

ipcRenderer.on("notifications-data", (_, payload) => {
	renderNotifications(payload ?? {});
});

// Tab button clicks
tabButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		switchTab(btn.dataset.tab);
	});
});

window.addEventListener("DOMContentLoaded", () => {
	document.head.appendChild(createListSummaryStyles());
	ipcRenderer.send("notifications-window-ready");
});
