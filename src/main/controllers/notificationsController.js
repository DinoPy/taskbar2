import { screen, Notification } from "electron";

const MAX_STORED_NOTIFICATIONS = 200;
const HISTORY_BATCH_SIZE = 10;
const AUTO_REMINDER_TIMEOUT = 45000;

const EDGE_GAP = 4;
const VERTICAL_GAP = 6;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseTimestamp = (value) => {
	if (!value) return null;

	// Handle sql.NullTime format: { Valid: true, Time: "2024-01-15T10:30:00Z" }
	if (typeof value === "object" && value !== null) {
		if ("Valid" in value && "Time" in value) {
			if (!value.Valid) return null;
			return parseTimestamp(value.Time);
		}
		// Handle Date objects
		if (value instanceof Date) {
			const time = value.getTime();
			return Number.isNaN(time) ? null : time;
		}
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return null;
		// Handle both seconds and milliseconds:
		// - Values > 1e12 are likely milliseconds (after ~2001)
		// - Values between 1e9 and 1e12 are likely seconds (2001-2033)
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

const extractNullableString = (field) => {
	if (!field) return "";
	if (typeof field === "string") return field;
	if (field.Valid && typeof field.String === "string") return field.String;
	return "";
};

const normalizeNotification = (raw) => {
	if (!raw) return null;
	const id = raw.id ?? raw.notification_id ?? raw.uuid;
	if (!id) return null;

	const createdAt = parseTimestamp(raw.created_at ?? raw.createdAt) ?? Date.now();
	const updatedAt = parseTimestamp(raw.updated_at ?? raw.updatedAt ?? raw.last_modified_at) ?? createdAt;
	const lastModifiedAt = parseTimestamp(raw.last_modified_at) ?? updatedAt;
	const snoozedUntil = parseTimestamp(
		raw.snooze_until ?? raw.snoozed_until ?? raw.snoozedUntil
	);
	const seenAt = parseTimestamp(raw.seen_at ?? raw.seenAt);
	const archivedAt = parseTimestamp(raw.archived_at ?? raw.archivedAt);

	const status = raw.status ?? (seenAt ? "seen" : "unseen");

	const description =
		extractNullableString(raw.description) ||
		extractNullableString(raw.body) ||
		"";
	const actionUrl = extractNullableString(raw.action_url);
	const actionText = extractNullableString(raw.action_text);

	return {
		...raw,
		id,
		title: raw.title ?? description ?? "",
		description,
		body: description,
		status,
		priority: raw.priority ?? "normal",
		notificationType: raw.notification_type ?? raw.notificationType ?? null,
		createdAt,
		updatedAt,
		lastModifiedAt,
		snoozedUntil,
		seenAt,
		archivedAt,
		isUnseen: status === "unseen",
		isArchived: status === "archived" || Boolean(archivedAt),
		payload: raw.payload ?? {},
		actionUrl,
		actionText,
	};
};

export function createNotificationsController({
	windowManager,
	forwardToRenderer,
	appState,
	sendEvent,
	log = console.log,
	getSchedules,
}) {
	const state = {
		notifications: new Map(),
		showHistory: false,
		historyVisibleCount: HISTORY_BATCH_SIZE,
		historyHasMore: false,
		historyFetchInProgress: false,
		// Snoozed tab state
		showSnoozed: false,
		snoozedVisibleCount: HISTORY_BATCH_SIZE,
		snoozedHasMore: false,
		snoozedFetchInProgress: false,
		// Archived tab state
		showArchived: false,
		archivedVisibleCount: HISTORY_BATCH_SIZE,
		archivedHasMore: false,
		archivedFetchInProgress: false,
		reminderIntervalMs: 0,
		reminderTimeout: null,
		visibilityMode: "hidden", // hidden | auto | manual
		lastAutoVisibleAt: 0,
		muted: Boolean(appState?.notificationsMuted),
		unseenCount: 0,
	};

	const debug = (...args) => {
		try {
			log?.("[notifications]", ...args);
		} catch {
			console.log("[notifications]", ...args);
		}
	};

	const getSortedNotifications = () => {
		const items = Array.from(state.notifications.values());
		return items.sort((a, b) => {
			const right = b.lastModifiedAt ?? b.updatedAt ?? b.createdAt;
			const left = a.lastModifiedAt ?? a.updatedAt ?? a.createdAt;
			return (right ?? 0) - (left ?? 0);
		});
	};

	const trimNotifications = () => {
		if (state.notifications.size <= MAX_STORED_NOTIFICATIONS) return;
		const sorted = getSortedNotifications();
		const overflow = sorted.slice(MAX_STORED_NOTIFICATIONS);
		overflow.forEach((notification) => {
			state.notifications.delete(notification.id);
		});
	};

		const upsertNotifications = (list = []) => {
			list.forEach((item) => {
				const normalized = normalizeNotification(item);
				if (!normalized) return;
				const existing = state.notifications.get(normalized.id);
				const merged = existing && !normalized.snoozedUntil && existing.snoozedUntil
					? { ...normalized, snoozedUntil: existing.snoozedUntil }
					: normalized;
				state.notifications.set(normalized.id, merged);
			});
			trimNotifications();
		};

	const getSnapshot = () => {
		const sorted = getSortedNotifications();
		const now = Date.now();

		// Helper to check if notification is currently snoozed
		const isCurrentlySnoozed = (notification) => {
			if (!notification.snoozedUntil) return false;
			return now < notification.snoozedUntil;
		};

		// Filter out snoozed notifications from unseen list
		const unseen = sorted.filter((notification) =>
			notification.status === "unseen" && !isCurrentlySnoozed(notification)
		);

		// History: exclude snoozed and archived notifications
		const historySource = sorted.filter((notification) => {
			if (notification.status === "archived") {
				return false;
			}
			if (isCurrentlySnoozed(notification)) {
				return false;
			}
			if (notification.status === "unseen") {
				return false;
			}
			return true;
		});

		const history = state.showHistory
			? historySource.slice(0, state.historyVisibleCount)
			: [];
		const hasMoreHistory = state.showHistory && (state.historyHasMore || historySource.length > history.length);

		// Snoozed: notifications that are currently snoozed
		const snoozedSource = sorted.filter((notification) => isCurrentlySnoozed(notification));
		const snoozed = state.showSnoozed
			? snoozedSource.slice(0, state.snoozedVisibleCount)
			: [];
		const hasMoreSnoozed = state.showSnoozed && (state.snoozedHasMore || snoozedSource.length > snoozed.length);

		// Archived: notifications with status "archived"
		const archivedSource = sorted.filter((notification) => notification.status === "archived");
		const archived = state.showArchived
			? archivedSource.slice(0, state.archivedVisibleCount)
			: [];
		const hasMoreArchived = state.showArchived && (state.archivedHasMore || archivedSource.length > archived.length);

		const unreadCount = Number.isInteger(state.unseenCount)
			? Math.max(0, state.unseenCount)
			: unseen.length;

		const schedules = getSchedules?.() ?? [];

		return {
			unseen,
			history,
			snoozed,
			archived,
			schedules,
			showHistory: state.showHistory,
			showSnoozed: state.showSnoozed,
			showArchived: state.showArchived,
			hasMoreHistory,
			hasMoreSnoozed,
			hasMoreArchived,
			visibilityMode: state.visibilityMode,
			unreadCount,
		};
	};

	const sendSnapshotToTaskbar = () => {
		const snapshot = getSnapshot();
		forwardToRenderer("notifications-update", {
			unreadCount: snapshot.unreadCount,
		});
	};

	const sendSnapshotToNotificationsWindow = () => {
		const win = windowManager.getNotificationsWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("notifications-data", getSnapshot());
		}
	};

	const broadcastSnapshot = () => {
		sendSnapshotToTaskbar();
		sendSnapshotToNotificationsWindow();
	};

	const setUnseenCount = (count) => {
		const next = Math.max(0, Number(count) || 0);
		state.unseenCount = next;
		sendSnapshotToTaskbar();
		maybeHideWindow();
		updateReminderTimer();
	};

	const clearReminderTimer = () => {
		if (state.reminderTimeout) {
			clearTimeout(state.reminderTimeout);
			state.reminderTimeout = null;
		}
	};

	const scheduleReminderTick = () => {
		clearReminderTimer();
		if (state.reminderIntervalMs <= 0) return;
		const snapshot = getSnapshot();
		if (snapshot.unseen.length === 0) return;

		state.reminderTimeout = setTimeout(() => {
			const nextSnapshot = getSnapshot();
			if (nextSnapshot.unseen.length > 0) {
				showWindow("auto");
			}
			scheduleReminderTick();
		}, state.reminderIntervalMs);
	};

	const updateReminderTimer = () => {
		if (state.reminderIntervalMs <= 0) {
			clearReminderTimer();
			return;
		}
		const snapshot = getSnapshot();
		if (snapshot.unseen.length === 0) {
			clearReminderTimer();
			return;
		}
		scheduleReminderTick();
	};

	const setReminderInterval = (minutes) => {
		const numericValue = Number(minutes);
		const minutesValue = Number.isFinite(numericValue) && numericValue > 0
			? numericValue
			: 0;
		state.reminderIntervalMs = minutesValue * 60000;
		debug("Reminder interval set to", minutesValue, "minute(s)");
		updateReminderTimer();
	};

	const getReminderIntervalMinutes = () =>
		Math.round(state.reminderIntervalMs / 60000);

	const showNativeNotification = (notification) => {
		try {
			const nativeNotification = new Notification({
				title: notification.title ?? "Notification",
				body: notification.description ?? "",
				silent: true,
			});
			nativeNotification.show();
		} catch (error) {
			debug("Failed to show native notification", error);
		}
	};

	const setMuted = (value) => {
		state.muted = Boolean(value);
		debug("Notifications muted:", state.muted);
	};

	const toggleMuted = () => {
		state.muted = !state.muted;
		return state.muted;
	};

	const isMuted = () => state.muted;

	const ensureWindow = () => {
		let win = windowManager.getNotificationsWindow();
		if (win && !win.isDestroyed()) {
			return win;
		}
		win = windowManager.openNotificationsWindow({
			onClose: markWindowHidden,
		});
		return win;
	};

	const getTaskbarBounds = () => {
		const taskbar = windowManager.getTaskbarWindow();
		if (!taskbar || taskbar.isDestroyed()) return null;
		return taskbar.getBounds();
	};

	const computeWindowPosition = (height) => {
		const taskbarBounds = getTaskbarBounds();
		if (!taskbarBounds) return null;

		const displays = screen.getAllDisplays();
		const targetDisplay =
			displays[appState.currentlySelectedScreenIndex] ??
			screen.getDisplayMatching(taskbarBounds) ??
			screen.getPrimaryDisplay();

		const workArea = targetDisplay.workArea;
		const windowBounds = ensureWindow().getBounds();
		const width = windowBounds.width;

		let x = taskbarBounds.x + taskbarBounds.width - width - EDGE_GAP;
		x = clamp(x, workArea.x + EDGE_GAP, workArea.x + workArea.width - width - EDGE_GAP);

		const availableAbove = taskbarBounds.y - workArea.y - VERTICAL_GAP - EDGE_GAP;
		const availableBelow = (workArea.y + workArea.height)
			- (taskbarBounds.y + taskbarBounds.height)
			- VERTICAL_GAP - EDGE_GAP;

		const MIN_HEIGHT = 120;
		const preferAbove = appState.currentlySelectedScreenSide === "bottom";

		const pickOrientation = () => {
			if (preferAbove) {
				if (availableAbove >= MIN_HEIGHT || availableAbove >= availableBelow) return "above";
				return "below";
			}
			if (availableBelow >= MIN_HEIGHT || availableBelow >= availableAbove) return "below";
			return "above";
		};

		let orientation = pickOrientation();

		const spaceFor = (side) => (side === "above" ? availableAbove : availableBelow);

		let availableSpace = spaceFor(orientation);
		if (availableSpace <= 0) {
			const alternate = orientation === "above" ? "below" : "above";
			const alternateSpace = spaceFor(alternate);
			if (alternateSpace > availableSpace) {
				orientation = alternate;
				availableSpace = alternateSpace;
			}
		}

		availableSpace = Math.max(availableSpace, 0);

		let constrainedHeight = Math.min(height, workArea.height - 2 * EDGE_GAP);
		if (availableSpace > 0) {
			constrainedHeight = Math.min(constrainedHeight, availableSpace);
		}

		const minPossible = Math.min(height, Math.min(MIN_HEIGHT, workArea.height - 2 * EDGE_GAP));
		if (constrainedHeight < minPossible && availableSpace >= minPossible) {
			constrainedHeight = minPossible;
		}

		if (constrainedHeight <= 0 || Number.isNaN(constrainedHeight)) {
			constrainedHeight = Math.min(height, workArea.height - 2 * EDGE_GAP);
		}

		let y;
		if (orientation === "above") {
			y = taskbarBounds.y - constrainedHeight - VERTICAL_GAP;
			y = Math.max(y, workArea.y + EDGE_GAP);
		} else {
			y = taskbarBounds.y + taskbarBounds.height + VERTICAL_GAP;
			y = Math.min(y, workArea.y + workArea.height - constrainedHeight - EDGE_GAP);
		}

		return { x, y, width, height: constrainedHeight };
	};

	const setWindowHeight = ({ height, visible }) => {
		const win = windowManager.getNotificationsWindow();
		if (!win || win.isDestroyed()) return;

		if ((!visible || height <= 0) && state.visibilityMode !== "manual") {
			hideWindow();
			return;
		}

		const bounds = computeWindowPosition(height);
		if (bounds) {
			win.setBounds(bounds);
		}

		if (!win.isVisible()) {
			win.showInactive?.();
		}
	};

	const showWindow = (mode = "auto") => {
		const win = ensureWindow();
		if (!win) return;
		state.visibilityMode = mode;
		if (mode === "auto") {
			state.lastAutoVisibleAt = Date.now();
		}
		win.showInactive?.();
		sendSnapshotToNotificationsWindow();
	};

	const hideWindow = () => {
		const win = windowManager.getNotificationsWindow();
		if (!win || win.isDestroyed()) return;
		state.visibilityMode = "hidden";
		win.hide();
	};

	const maybeHideWindow = () => {
		const snapshot = getSnapshot();
		const hasVisibleItems =
			snapshot.unseen.length > 0 ||
			(state.showHistory && snapshot.history.length > 0);
		if (!hasVisibleItems && state.visibilityMode === "auto") {
			hideWindow();
		}
	};

	const markWindowHidden = () => {
		state.visibilityMode = "hidden";
	};

	const repositionWindow = () => {
		const win = windowManager.getNotificationsWindow();
		if (!win || win.isDestroyed() || !win.isVisible()) return;
		const height = win.getBounds().height;
		setWindowHeight({ height, visible: true });
	};

	const toggleWindow = () => {
		if (state.visibilityMode === "hidden") {
			showWindow("manual");
			return;
		}
		hideWindow();
	};

	const acknowledgeNotification = (id) => {
		const current = state.notifications.get(id);
		if (!current) return;

		if (current.status === "unseen") {
			state.unseenCount = Math.max(0, state.unseenCount - 1);
		}

		const updated = {
			...current,
			status: "seen",
			isUnseen: false,
			seenAt: Date.now(),
		};
		state.notifications.set(id, updated);
		broadcastSnapshot();
		maybeHideWindow();
		sendEvent?.("notification_mark_seen", { notification_ids: [id] });
		updateReminderTimer();
	};

	const acknowledgeAll = () => {
		let changed = false;
		state.notifications.forEach((notification, id) => {
			if (notification.status === "unseen") {
				state.notifications.set(id, {
					...notification,
					status: "seen",
					isUnseen: false,
					seenAt: Date.now(),
				});
				changed = true;
			}
		});
		if (!changed) {
			return;
		}
		state.unseenCount = 0;
		broadcastSnapshot();
		maybeHideWindow();
		sendEvent?.("notification_mark_all_seen", {});
		updateReminderTimer();
	};

	const applySnoozeLocally = ({ id, minutes, until }) => {
		const existing = state.notifications.get(id);
		if (!existing) return;

		let snoozedUntil = null;
		if (until) {
			snoozedUntil = parseTimestamp(until);
		} else if (Number.isFinite(minutes)) {
			snoozedUntil = Date.now() + Math.max(0, minutes) * 60000;
		}

		const updated = {
			...existing,
			status: "seen",
			isUnseen: false,
			snoozedUntil,
			seenAt: existing.seenAt ?? Date.now(),
		};
		state.notifications.set(id, updated);
		if (existing.status === "unseen") {
			state.unseenCount = Math.max(0, state.unseenCount - 1);
		}
	};

	const snoozeNotification = ({ id, minutes, until }) => {
		if (!id) return;

		applySnoozeLocally({ id, minutes, until });
		broadcastSnapshot();
		maybeHideWindow();
		updateReminderTimer();

		const payload = { notification_id: id };
		if (until) {
			const untilDate = new Date(until);
			if (!Number.isNaN(untilDate.getTime())) {
				payload.snooze_until = Math.round(untilDate.getTime() / 1000);
			}
		} else if (Number.isFinite(minutes)) {
			payload.snooze_minutes = Math.max(0, Math.round(minutes));
		}

		sendEvent?.("notification_snooze", payload);
	};

	const archiveNotification = (id) => {
		if (!id) return;

		const existing = state.notifications.get(id);
		if (!existing) return;

		// Update locally
		const updated = {
			...existing,
			status: "archived",
			isArchived: true,
			archivedAt: Date.now(),
		};
		state.notifications.set(id, updated);

		if (existing.status === "unseen") {
			state.unseenCount = Math.max(0, state.unseenCount - 1);
		}

		broadcastSnapshot();
		maybeHideWindow();
		updateReminderTimer();

		// Send to server
		sendEvent?.("notification_archive", { notification_id: id });
	};

	const requestSeenHistory = () => {
		if (state.historyFetchInProgress) return;
		state.historyFetchInProgress = true;
		const now = Date.now();
		const seenCount = getSortedNotifications().filter((notification) => {
			if (notification.status === "unseen" || notification.status === "archived") return false;
			// Exclude currently snoozed from history count
			if (notification.snoozedUntil && now < notification.snoozedUntil) return false;
			return true;
		}).length;

		sendEvent?.("notifications_fetch", {
			offset: seenCount,
			limit: HISTORY_BATCH_SIZE,
			statuses: ["seen"],
			include_snoozed: false,
		});
	};

	const setHistoryVisibility = (show) => {
		if (state.showHistory === show) return;
		state.showHistory = show;
		broadcastSnapshot();
		if (show) {
			requestSeenHistory();
		}
	};

	const loadMoreHistory = () => {
		state.historyVisibleCount += HISTORY_BATCH_SIZE;
		broadcastSnapshot();
		requestSeenHistory();
	};

	const requestSnoozedHistory = () => {
		if (state.snoozedFetchInProgress) return;
		state.snoozedFetchInProgress = true;
		const snoozedCount = getSortedNotifications().filter((notification) => {
			if (!notification.snoozedUntil) return false;
			return Date.now() < notification.snoozedUntil;
		}).length;

		sendEvent?.("notifications_fetch", {
			offset: snoozedCount,
			limit: HISTORY_BATCH_SIZE,
			only_snoozed: true,
		});
	};

	const requestArchivedHistory = () => {
		if (state.archivedFetchInProgress) return;
		state.archivedFetchInProgress = true;
		const archivedCount = getSortedNotifications().filter((notification) =>
			notification.status === "archived"
		).length;

		sendEvent?.("notifications_fetch", {
			offset: archivedCount,
			limit: HISTORY_BATCH_SIZE,
			statuses: ["archived"],
		});
	};

	const setSnoozedVisibility = (show) => {
		if (state.showSnoozed === show) return;
		state.showSnoozed = show;
		broadcastSnapshot();
		if (show) {
			requestSnoozedHistory();
		}
	};

	const setArchivedVisibility = (show) => {
		if (state.showArchived === show) return;
		state.showArchived = show;
		broadcastSnapshot();
		if (show) {
			requestArchivedHistory();
		}
	};

	const loadMoreSnoozed = () => {
		state.snoozedVisibleCount += HISTORY_BATCH_SIZE;
		broadcastSnapshot();
		requestSnoozedHistory();
	};

	const loadMoreArchived = () => {
		state.archivedVisibleCount += HISTORY_BATCH_SIZE;
		broadcastSnapshot();
		requestArchivedHistory();
	};

	const bootstrap = ({ notifications = [], unseenCount }) => {
		state.notifications.clear();
		upsertNotifications(notifications);
		if (typeof unseenCount === "number") {
			setUnseenCount(unseenCount);
		} else {
			state.unseenCount = getSnapshot().unseen.length;
		}
		state.historyHasMore = notifications.length >= HISTORY_BATCH_SIZE;
		state.historyFetchInProgress = false;
		broadcastSnapshot();
		updateReminderTimer();
	};

	const handleNotificationsBatch = ({ notifications = [], has_more = false, fetch_type }) => {
		upsertNotifications(notifications);
		// Determine which fetch type completed based on fetch_type or which fetch was in progress
		if (fetch_type === "snoozed" || state.snoozedFetchInProgress) {
			state.snoozedHasMore = Boolean(has_more);
			state.snoozedFetchInProgress = false;
		} else if (fetch_type === "archived" || state.archivedFetchInProgress) {
			state.archivedHasMore = Boolean(has_more);
			state.archivedFetchInProgress = false;
		} else {
			state.historyHasMore = Boolean(has_more);
			state.historyFetchInProgress = false;
		}
		broadcastSnapshot();
		updateReminderTimer();
	};

	const handleNotificationsMarkedSeen = (notifications = []) => {
		let unseenDelta = 0;
		notifications.forEach((item) => {
			const normalized = normalizeNotification(item);
			if (!normalized) return;
			const previous = state.notifications.get(normalized.id);
			if (previous?.status === "unseen" && normalized.status !== "unseen") {
				unseenDelta -= 1;
			}
			state.notifications.set(normalized.id, normalized);
		});
		if (unseenDelta !== 0) {
			state.unseenCount = Math.max(0, state.unseenCount + unseenDelta);
		}
		broadcastSnapshot();
		maybeHideWindow();
		updateReminderTimer();
	};

	const handleNotificationArchived = (notification) => {
		const normalized = normalizeNotification(notification);
		if (!normalized) return;
		const previous = state.notifications.get(normalized.id);
		// Keep notification in state with archived status instead of deleting
		normalized.status = "archived";
		normalized.isArchived = true;
		state.notifications.set(normalized.id, normalized);
		if (previous?.status === "unseen") {
			state.unseenCount = Math.max(0, state.unseenCount - 1);
		}
		broadcastSnapshot();
		maybeHideWindow();
		updateReminderTimer();
	};

	const handleNotificationSnoozed = (notification) => {
		const normalized = normalizeNotification(notification);
		if (!normalized) return;
		const previous = state.notifications.get(normalized.id);
		state.notifications.set(normalized.id, normalized);
		if (previous?.status === "unseen" && normalized.status !== "unseen") {
			state.unseenCount = Math.max(0, state.unseenCount - 1);
		}
		broadcastSnapshot();
		maybeHideWindow();
		updateReminderTimer();
	};

	const handleNotificationsReemitted = (notifications = []) => {
		let increment = 0;
		notifications.forEach((item) => {
			const normalized = normalizeNotification(item);
			if (!normalized) return;
			normalized.status = "unseen";
			normalized.isUnseen = true;
			normalized.snoozedUntil = null;
			const previous = state.notifications.get(normalized.id);
			if (previous?.status !== "unseen") {
				increment += 1;
			}
			state.notifications.set(normalized.id, normalized);
		});
		if (increment) {
			state.unseenCount += increment;
		}
		broadcastSnapshot();
		if (state.visibilityMode === "hidden") {
			showWindow("auto");
		}
		updateReminderTimer();
		if (!state.muted && notifications.length > 0) {
			notifications.forEach((notification) => {
				const normalized = normalizeNotification(notification);
				if (normalized) {
					showNativeNotification(normalized);
					forwardToRenderer("notification-received", { notification: normalized });
				}
			});
		}
	};

	const handleUnseenCountUpdate = (count) => {
		setUnseenCount(count);
	};

	return {
		// Public API used by the main process and socket handlers
		bootstrap,
		handleNotificationsBatch,
		handleNotificationsMarkedSeen,
		handleNotificationArchived,
		handleNotificationSnoozed,
		handleNotificationsReemitted,
		handleUnseenCountUpdate,
		sendSnapshotToNotificationsWindow,
		getSnapshot,
		broadcastSnapshot,

		// Window + reminder controls
		setReminderInterval,
		getReminderIntervalMinutes,
		setMuted,
		toggleMuted,
		isMuted,

		// User actions triggered via IPC
		acknowledgeNotification,
		acknowledgeAll,
		snoozeNotification,
		archiveNotification,
		setHistoryVisibility,
		loadMoreHistory,
		setSnoozedVisibility,
		loadMoreSnoozed,
		setArchivedVisibility,
		loadMoreArchived,
		toggleWindow,
		showWindow,
		setWindowHeight,
		repositionWindow,
		markWindowHidden,
	};
}
