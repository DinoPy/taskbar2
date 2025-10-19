const { ipcRenderer } = window.require("electron");

const MAX_HEIGHT = 420;
const LOAD_MORE_THRESHOLD = 12;

const rootEl = document.querySelector(".notifications-root");
const subtitleEl = document.querySelector(".notifications-subtitle");
const unseenListEl = document.getElementById("unseenList");
const historyListEl = document.getElementById("historyList");
const historyScrollEl = document.querySelector(".history-scroll");
const historyLoadingEl = document.getElementById("historyLoading");
const toggleHistoryBtn = document.querySelector('[data-action="toggle-history"]');
const unseenEmptyState = document.querySelector('[data-empty="unseen"]');
const historyEmptyState = document.querySelector('[data-empty="history"]');

const state = {
	showHistory: false,
	hasMoreHistory: false,
	loadingMore: false,
	lastHistoryLength: 0,
	mode: "hidden",
};

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
	const selected = new Date(input);
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
		ipcRenderer.send("notifications-snooze", { id, minutes, until: input.value });
		closeReminderMenu();
	});
};

const formatTime = (timestamp) => {
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const createNotificationItem = (notification, { isUnseen }) => {
	const li = document.createElement("li");
	li.className = `notifications-item ${isUnseen ? "unseen" : ""}`;
	li.dataset.id = notification.id;
	if (notification.snoozedUntil) {
		li.classList.add("snoozed");
	}

	const infoWrapper = document.createElement("div");

	const title = document.createElement("p");
	title.className = "notification-title";
	title.textContent = notification.title;
	infoWrapper.appendChild(title);

	if (notification.body) {
		const body = document.createElement("p");
		body.className = "notification-body";
		body.textContent = notification.body;
		infoWrapper.appendChild(body);
	}

	const meta = document.createElement("div");
	meta.className = "notification-meta";

	const timePill = document.createElement("span");
	timePill.className = "pill";
	timePill.textContent = formatTime(notification.createdAt);

	meta.appendChild(timePill);

	if (notification.meta?.scope) {
		const scopePill = document.createElement("span");
		scopePill.className = "pill";
		scopePill.textContent = notification.meta.scope;
		meta.appendChild(scopePill);
	}

	if (notification.snoozedUntil) {
		const snoozePill = document.createElement("span");
		snoozePill.className = "pill snoozed";
		snoozePill.textContent = `Snoozed until ${formatTime(notification.snoozedUntil)}`;
		meta.appendChild(snoozePill);
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
	remindBtn.title = "Remind me later";
	remindBtn.innerHTML = `<img src="../images/clock.svg" alt="Remind later" class="icon" />`;
	actions.appendChild(remindBtn);

	li.appendChild(actions);

	return li;
};

const clearList = (target) => {
	while (target.firstChild) {
		target.removeChild(target.firstChild);
	}
};

const updateEmptyStates = ({ unseenCount, historyCount }) => {
	if (unseenEmptyState) {
		unseenEmptyState.classList.toggle("is-visible", unseenCount === 0);
	}

	if (historyEmptyState) {
		const shouldShow = state.showHistory && historyCount === 0;
		historyEmptyState.classList.toggle("is-visible", shouldShow);
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

	closeReminderMenu();

	state.mode = payload.visibilityMode ?? "hidden";
	state.showHistory = Boolean(payload.showHistory);

	if (!state.loadingMore || history.length > state.lastHistoryLength) {
		state.loadingMore = false;
	}

	state.hasMoreHistory = Boolean(payload.hasMoreHistory);
	state.lastHistoryLength = history.length;

	clearList(unseenListEl);
	unseen.forEach((notification) => {
		unseenListEl.appendChild(
			createNotificationItem(notification, { isUnseen: true }),
		);
	});

	clearList(historyListEl);
	if (state.showHistory) {
		history.forEach((notification) => {
			historyListEl.appendChild(
				createNotificationItem(notification, { isUnseen: false }),
			);
		});
	}

	updateEmptyStates({
		unseenCount: unseen.length,
		historyCount: history.length,
	});
	updateSubtitle(unseen.length);

	if (toggleHistoryBtn) {
		toggleHistoryBtn.textContent = state.showHistory ? "Hide history" : "Show history";
		toggleHistoryBtn.classList.toggle("active", state.showHistory);
	}

	historyScrollEl.classList.toggle("hidden", !state.showHistory);
	historyLoadingEl.classList.toggle("is-visible", state.loadingMore);

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
			ipcRenderer.send("notifications-snooze", { id, minutes: numericValue });
			closeReminderMenu();
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
			historyLoadingEl.classList.add("is-visible");
			ipcRenderer.send("notifications-load-more");
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
	}
});

window.addEventListener("resize", () => {
	closeReminderMenu();
});

ipcRenderer.on("notifications-data", (_, payload) => {
	renderNotifications(payload ?? {});
});

window.addEventListener("DOMContentLoaded", () => {
	ipcRenderer.send("notifications-window-ready");
});
