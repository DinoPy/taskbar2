import "dotenv/config";
import fs from "fs";
import path from "path";

import { config } from "./src/main/config.js";
import { createWindowManager } from "./src/main/controllers/windowManager.js";
import { createCommandsController } from "./src/main/controllers/commandsController.js";
import { createTasksController } from "./src/main/controllers/tasksController.js";
import { registerIpcHandlers } from "./src/main/ipc/registerHandlers.js";
import { createTaskbarWindow } from "./src/main/windows/taskbarWindow.js";
import { createKenbanWindow as createKenbanBrowserWindow } from "./src/main/windows/kenbanWindow.js";
import { createEditWindow as createEditBrowserWindow } from "./src/main/windows/editWindow.js";
import { createCompletedTasksWindow as createCompletedTasksBrowserWindow } from "./src/main/windows/completedTasksWindow.js";
import { createHelpWindow as createHelpBrowserWindow } from "./src/main/windows/helpWindow.js";
import { createCustomCommandsWindow as createCustomCommandsBrowserWindow } from "./src/main/windows/customCommandsWindow.js";
import { createTaskSplitWindow as createTaskSplitBrowserWindow } from "./src/main/windows/taskSplitWindow.js";
import { createKeyWindow as createKeyBrowserWindow } from "./src/main/windows/keyWindow.js";
import { createNotificationsWindow as createNotificationsBrowserWindow } from "./src/main/windows/notificationsWindow.js";
import { createReminderWindow as createReminderBrowserWindow } from "./src/main/windows/reminderWindow.js";
import { createDeleteConfirmWindow as createDeleteConfirmBrowserWindow } from "./src/main/windows/deleteConfirmWindow.js";
import { createCalendarWindow as createCalendarBrowserWindow } from "./src/main/windows/calendarWindow.js";
import { createFinanceWindow as createFinanceBrowserWindow } from "./src/main/windows/financeWindow.js";
import { createCompletionConfirmWindow as createCompletionConfirmBrowserWindow } from "./src/main/windows/completionConfirmWindow.js";
import { createAddDueWindow as createAddDueBrowserWindow } from "./src/main/windows/addDueWindow.js";
import { createListWindow as createListBrowserWindow } from "./src/main/windows/listWindow.js";
import { createTemplateWindow as createTemplateBrowserWindow } from "./src/main/windows/templateWindow.js";
import { createVariablePromptWindow as createVariablePromptBrowserWindow } from "./src/main/windows/variablePromptWindow.js";
import {
	showMainContextMenu,
	showTaskContextMenu,
	showLoginContextMenu,
} from "./src/main/menus/index.js";
import { createSocketHandlers } from "./src/main/socket/handlers.js";
import { createNotificationsController } from "./src/main/controllers/notificationsController.js";
import { createSchedulesController } from "./src/main/controllers/schedulesController.js";
import { createCalendarController } from "./src/main/controllers/calendarController.js";
import { createListsController } from "./src/main/controllers/listsController.js";
import { createFinanceController } from "./src/main/controllers/financeController.js";

const logDir = path.dirname(config.logFilePath);
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
}
const logFile = fs.createWriteStream(config.logFilePath, { flags: "a" });
const logStdout = process.stdout;

// console.log = function(...args) {
// logFile.write(new Date().toISOString() + ' ' + args.join(' ') + '\n');
// logStdout.write(new Date().toISOString() + ' ' + args.join(' ') + '\n');
// };

console.error = console.log; // Redirect errors as well

import {
	app,
	BrowserWindow,
	ipcMain,
	screen,
	globalShortcut,
	powerMonitor,
} from "electron";

// Increase max listeners for WebContents to prevent memory leak warnings
app.on("browser-window-created", (_, window) => {
	window.webContents.setMaxListeners(20);
});
import { createSocketClient } from "./ws.js";
import { oauth2Client, login, authUrl, getAuthTokens, userInfo } from "./googleapis.js";


const ipc = ipcMain;

const appState = {
	isTimerRunning: true,
	categories: [],
	selectedCategories: [], // New: tracks which categories are selected for filtering
	showAllTasks: false,
	taskbarHeight: 60,
	currentlySelectedScreenIndex: 0,
	currentlySelectedScreenSide: "top",
	openTaskProps: null,
	fromCompleted: false,
	fromCompletedData: {
		start_date: null,
		end_date: null,
		tags: [],
		category: null,
		search_query: null,
	},
	notificationReminderIntervalMinutes: 0,
	notificationsMuted: false,
	confirmCompletionBeforeComplete: true,
	tags: [],
};

app.setName("Task yourself");
app.setAppUserModelId(app.name);

const RESERVED_COMMAND_KEYS = ["Space", "n", "j", "e", "k", "c", "s", "y", "z", "f"];

let socketClient;
let socketConnect;
let sendEvent;

const windowManager = createWindowManager({
	createTaskbarWindow,
	createEditWindow: createEditBrowserWindow,
	createCompletedTasksWindow: createCompletedTasksBrowserWindow,
	createHelpWindow: createHelpBrowserWindow,
	createCustomCommandsWindow: createCustomCommandsBrowserWindow,
	createTaskSplitWindow: createTaskSplitBrowserWindow,
	createKenbanWindow: createKenbanBrowserWindow,
	createKeyWindow: createKeyBrowserWindow,
	createNotificationsWindow: createNotificationsBrowserWindow,
	createReminderWindow: createReminderBrowserWindow,
	createDeleteConfirmWindow: createDeleteConfirmBrowserWindow,
	createCompletionConfirmWindow: createCompletionConfirmBrowserWindow,
	createCalendarWindow: createCalendarBrowserWindow,
	createAddDueWindow: createAddDueBrowserWindow,
	createListWindow: createListBrowserWindow,
	createTemplateWindow: createTemplateBrowserWindow,
	createVariablePromptWindow: createVariablePromptBrowserWindow,
	createFinanceWindow: createFinanceBrowserWindow,
});

const commandsController = createCommandsController({
	globalShortcut,
	windowManager,
	reservedKeys: RESERVED_COMMAND_KEYS,
});

let tasksController;

let win = null;
let repositionTaskbar = () => {};
let pendingDeleteTasks = [];
let pendingCompletionTask = null;

const getTaskWindow = () => windowManager.getEditWindow();

const syncCustomCommandsWindow = () => {
	const customWindow = windowManager.getCustomCommandsWindow();
	if (customWindow) {
		customWindow.webContents.send("data-from-parent", {
			commands: commandsController.getCommandsSnapshot(),
			reserved_keys: RESERVED_COMMAND_KEYS,
		});
	}
};

const forwardToRenderer = (channel, payload) => {
	const taskbarWindow = windowManager.getTaskbarWindow();
	if (taskbarWindow && !taskbarWindow.isDestroyed()) {
		taskbarWindow.webContents.send(channel, payload);
	}
};

const requestTaskDeletion = (tasks = []) => {
	const normalized = (tasks ?? [])
		.map((task) => ({
			id: task?.id ?? task?.uuid ?? null,
			title: task?.title ?? "",
		}))
		.filter((task) => task.id);

	if (normalized.length === 0) {
		return;
	}

	pendingDeleteTasks = normalized;

	windowManager.openDeleteConfirmWindow({
		tasks: pendingDeleteTasks,
		onClose: () => {
			pendingDeleteTasks = [];
		},
	});
};

const requestTaskCompletionConfirmation = (task) => {
	if (!task) return;
	const existingWindow = windowManager.getCompletionConfirmWindow?.();
	if (existingWindow && !existingWindow.isDestroyed()) {
		pendingCompletionTask = task;
		existingWindow.focus();
		return;
	}
	pendingCompletionTask = task;
	windowManager.openCompletionConfirmWindow({
		task,
		allTags: appState.tags,
		listsController,
		onClose: () => {
			pendingCompletionTask = null;
		},
	});
};

const schedulesController = createSchedulesController({
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
	log: (...args) => console.log(...args),
});

const notificationsController = createNotificationsController({
	windowManager,
	forwardToRenderer,
	appState,
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
	log: (...args) => console.log(...args),
	getSchedules: () => schedulesController?.getAllSchedules?.() ?? [],
});

notificationsController.setMuted(appState.notificationsMuted);
notificationsController.setReminderInterval(appState.notificationReminderIntervalMinutes);

const calendarController = createCalendarController({
	windowManager,
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
	schedulesController,
});

const listsController = createListsController({
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
	log: (...args) => console.log(...args),
	onTaskListStatus: (status) => {
		if (win && !win.isDestroyed()) {
			win.webContents.send("task-list-status", status);
		}
	},
	onTemplateSurfaceUpdated: (target) => {
		const tplWin = windowManager.getTemplateWindow?.();
		if (tplWin && !tplWin.isDestroyed()) {
			tplWin.webContents.send("lists-surface-updated", { target });
		}
	},
});

const financeController = createFinanceController({
	windowManager,
	sendEvent: (eventName, data) => sendEvent?.(eventName, data),
});

const scheduleCompletedTasksRefresh = () => {
	setTimeout(() => {
		sendEvent("get_completed_tasks", appState.fromCompletedData);
	}, 250);
};

const openEditWindowForTask = (data) => {
	createEditWindow({ ...data, categories: appState.categories, allTags: appState.tags });
	windowManager.getEditWindow()?.focus();
};

const handleTaskComplete = async (data) => {
	try {
		console.log(`Task ${data.id} is completed`);
		sendEvent("task_completed", {
			id: data.id,
			duration: data.duration,
			completed_at: data.completed_at,
			last_modified_at: +new Date(),
			tags: data.tags || [],
		});
	} catch (error) {
		forwardToRenderer("post-task-error", JSON.stringify(error));
	}
};

const handleTaskCreate = (data) => {
	console.log(`Task ${data.id} is being created`);
	sendEvent("task_create", data);
};

const handleTaskToggle = (data) => {
	console.log(`Task ${data.uuid} is toggled ${data.is_active}`);
	sendEvent("task_toggle", data);
};

const handleSwitchScreen = (data) => {
	const displays = screen.getAllDisplays();

	if (data.screenIndex >= 0 && data.screenIndex < displays.length) {
		appState.currentlySelectedScreenIndex = data.screenIndex;
		appState.currentlySelectedScreenSide = data.direction;

		const display = displays[data.screenIndex];
		const y = data.direction === "down"
			? display.bounds.y + display.bounds.height - appState.taskbarHeight
			: display.bounds.y;

		win?.setBounds({
			x: display.bounds.x,
			y,
			height: appState.taskbarHeight,
			width: display.bounds.width,
		});

		const reminderWin = windowManager.getReminderWindow();
		if (reminderWin && !reminderWin.isDestroyed()) {
			const frame = display.workArea ?? display.bounds;
			const [reminderWidth, reminderHeight] = reminderWin.getSize();
			const nextX = Math.round(frame.x + (frame.width - reminderWidth) / 2);
			const nextY = Math.round(frame.y + (frame.height - reminderHeight) / 2);
			reminderWin.setPosition(nextX, nextY);
		}
	}

	notificationsController.repositionWindow();
};

const toggleAlwaysOnTop = () => {
	const isAlwaysOnTop = win.isAlwaysOnTop();
	win.setAlwaysOnTop(!isAlwaysOnTop);
	console.log(`Always on top: ${!isAlwaysOnTop}`);
};

const showMainMenu = () =>
	showMainContextMenu({
		win,
		appState,
		createCompletedTasksPopUp,
		createCustomCommandsWindow,
		createHelpWindow,
		createCalendarWindow: openCalendarWindowOnFocusedScreen,
		openTemplateWindow,
		openFinanceWindow,
		openListsWindow: () => windowManager.openListWindow({ target: { kind: "standalone_home" } }),
		toggleAlwaysOnTop,
		notificationReminderIntervalMinutes: appState.notificationReminderIntervalMinutes,
		setNotificationReminderInterval: (minutes) => {
			appState.notificationReminderIntervalMinutes = minutes;
			notificationsController.setReminderInterval(minutes);
		},
		notificationsMuted: appState.notificationsMuted,
		setNotificationsMuted: (value) => {
			appState.notificationsMuted = Boolean(value);
			notificationsController.setMuted(appState.notificationsMuted);
		},
	});

const showTaskMenu = (task) =>
	showTaskContextMenu({
		win,
		appState,
		task,
		tasksController,
		openEditWindowForTask,
		getTaskWindow,
		createTaskSplitWindow,
		requestTaskDeletion,
		requestTaskCompletionConfirmation,
		windowManager,
	});

const showLoginMenu = () =>
	showLoginContextMenu({
		win,
		userInfo,
		socketClient,
		fs,
		config,
		doAuthentication,
	});

const {
	handleSocketConnect,
	handleSocketDisconnect,
	eventHandlers: socketEventHandlers,
} = createSocketHandlers({
	appState,
	windowManager,
	commandsController,
	syncCustomCommandsWindow,
	forwardToRenderer,
	getTaskbarWindow: () => windowManager.getTaskbarWindow(),
	notificationsController,
	schedulesController,
	calendarController,
	listsController,
	financeController,
});

socketClient = createSocketClient({
	onConnected: handleSocketConnect,
	onDisconnected: handleSocketDisconnect,
	eventHandlers: socketEventHandlers,
	logger: console,
});

socketConnect = (userInfo) => socketClient.connect(userInfo);
sendEvent = (eventName, data) => socketClient.send(eventName, data);

tasksController = createTasksController({
	appState,
	windowManager,
	sendEvent,
	getTaskbarWindow: () => windowManager.getTaskbarWindow(),
});

registerIpcHandlers({
	ipc,
	appState,
	windowManager,
	commandsController,
	tasksController,
	sendEvent,
	createEditWindow,
	createTaskSplitWindow,
	syncCustomCommandsWindow,
	forwardToRenderer,
	scheduleCompletedTasksRefresh,
	openEditWindowForTask,
	handleTaskComplete,
	handleTaskCreate,
	handleTaskToggle,
	handleSwitchScreen,
	toggleAlwaysOnTop,
	notificationsController,
	schedulesController,
	calendarController,
	listsController,
	log: (...args) => console.log(...args),
	requestTaskDeletion,
	requestTaskCompletionConfirmation,
	openCalendarWindow: openCalendarWindowOnFocusedScreen,
	financeController,
});

ipc.on("completion-confirmation-confirmed", (_, payload) => {
	if (pendingCompletionTask) {
		if (appState.openTaskProps?.id === pendingCompletionTask.id) {
			windowManager.closeEditWindow();
			appState.openTaskProps = null;
		}
		// Merge updated tags into task before completing
		const taskWithTags = {
			...pendingCompletionTask,
			tags: payload?.tags || pendingCompletionTask.tags || [],
		};
		tasksController.completeTask(taskWithTags);
		pendingCompletionTask = null;
	}
	windowManager.closeCompletionConfirmWindow();
});

ipc.on("completion-confirmation-cancelled", () => {
	pendingCompletionTask = null;
	windowManager.closeCompletionConfirmWindow();
});

const getIsTimerRunning = () => appState.isTimerRunning;

const handleCloseAppRequest = () => {
	windowManager.closeEditWindow();
	windowManager.closeCompletedTasksWindow();
	windowManager.closeTaskSplitWindow();
	windowManager.closeNotificationsWindow();
	windowManager.closeReminderWindow();
	windowManager.closeAddDueWindow();
	windowManager.closeAllListWindows?.();
	windowManager.closeTemplateWindow();
	windowManager.closeVariablePromptWindow();
	windowManager.closeFinanceWindow();
	windowManager.getTaskbarWindow()?.close();
};

const createTaskbarWindowInstance = () => {
	win = windowManager.createTaskbarWindow({
		ipcMain,
		taskbarHeight: appState.taskbarHeight,
		currentlySelectedScreenIndex: appState.currentlySelectedScreenIndex,
		getIsTimerRunning,
		onCloseApp: handleCloseAppRequest,
		onShowTaskContextMenu: showTaskMenu,
		onShowGeneralContextMenu: showMainMenu,
		onShowLoginContextMenu: showLoginMenu,
	});
	notificationsController.broadcastSnapshot();
	return win;
};

app.whenReady().then(async () => {
	createTaskbarWindowInstance();

	// setting up global shortcuts.
	// globalShortcut.register("CommandOrControl+R", (e) => {
	// 	console.log(e);
	// });
	// globalShortcut.register("CommandOrControl+Shift+R", () => {});
	globalShortcut.register("CommandOrControl+Shift+Space", () => {
		win?.show();
		win?.webContents.send("addTask");
	});
	globalShortcut.register("CommandOrControl+Shift+n", () => {
		win?.webContents.send("addEmergencyTask");
	});
	globalShortcut.register("CommandOrControl+Shift+j", () => {
		// Open dev tools for all windows
		win?.webContents.openDevTools();
		getTaskWindow()?.webContents.openDevTools();
		windowManager.getCompletedTasksWindow()?.webContents.openDevTools();
		windowManager.getKenbanWindow()?.webContents.openDevTools();
		windowManager.getHelpWindow()?.webContents.openDevTools();
		windowManager.getCustomCommandsWindow()?.webContents.openDevTools();
		windowManager.getTaskSplitWindow()?.webContents.openDevTools();
		windowManager.getNotificationsWindow()?.webContents.openDevTools();
		windowManager.getReminderWindow()?.webContents.openDevTools();

		// Open dev tools for all command windows
		windowManager.getAllCommandWindows().forEach((commandWin) => {
			commandWin.webContents.openDevTools();
		});
		// Open dev tools for all list windows
		windowManager.getAllListWindows?.()?.forEach((listWin) => {
			listWin.webContents.openDevTools();
		});
		windowManager.getTemplateWindow()?.webContents.openDevTools();
		windowManager.getFinanceWindow()?.webContents.openDevTools();
		const calendarWindow = openCalendarWindowOnFocusedScreen();
		calendarWindow?.webContents.openDevTools();
	});
	globalShortcut.register("CommandOrControl+Shift+e", () => {
		win?.webContents.send("request-current-task-data-for-edit");
	});
	globalShortcut.register("CommandOrControl+Shift+k", () => {
		createKenbanWindow();
	});
	globalShortcut.register("CommandOrControl+Shift+c", () => {
		windowManager.closeCompletedTasksWindow();
		createCompletedTasksPopUp();
	});
	globalShortcut.register("CommandOrControl+Shift+s", () => {
		win?.focus();
		win?.webContents.send("task_switch_trigger");
	});
	globalShortcut.register("CommandOrControl+Shift+y", () => {
		win?.webContents.send("complete_current_task");
	});
	globalShortcut.register("CommandOrControl+Shift+z", () => {
		createCustomCommandsWindow();
	});
	globalShortcut.register("CommandOrControl+Shift+f", () => {
		win?.show();
		win?.webContents.send("open-fuzzy-finder");
	});

	try {
		await login();
		const token = await oauth2Client.getAccessToken();

		if (userInfo.hasOwnProperty("id")) {
			win?.webContents.send("user-logged-in", userInfo);
			socketConnect(userInfo);
		}

		console.log("token: ", JSON.stringify(token));
	} catch (e) {
		doAuthentication();
	}

	console.log("from main.js", +new Date());

	repositionTaskbar = () => {
		if (!win || win.isDestroyed()) return;
		const displays = screen.getAllDisplays();
		if (displays.length === 0) return;
		// Clamp screen index to valid range
		if (appState.currentlySelectedScreenIndex >= displays.length) {
			appState.currentlySelectedScreenIndex = displays.length - 1;
		}
		if (appState.currentlySelectedScreenIndex < 0) {
			appState.currentlySelectedScreenIndex = 0;
		}
		const display = displays[appState.currentlySelectedScreenIndex];
		const y = appState.currentlySelectedScreenSide === "bottom"
			? display.bounds.y + display.bounds.height - appState.taskbarHeight
			: display.bounds.y;
		win.setBounds({
			x: display.bounds.x,
			y,
			height: appState.taskbarHeight,
			width: display.bounds.width,
		});
	};

	let displayMetricsTimer = null;
	screen.on("display-added", () => repositionTaskbar());
	screen.on("display-removed", () => repositionTaskbar());
	screen.on("display-metrics-changed", () => {
		clearTimeout(displayMetricsTimer);
		displayMetricsTimer = setTimeout(repositionTaskbar, 300);
	});
});

const doAuthentication = () => {
	const authWindow = new BrowserWindow({ width: 800, height: 600 });
	authWindow.loadURL(authUrl);

	authWindow.webContents.once("did-fail-load",
		async (event, errorCode, errorDescription, validatedUrl) => {
			const url = new URL(validatedUrl);
			const code = url.searchParams.get("code");
			authWindow.close(); // Close the window after getting the code

			if (!code) console.log("Authentication failed - no code");
			else await getAuthTokens(code);

			if (userInfo.hasOwnProperty("id")) {
				win.webContents.send("user-logged-in", userInfo);
				socketConnect(userInfo);
			}
		});

}
process.on('uncaughtException', (err) => {
	console.error('Unhandled Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection:', reason, promise);
});

// if all windows are close then quit app.
app.on("window-all-closed", () => {
	app.quit();
});


powerMonitor.on("resume", () => {
	repositionTaskbar();
	sendEvent("request_hard_refresh", "");
})

// app.on("activate", () => {
// 	// mac specific option that has no effect atm as the windows are closed fully on close.
// 	if (BrowserWindow.getAllwindows().length === 0) createWindow();
// });












function createKenbanWindow() {
	return windowManager.openKenbanWindow();
}

function createEditWindow(props) {
	return windowManager.openEditWindow({
		props,
		onDataPrepared: (data) => {
			appState.openTaskProps = data;
		},
		onReadyToShow: () => windowManager.getEditWindow()?.focus(),
		onClose: () => {
			appState.openTaskProps = null;
		},
	});
}

function createCompletedTasksPopUp() {
	appState.fromCompleted = false;
	appState.fromCompletedData = { start_date: null, end_date: null, tags: [], category: null, search_query: null }
	try {
		const alreadyOpen = !!windowManager.getCompletedTasksWindow();
		windowManager.openCompletedTasksWindow({
			onDidFinishLoad: () => {
				sendEvent("get_completed_tasks", appState.fromCompletedData);
			},
		});
		if (alreadyOpen) {
			sendEvent("get_completed_tasks", appState.fromCompletedData);
		}
	}
	catch (e) {
		console.log(e)
	}
}


function createHelpWindow() {
	try {
		return windowManager.openHelpWindow();
	} catch (e) {
		console.error(e);
	}
}


function createCustomCommandsWindow() {
	try {
		const window = windowManager.openCustomCommandsWindow({
			commands: commandsController.getCommandsSnapshot(),
			reservedKeys: RESERVED_COMMAND_KEYS,
		});
		syncCustomCommandsWindow();
		return window;
	} catch (e) {
		console.error(e);
	}
}

function openCalendarWindowOnFocusedScreen(options = {}) {
	const displays = screen.getAllDisplays();
	const requestedIndex = Number.isInteger(options.screenIndex)
		? options.screenIndex
		: appState.currentlySelectedScreenIndex ?? 0;
	const maxIndex = Math.max(displays.length - 1, 0);
	const normalizedIndex = Math.min(Math.max(requestedIndex, 0), maxIndex);
	try {
		return windowManager.openCalendarWindow({
			...options,
			screenIndex: normalizedIndex,
		});
	} catch (e) {
		console.error(e);
	}
}

function openTemplateWindow(options = {}) {
	const displays = screen.getAllDisplays();
	const requestedIndex = Number.isInteger(options.screenIndex)
		? options.screenIndex
		: appState.currentlySelectedScreenIndex ?? 0;
	const maxIndex = Math.max(displays.length - 1, 0);
	const normalizedIndex = Math.min(Math.max(requestedIndex, 0), maxIndex);
	try {
		return windowManager.openTemplateWindow({
			...options,
			screenIndex: normalizedIndex,
		});
	} catch (e) {
		console.error(e);
	}
}

function openFinanceWindow(options = {}) {
	const displays = screen.getAllDisplays();
	const requestedIndex = Number.isInteger(options.screenIndex)
		? options.screenIndex
		: appState.currentlySelectedScreenIndex ?? 0;
	const maxIndex = Math.max(displays.length - 1, 0);
	const normalizedIndex = Math.min(Math.max(requestedIndex, 0), maxIndex);
	try {
		return windowManager.openFinanceWindow({
			...options,
			screenIndex: normalizedIndex,
		});
	} catch (e) {
		console.error(e);
	}
}

function createTaskSplitWindow(props) {
	return windowManager.openTaskSplitWindow({
		props,
	});
}
