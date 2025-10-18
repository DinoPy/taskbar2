import "dotenv/config";
import fs from "fs";
import path from "path";

import { config } from "./src/main/config.js";
import { createWindowManager } from "./src/main/controllers/windowManager.js";
import { createCommandsController } from "./src/main/controllers/commandsController.js";
import { createTasksController } from "./src/main/controllers/tasksController.js";
import { createTaskbarWindow } from "./src/main/windows/taskbarWindow.js";
import { createKenbanWindow as createKenbanBrowserWindow } from "./src/main/windows/kenbanWindow.js";
import { createEditWindow as createEditBrowserWindow } from "./src/main/windows/editWindow.js";
import { createCompletedTasksWindow as createCompletedTasksBrowserWindow } from "./src/main/windows/completedTasksWindow.js";
import { createHelpWindow as createHelpBrowserWindow } from "./src/main/windows/helpWindow.js";
import { createCustomCommandsWindow as createCustomCommandsBrowserWindow } from "./src/main/windows/customCommandsWindow.js";
import { createTaskSplitWindow as createTaskSplitBrowserWindow } from "./src/main/windows/taskSplitWindow.js";
import { createKeyWindow as createKeyBrowserWindow } from "./src/main/windows/keyWindow.js";

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
	Menu,
	MenuItem,
} from "electron";

// Increase max listeners for WebContents to prevent memory leak warnings
// This is a temporary fix while we ensure proper cleanup
app.whenReady().then(() => {
	BrowserWindow.prototype.webContents.setMaxListeners(20);
});
import { createSocketClient } from "./ws.js";
import { oauth2Client, login, authUrl, getAuthTokens, userInfo } from "./googleapis.js";


const ipc = ipcMain;

const appState = {
	isTimerRunning: true,
	categories: [],
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
};

app.setName("Task yourself");
app.setAppUserModelId(app.name);

const RESERVED_COMMAND_KEYS = ["Space", "n", "j", "e", "k", "c", "s", "y", "z"];

const socketEventHandlers = {
	ping: ({ send }) => send("pong", "alive and well"),
	connected: ({ data }) => {
		setUpTasks(data);
	},
	related_task_edited: ({ data }) => WSOnRelatedTaskEdited(data),
	related_task_deleted: ({ data }) => WSOnRelatedTaskDeleted(data),
	related_task_toggled: ({ data }) => WSOnRelatedTaskToggled(data),
	related_added_command: ({ data }) => WSOnRelatedAddedCommand(data),
	related_removed_command: ({ data }) => WSOnRelatedRemovedCommand(data),
	related_updated_categories: ({ data }) => WSOnRelatedUpdatedCategories(data),
	new_task_created: ({ data }) => WSOnNewTaskCreated(data),
	tasks_refresher: ({ data }) => WSOnTaskRefresher(data),
	get_completed_tasks: ({ data }) => WSOnGetCompletedTasks(data),
	request_hard_refresh: ({ data }) => WSOnRequestHardRefresh(data),
};

const socketClient = createSocketClient({
	onConnected: handleSocketConnect,
	onDisconnected: handleSocketDisconnect,
	eventHandlers: socketEventHandlers,
	logger: console,
});

const socketConnect = (userInfo) => socketClient.connect(userInfo);
const sendEvent = (eventName, data) => socketClient.send(eventName, data);

const windowManager = createWindowManager({
	createTaskbarWindow,
	createEditWindow: createEditBrowserWindow,
	createCompletedTasksWindow: createCompletedTasksBrowserWindow,
	createHelpWindow: createHelpBrowserWindow,
	createCustomCommandsWindow: createCustomCommandsBrowserWindow,
	createTaskSplitWindow: createTaskSplitBrowserWindow,
	createKenbanWindow: createKenbanBrowserWindow,
	createKeyWindow: createKeyBrowserWindow,
});

const commandsController = createCommandsController({
	globalShortcut,
	windowManager,
	reservedKeys: RESERVED_COMMAND_KEYS,
});

const tasksController = createTasksController({
	appState,
	windowManager,
	sendEvent,
	getTaskbarWindow: () => windowManager.getTaskbarWindow(),
});

let win = null;

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

const getIsTimerRunning = () => appState.isTimerRunning;

const handleCloseAppRequest = () => {
	windowManager.closeEditWindow();
	windowManager.closeCompletedTasksWindow();
	windowManager.closeTaskSplitWindow();
	windowManager.getTaskbarWindow()?.close();
};

const createTaskbarWindowInstance = () => {
	win = windowManager.createTaskbarWindow({
		ipcMain,
		taskbarHeight: appState.taskbarHeight,
		currentlySelectedScreenIndex: appState.currentlySelectedScreenIndex,
		getIsTimerRunning,
		onCloseApp: handleCloseAppRequest,
		onShowTaskContextMenu: createTaskContextMenu,
		onShowGeneralContextMenu: createContextMenu,
		onShowLoginContextMenu: createLoginContextMenu,
	});
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
		win?.webContents.openDevTools();
		getTaskWindow()?.webContents.openDevTools();
		windowManager.getCompletedTasksWindow()?.webContents.openDevTools();
		windowManager.getKenbanWindow()?.webContents.openDevTools();
		windowManager.getHelpWindow()?.webContents.openDevTools();
		windowManager.getCustomCommandsWindow()?.webContents.openDevTools();
		windowManager.getTaskSplitWindow()?.webContents.openDevTools();
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
	screen.on("display-added", (event, newDisplay) => {
		console.log("Display added");
		const displays = screen.getAllDisplays();
		while (appState.currentlySelectedScreenIndex > displays.length - 1) {
			appState.currentlySelectedScreenIndex -= 1;
		}

		const y = appState.currentlySelectedScreenSide === "bottom"
			? displays[appState.currentlySelectedScreenIndex].bounds.y + displays[appState.currentlySelectedScreenIndex].bounds.height - appState.taskbarHeight
			: displays[appState.currentlySelectedScreenIndex].bounds.y;

		win?.setBounds({
			x: displays[appState.currentlySelectedScreenIndex].bounds.x,
			y,
			height: appState.taskbarHeight,
			width: displays[appState.currentlySelectedScreenIndex].bounds.width,
		});
	});

	// Listen for a display being removed
	screen.on("display-removed", (event, oldDisplay) => {
		console.log("Display removed");
		const displays = screen.getAllDisplays();
		const y = appState.currentlySelectedScreenSide === "bottom"
			? displays[0].bounds.y + displays[0].bounds.height - appState.taskbarHeight
			: displays[0].bounds.y;

		win?.setBounds({
			x: displays[0].bounds.x,
			y,
			height: appState.taskbarHeight,
			width: displays[0].bounds.width,
		});
	});

	// Listen for changes to metrics (like resolution or orientation)
	screen.on("display-metrics-changed", (event, changedDisplay, changedMetrics) => {
		console.log("Display metrics changed");
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


powerMonitor.on("suspend", () => {
	console.log("system suspended");
})
powerMonitor.on("resume", () => {
	console.log("system resumed");
	sendEvent("request_hard_refresh", "")
})

// app.on("activate", () => {
// 	// mac specific option that has no effect atm as the windows are closed fully on close.
// 	if (BrowserWindow.getAllwindows().length === 0) createWindow();
// });


function createContextMenu() {
	const menu = new Menu();

	const submenus = screen.getAllDisplays().map((d, i) => {
		return {
			label: `Screen ${i} - Top`,
			click: () => {
				appState.currentlySelectedScreenIndex = i;
				appState.currentlySelectedScreenSide = "top";
				win.setBounds({
					x: d.bounds.x,
					y: d.bounds.y,
					height: appState.taskbarHeight,
					width: d.bounds.width,
				});
			},
		};
	});

	submenus.push(
		...screen.getAllDisplays().map((d, i) => {
			return {
				label: `Screen ${i} - Bottom`,
				click: () => {
					appState.currentlySelectedScreenIndex = i;
					appState.currentlySelectedScreenSide = "bottom";
					win.setBounds({
						x: d.bounds.x,
						y: d.bounds.y + d.bounds.height - appState.taskbarHeight,
						height: appState.taskbarHeight,
						width: d.bounds.width,
					});
				},
			};
		})
	);

	menu.append(
		new MenuItem({
			label: "Select screen",
			submenu: submenus,
		})
	);

	menu.append(
		new MenuItem({
			label: "Toggle timer",
			toolTip: `Timer is currently ${appState.isTimerRunning ? "running" : "deactivated"
				}`,
			type: "checkbox",
			checked: appState.isTimerRunning,
			click: () => {
				appState.isTimerRunning = !appState.isTimerRunning;
				win.webContents.send("toggle-countdown-timer", {
					isTimerRunning: appState.isTimerRunning,
				});
			},
		})
	);

	menu.append(new MenuItem({
		label: "Completed tasks",
		toolTip: "Show tasks that were completed so far",
		click: () => createCompletedTasksPopUp()
	}))

	menu.append(new MenuItem({
		label: "Toggle always on top",
		toolTip: "When toggled the window will stay on top of all other tasks",
		type: "checkbox",
		checked: win.isAlwaysOnTop(),
		click: () => win.setAlwaysOnTop(!win.isAlwaysOnTop())
	}))

	menu.append(new MenuItem({
		label: "Custom Commands",
		toolTip: "Open settings window for custom commands",
		click: () => createCustomCommandsWindow()
	}))

	menu.append(new MenuItem({
		label: "Help",
		toolTip: "Opens the help window",
		click: () => createHelpWindow()
	}))

	menu.append(new MenuItem({
		label: "Show all tasks",
		toolTip: "Toggle between showing all tasks or only tasks that are due soon",
		type: "checkbox",
		checked: appState.showAllTasks,
		click: () => {
			appState.showAllTasks = !appState.showAllTasks;
			win.webContents.send("toggle-show-all-tasks", {
				showAllTasks: appState.showAllTasks
			});
		},
	}))

	menu.popup(win, 0, 0);
}

function createTaskContextMenu(args) {
	const ctxMenu = new Menu();

	ctxMenu.append(
		new MenuItem({
			label: "Edit",
			click: () => {
				createEditWindow({ ...args, categories: appState.categories });
			},
		})
	);

	ctxMenu.append(
		new MenuItem({
			label: "Delete",
			click: () => {
				const editWindow = getTaskWindow();
				if (editWindow && appState.openTaskProps?.id === args.id) editWindow.close();
				tasksController.deleteTask(args);
			},
		})
	);

	ctxMenu.append(
		new MenuItem({
			label: "Complete",
			click: () => {
				const editWindow = getTaskWindow();
				if (editWindow && appState.openTaskProps?.id === args.id) editWindow.close();
				tasksController.completeTask(args);
			},
		})

	);

	ctxMenu.append(
		new MenuItem({
			label: "Duplicate",
			click: () => {
				tasksController.duplicateTask(args);
			},
		})
	);

	ctxMenu.append(
	new MenuItem({
		label: "Split",
		click: () => {
			createTaskSplitWindow(args);
		},
	})
	);
	ctxMenu.append(
		new MenuItem({
			label: "Category",
			submenu: appState.categories.map(
				(cat) =>
					new MenuItem({
						label: cat,
						type: "radio",
						checked: cat === args.category ? true : false,
						click: () => {
							win.webContents.send("update-task-category", {
								id: args.id,
								newCategory: cat,
							});
						},
					})
			),
		})
	);
	// loop through the list starting from the tail and loop towards the middle
	ctxMenu.popup(win, 0, 0);
}


function createLoginContextMenu(args) {
	const ctxMenu = new Menu();
	const isLoggedIn = userInfo.hasOwnProperty("id");

	ctxMenu.append(
		new MenuItem({
			label: isLoggedIn ? "Sign Out" : "Sign In",
			click: () => {
				if (isLoggedIn) {
					socketClient.close();
					Object.keys(userInfo).forEach(key => delete userInfo[key]);
					fs.unlink(config.tokensFilePath, (e) => {
						if (e && e.code !== "ENOENT") {
							console.log(e);
						}
					});
					win.webContents.send("user-logged-out", userInfo);
				} else {
					doAuthentication();
				}
			},
		})
	);

	ctxMenu.popup(win, 0, 0);
}

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

// ensures the communication between the children windows and the main task window.
ipc.on("edit-submission-event-from-edit-popup", (e, { categories, ...data }) => {
	win.webContents.send("msg-redirected-to-parent", data);
	// send an event to the server to update the categories of the user if they changed
	if (JSON.stringify(categories) !== JSON.stringify(appState.categories)) {
		sendEvent("user_updated_categories", categories);
	}
	appState.categories = categories;

	windowManager.closeEditWindow();
	appState.openTaskProps = null;

	if (appState.fromCompleted && windowManager.getCompletedTasksWindow()) {
		console.log("triggering refresh for tasks")
		setTimeout(() => {
			sendEvent("get_completed_tasks", appState.fromCompletedData);
		}, 250)
		appState.fromCompleted = false;
	}

});

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

ipc.on("completed_task_date_updated", (e, data) => {
	appState.fromCompletedData = data;
	sendEvent("get_completed_tasks", data)
})


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

function createTaskSplitWindow(props) {
	return windowManager.openTaskSplitWindow({
		props,
	});
}

ipc.on("new_command_added", (_, data) => {
	if (!commandsController.addCommand(data)) {
		return;
	}
	const snapshot = commandsController.getCommandsSnapshot();
	sendEvent("new_command_added", JSON.stringify(snapshot));
	syncCustomCommandsWindow();
});

ipc.on("command_removed", (_, data) => {
	commandsController.removeCommand(data.key);
	const snapshot = commandsController.getCommandsSnapshot();
	sendEvent("command_removed", JSON.stringify(snapshot));
	syncCustomCommandsWindow();
});


ipc.on("task_complete", async (_, data) => {
	try {
		// TODO: Re enable posting to sheets.
		// await postTaskToSheets(data);
		console.log(`Task ${data.id} is completed`);
		sendEvent("task_completed", {
			id: data.id,
			duration: data.duration,
			completed_at: data.completed_at,
			last_modified_at: +new Date()
		})
	} catch (error) {
		win.webContents.send("post-task-error", JSON.stringify(error));
	}
});


ipc.on("task_create", async (_, data) => {
	console.log(data);
	console.log(`Task ${data.id} is being created`)
	sendEvent("task_create", data);
	// TODO: Add event for task_create_response
})

ipc.on("task_toggle", (_, data) => {
	console.log(`Task ${data.uuid} is toggled ${data.is_active}`);
	console.log(data)
	sendEvent("task_toggle", data);
})


ipc.on("task_edit", async (_, data) => {
	console.log(`Task ${data.id} is being edited`);
	sendEvent("task_edit", data);
	appState.fromCompleted = false;
})

ipc.on("task_delete", (_, data) => {
	console.log(`Task ${data.id} id deleted`);
	sendEvent("task_delete", data);
})

ipc.on("toggle_current_task_edit", (_, data) => {
	console.log(data)
	windowManager.closeEditWindow();
	createEditWindow({ ...data, categories: appState.categories });
	getTaskWindow()?.focus();

})

ipc.on("toggle_given_task_edit", (_, data) => {
	appState.fromCompleted = true;
	windowManager.closeEditWindow();
	createEditWindow({ ...data, categories: appState.categories });
	getTaskWindow()?.focus();

})

ipc.on("duplicate-task", (_, data) => {
	console.log(`Main: Duplicating task ${data.id}`);
	tasksController.duplicateTask({ id: data.id });
});

ipc.on("complete-task", (_, data) => {
	console.log(`Main: Completing task ${data.id}`);
	tasksController.completeTask({ id: data.id });
});

ipc.on("delete-task", (_, data) => {
	console.log(`Main: Deleting task ${data.id}`);
	tasksController.deleteTask({ id: data.id });
});

ipc.on("open-task-split", (_, data) => {
	console.log(`Main: Opening split window for task ${data.id}`);
	createTaskSplitWindow(data.taskData);
});

ipc.on("toggle-show-all-tasks", () => {
	console.log("Toggling show all tasks");
	appState.showAllTasks = !appState.showAllTasks;
	win.webContents.send("toggle-show-all-tasks", {
		showAllTasks: appState.showAllTasks
	});
});

ipc.on("switch-screen", (_, data) => {
	console.log(`Switching to screen ${data.screenIndex} ${data.direction}`);
	const displays = screen.getAllDisplays();
	
	if (data.screenIndex >= 0 && data.screenIndex < displays.length) {
		appState.currentlySelectedScreenIndex = data.screenIndex;
		appState.currentlySelectedScreenSide = data.direction;
		
		const display = displays[data.screenIndex];
		const y = data.direction === "down" ?
			display.bounds.y + display.bounds.height - appState.taskbarHeight :
			display.bounds.y;
			
		win.setBounds({
			x: display.bounds.x,
			y: y,
			height: appState.taskbarHeight,
			width: display.bounds.width,
		});
	}
});



ipc.on("close-children-window", () => {
	windowManager.closeEditWindow();
	windowManager.closeTaskSplitWindow();
	appState.openTaskProps = null;
});

ipc.on("task-split-submission", (_, data) => {
	console.log(`Task ${data.task_id} is being split`);
	sendEvent("task_split", data);
	windowManager.closeTaskSplitWindow();

	// Refresh completed tasks list if it's open
	if (tasksController.refreshCompletedTasksIfOpen()) {
		console.log("triggering refresh for tasks after split");
	}
});

ipc.on("toggle-always-on-top", () => {
	console.log("Toggling always on top");
	const isAlwaysOnTop = win.isAlwaysOnTop();
	win.setAlwaysOnTop(!isAlwaysOnTop);
	console.log(`Always on top: ${!isAlwaysOnTop}`);
});

ipc.on("close-completed-list-window", () => {
	windowManager.closeCompletedTasksWindow();
});

// Handle duplicate completed task
ipc.on("duplicate_completed_task", (_, data) => {
	console.log(`Duplicating completed task ${data.id}`);
	sendEvent("task_duplicate", {
		task_id: data.id
	});

	// Refresh completed tasks list if it's open
	if (tasksController.refreshCompletedTasksIfOpen()) {
		console.log("triggering refresh for tasks after duplicate");
	}
});

// Handle split completed task
ipc.on("split_completed_task", (_, data) => {
	console.log(`Opening split window for completed task ${data.id}`);
	windowManager.closeTaskSplitWindow();
	createTaskSplitWindow({
		id: data.id,
		title: data.title,
		description: data.description,
		category: data.category,
		tags: data.tags,
		duration: data.duration
	});
});

// Handle delete completed task
ipc.on("delete_completed_task", (_, data) => {
	console.log(`Deleting completed task ${data.id}`);
	sendEvent("task_delete", {
		id: data.id
	});

	// Refresh completed tasks list if it's open
	if (tasksController.refreshCompletedTasksIfOpen()) {
		console.log("triggering refresh for tasks after delete");
	}
});




function WSOnNewTaskCreated(data) {
	console.log("new task created", data);
	win.webContents.send("new_task_from_relative", data);
}

function WSOnRelatedTaskToggled(data) {
	win.webContents.send("related_task_toggled", data);
}

function WSOnRelatedTaskDeleted(data) {
	win.webContents.send("related_task_deleted", data);
}

function WSOnRelatedTaskEdited(data) {
	win.webContents.send("related_task_edited", data);
}

function WSOnTaskRefresher(data) {
	if (win && win.webContents) {
		win.webContents.send("refresh_tasks", data.tasks);
	}
}

function WSOnRelatedAddedCommand(data) {
	const parsed = typeof data === "string" ? JSON.parse(data) : data;
	commandsController.syncCommands(parsed);
	syncCustomCommandsWindow();
}

function WSOnRelatedRemovedCommand(data) {
	const parsed = typeof data === "string" ? JSON.parse(data) : data;
	commandsController.removeMissingCommands(parsed);
	syncCustomCommandsWindow();
}

function WSOnRelatedUpdatedCategories(data) {
	appState.categories = data;
}

function handleSocketConnect() {
	if (win && win.webContents) {
		win.webContents.send("socket-connected");
	}
	else
		setTimeout(handleSocketConnect, 1000);
}

function handleSocketDisconnect() {
	if (win && win.webContents) {
		win.webContents.send("socket-disconnected");
	} else {
		setTimeout(handleSocketDisconnect, 1000);
	}
}

function setUpTasks(data) {
	if (data.categories) {
		appState.categories = data.categories.split(",");
	}
	if (win && win.webContents) {
		setTimeout(() => { win.webContents.send("refresh_tasks", data.tasks) }, 1000)
		setTimeout(handleSocketConnect, 1000)
	}

	const keyCommands = JSON.parse(data.key_commands);
	commandsController.replaceCommands(keyCommands);
	syncCustomCommandsWindow();
}

function WSOnGetCompletedTasks(data) {
	const completedWindow = windowManager.getCompletedTasksWindow();
	if (completedWindow) {
		completedWindow.webContents.send("completed-tasks-list",
			{
				tasks: data,
				categories: appState.categories,
			});
	}
}

function WSOnRequestHardRefresh(data) {
	appState.categories = data.categories.split(",");
	if (win && win.webContents)
		win.webContents.send("refresh_tasks", data.tasks);
}
