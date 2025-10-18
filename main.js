import "dotenv/config";
import fs from "fs";
import path from "path";

import { config } from "./src/main/config.js";
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

let currentlySelectedScreenIndex = 0;
let currentlySelectedScreenSide = "top";

app.setName("Task yourself");
app.setAppUserModelId(app.name);

let isTimerRunning = true;
let CATEGORIES = [];
let showAllTasks = false;
let taskbarHeight = 60;

let win = null;
let taskWindow = null;
let completedTasksWindow = null;
let kenbanWindow = null;
let helpWindow = null;
let customCommandsWindow = null;
let taskSplitWindow = null;
let openTaskProps = null;

const reserved_keys = ["Space", "n", "j", "e", "k", "c", "s", "y", "z"];
const commands_and_windows = {};

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

const getIsTimerRunning = () => isTimerRunning;

const handleCloseAppRequest = () => {
	taskWindow?.close();
	completedTasksWindow?.close();
	taskSplitWindow?.close();
	win?.close();
};

const createTaskbarWindowInstance = () => {
	win = createTaskbarWindow({
		ipcMain,
		taskbarHeight,
		currentlySelectedScreenIndex,
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
		taskWindow?.webContents.openDevTools();
		completedTasksWindow?.webContents.openDevTools();
		kenbanWindow?.webContents.openDevTools();
		helpWindow?.webContents.openDevTools();
		customCommandsWindow?.webContents.openDevTools();
		taskSplitWindow?.webContents.openDevTools();
	});
	globalShortcut.register("CommandOrControl+Shift+e", () => {
		win?.webContents.send("request-current-task-data-for-edit");
	});
	globalShortcut.register("CommandOrControl+Shift+k", () => {
		createKenbanWindow();
	});
	globalShortcut.register("CommandOrControl+Shift+c", () => {
		completedTasksWindow?.close();
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
		!customCommandsWindow && createCustomCommandsWindow();
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
		while (currentlySelectedScreenIndex > displays.length - 1) {
			currentlySelectedScreenIndex -= 1;
		}

		const y = currentlySelectedScreenSide === "bottom"
			? displays[currentlySelectedScreenIndex].bounds.y + displays[currentlySelectedScreenIndex].bounds.height - taskbarHeight
			: displays[currentlySelectedScreenIndex].bounds.y;

		win?.setBounds({
			x: displays[currentlySelectedScreenIndex].bounds.x,
			y,
			height: taskbarHeight,
			width: displays[currentlySelectedScreenIndex].bounds.width,
		});
	});

	// Listen for a display being removed
	screen.on("display-removed", (event, oldDisplay) => {
		console.log("Display removed");
		const displays = screen.getAllDisplays();
		const y = currentlySelectedScreenSide === "bottom"
			? displays[0].bounds.y + displays[0].bounds.height - taskbarHeight
			: displays[0].bounds.y;

		win?.setBounds({
			x: displays[0].bounds.x,
			y,
			height: taskbarHeight,
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
const createKeyWindow = (key, url) => {
	const win = createKeyBrowserWindow({
		url,
		onClose: () => {
			commands_and_windows[key].window = null;
		},
	});
	commands_and_windows[key].window = win;
};

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
				currentlySelectedScreenIndex = i;
				currentlySelectedScreenSide = "top";
				win.setBounds({
					x: d.bounds.x,
					y: d.bounds.y,
					height: taskbarHeight,
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
					currentlySelectedScreenIndex = i;
					currentlySelectedScreenSide = "bottom";
					win.setBounds({
						x: d.bounds.x,
						y: d.bounds.y + d.bounds.height - taskbarHeight,
						height: taskbarHeight,
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
			toolTip: `Timer is currently ${isTimerRunning ? "running" : "deactivated"
				}`,
			type: "checkbox",
			checked: isTimerRunning,
			click: () => {
				isTimerRunning = !isTimerRunning;
				win.webContents.send("toggle-countdown-timer", {
					isTimerRunning: isTimerRunning,
				});
			},
		})
	);

	menu.append(new MenuItem({
		label: "Completed tasks",
		toolTip: "Show tasks that were completed so far",
		click: () => !completedTasksWindow && createCompletedTasksPopUp()
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
		click: () => !customCommandsWindow && createCustomCommandsWindow()
	}))

	menu.append(new MenuItem({
		label: "Help",
		toolTip: "Opens the help window",
		click: () => !helpWindow && createHelpWindow()
	}))

	menu.append(new MenuItem({
		label: "Show all tasks",
		toolTip: "Toggle between showing all tasks or only tasks that are due soon",
		type: "checkbox",
		checked: showAllTasks,
		click: () => {
			showAllTasks = !showAllTasks;
			win.webContents.send("toggle-show-all-tasks", {
				showAllTasks: showAllTasks
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
				taskWindow?.close();
				createEditWindow({ ...args, categories: CATEGORIES });
			},
		})
	);

	ctxMenu.append(
		new MenuItem({
			label: "Delete",
			click: () => {
				if (taskWindow && openTaskProps.id === args.id) taskWindow.close();
				deleteTask(args);
			},
		})
	);

	ctxMenu.append(
		new MenuItem({
			label: "Complete",
			click: () => {
				if (taskWindow && openTaskProps.id === args.id) taskWindow.close();
				completeTask(args);
			},
		})

	);

	ctxMenu.append(
		new MenuItem({
			label: "Duplicate",
			click: () => {
				duplicateTask(args);
			},
		})
	);

	ctxMenu.append(
		new MenuItem({
			label: "Split",
			click: () => {
				taskSplitWindow?.close();
				createTaskSplitWindow(args);
			},
		})
	);
	ctxMenu.append(
		new MenuItem({
			label: "Category",
			submenu: CATEGORIES.map(
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
	if (kenbanWindow) return kenbanWindow;
	kenbanWindow = createKenbanBrowserWindow({
		onClose: () => {
			kenbanWindow = null;
		},
	});
	return kenbanWindow;
}

function createEditWindow(props) {
	taskWindow = createEditBrowserWindow({
		props,
		onDataPrepared: (data) => {
			openTaskProps = data;
		},
		onReadyToShow: () => taskWindow.focus(),
		onClose: () => {
			taskWindow = null;
			openTaskProps = null;
		},
	});
	return taskWindow;
}

let from_completed = false;
let from_completed_data = { start_date: null, end_date: null, tags: [], category: null, search_query: null };
// ensures the communication between the children windows and the main task window.
ipc.on("edit-submission-event-from-edit-popup", (e, { categories, ...data }) => {
	win.webContents.send("msg-redirected-to-parent", data);
	// send an event to the server to update the categories of the user if they changed
	if (JSON.stringify(categories) !== JSON.stringify(CATEGORIES)) {
		sendEvent("user_updated_categories", categories);
	}
	CATEGORIES = categories;

	if (taskWindow) taskWindow.close();
	openTaskProps = null;

	if (from_completed && completedTasksWindow) {
		console.log("triggering refresh for tasks")
		setTimeout(() => {
			sendEvent("get_completed_tasks", from_completed_data);
		}, 250)
		from_completed = false;
	}

});

function createCompletedTasksPopUp() {
	from_completed_data = { start_date: null, end_date: null, tags: [], category: null, search_query: null }
	try {
		completedTasksWindow = createCompletedTasksBrowserWindow({
			onDidFinishLoad: () => {
				sendEvent("get_completed_tasks", from_completed_data);
			},
			onClose: () => {
				completedTasksWindow = null;
			},
		});
	}
	catch (e) {
		console.log(e)
	}
}

ipc.on("completed_task_date_updated", (e, data) => {
	from_completed_data = data;
	sendEvent("get_completed_tasks", data)
})


function createHelpWindow() {
	if (helpWindow) return helpWindow;
	try {
		helpWindow = createHelpBrowserWindow({
			onClose: () => {
				helpWindow = null;
			},
		});
		console.log("creating help window");
	} catch (e) {
		console.error(e);
	}
	return helpWindow;
}


function createCustomCommandsWindow() {
	if (customCommandsWindow) return customCommandsWindow;
	try {
		customCommandsWindow = createCustomCommandsBrowserWindow({
			commands: commands_and_windows,
			reservedKeys: reserved_keys,
			onClose: () => {
				customCommandsWindow = null;
			},
		});
	} catch (e) {
		console.error(e);
	}
	return customCommandsWindow;
}

function createTaskSplitWindow(props) {
	taskSplitWindow = createTaskSplitBrowserWindow({
		props,
		onReadyToShow: () => taskSplitWindow.focus(),
		onClose: () => {
			taskSplitWindow = null;
		},
	});
	return taskSplitWindow;
}

ipc.on("new_command_added", (_, data) => {
	console.log(JSON.stringify(data));
	commands_and_windows[data.key] = {
		window: null,
		...data
	}

	globalShortcut.register(`CommandOrControl+Shift+${data.key}`, () => {
		createKeyWindow(data.key, data.url);
	})

	const keyAndCommands = {};
	for (let c in commands_and_windows) {
		keyAndCommands[c] = {};
		keyAndCommands[c]["key"] = commands_and_windows[c].key
		keyAndCommands[c]["url"] = commands_and_windows[c].url
	}
	sendEvent("new_command_added", JSON.stringify(keyAndCommands));
})

ipc.on("command_removed", (_, data) => {
	commands_and_windows[data.key]?.window?.close();
	globalShortcut.unregister(`CommandOrControl+Shift+${data.key}`)
	delete commands_and_windows[data.key];

	const keyAndCommands = {};
	for (let c in commands_and_windows) {
		keyAndCommands[c] = {};
		keyAndCommands[c]["key"] = commands_and_windows[c].key
		keyAndCommands[c]["url"] = commands_and_windows[c].url
	}
	sendEvent("command_removed", JSON.stringify(keyAndCommands));
})


function deleteTask(props) {
	win.webContents.send("deleteTask", props);
	if (openTaskProps && props.id === openTaskProps.id) openTaskProps = null;
}
function completeTask(props) {
	win.webContents.send("completeTask", props);
	if (openTaskProps && props.id === openTaskProps.id) openTaskProps = null;
}

function duplicateTask(props) {
	console.log(`Task ${props.id} is being duplicated`);
	sendEvent("task_duplicate", {
		task_id: props.id
	});
}

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
	from_completed = false;
})

ipc.on("task_delete", (_, data) => {
	console.log(`Task ${data.id} id deleted`);
	sendEvent("task_delete", data);
})

ipc.on("toggle_current_task_edit", (_, data) => {
	console.log(data)
	taskWindow?.close();
	createEditWindow({ ...data, categories: CATEGORIES });
	taskWindow?.focus();

})

ipc.on("toggle_given_task_edit", (_, data) => {
	from_completed = true;
	taskWindow?.close();
	createEditWindow({ ...data, categories: CATEGORIES });
	taskWindow?.focus();

})

ipc.on("duplicate-task", (_, data) => {
	console.log(`Main: Duplicating task ${data.id}`);
	duplicateTask({ id: data.id });
});

ipc.on("complete-task", (_, data) => {
	console.log(`Main: Completing task ${data.id}`);
	win.webContents.send("completeTask", { id: data.id });
});

ipc.on("delete-task", (_, data) => {
	console.log(`Main: Deleting task ${data.id}`);
	deleteTask({ id: data.id });
});

ipc.on("open-task-split", (_, data) => {
	console.log(`Main: Opening split window for task ${data.id}`);
	taskSplitWindow?.close();
	createTaskSplitWindow(data.taskData);
});

ipc.on("toggle-show-all-tasks", () => {
	console.log("Toggling show all tasks");
	showAllTasks = !showAllTasks;
	win.webContents.send("toggle-show-all-tasks", {
		showAllTasks: showAllTasks
	});
});

ipc.on("switch-screen", (_, data) => {
	console.log(`Switching to screen ${data.screenIndex} ${data.direction}`);
	const displays = screen.getAllDisplays();
	
	if (data.screenIndex >= 0 && data.screenIndex < displays.length) {
		currentlySelectedScreenIndex = data.screenIndex;
		currentlySelectedScreenSide = data.direction;
		
		const display = displays[data.screenIndex];
		const y = data.direction === "down" ?
			display.bounds.y + display.bounds.height - taskbarHeight :
			display.bounds.y;
			
		win.setBounds({
			x: display.bounds.x,
			y: y,
			height: taskbarHeight,
			width: display.bounds.width,
		});
	}
});



ipc.on("close-children-window", () => {
	if (taskWindow) taskWindow.close();
	if (taskSplitWindow) taskSplitWindow.close();
	openTaskProps = null;
	taskWindow = null;
	taskSplitWindow = null;
});

ipc.on("task-split-submission", (_, data) => {
	console.log(`Task ${data.task_id} is being split`);
	sendEvent("task_split", data);
	if (taskSplitWindow) taskSplitWindow.close();
	taskSplitWindow = null;
	
	// Refresh completed tasks list if it's open
	if (completedTasksWindow) {
		console.log("triggering refresh for tasks after split");
		setTimeout(() => {
			sendEvent("get_completed_tasks", from_completed_data);
		}, 250);
	}
});

ipc.on("toggle-always-on-top", () => {
	console.log("Toggling always on top");
	const isAlwaysOnTop = win.isAlwaysOnTop();
	win.setAlwaysOnTop(!isAlwaysOnTop);
	console.log(`Always on top: ${!isAlwaysOnTop}`);
});

ipc.on("close-completed-list-window", () => {
	if (completedTasksWindow) completedTasksWindow.close();
	completedTasksWindow = null;
});

// Handle duplicate completed task
ipc.on("duplicate_completed_task", (_, data) => {
	console.log(`Duplicating completed task ${data.id}`);
	sendEvent("task_duplicate", {
		task_id: data.id
	});
	
	// Refresh completed tasks list if it's open
	if (completedTasksWindow) {
		console.log("triggering refresh for tasks after duplicate");
		setTimeout(() => {
			sendEvent("get_completed_tasks", from_completed_data);
		}, 250);
	}
});

// Handle split completed task
ipc.on("split_completed_task", (_, data) => {
	console.log(`Opening split window for completed task ${data.id}`);
	taskSplitWindow?.close();
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
	if (completedTasksWindow) {
		console.log("triggering refresh for tasks after delete");
		setTimeout(() => {
			sendEvent("get_completed_tasks", from_completed_data);
		}, 250);
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
	data = JSON.parse(data);
	for (let key in data) {
		if (commands_and_windows.hasOwnProperty(key))
			continue;

		commands_and_windows[key] = {
			window: null,
			...data[key]
		}

		globalShortcut.register(`CommandOrControl+Shift+${key}`, () => {
			createKeyWindow(key, data[key].url);
		})
	}
}

function WSOnRelatedRemovedCommand(data) {
	data = JSON.parse(data);
	for (let key in commands_and_windows) {
		if (data.hasOwnProperty(key))
			continue;

		globalShortcut.unregister(`CommandOrControl+Shift+${key}`);
		commands_and_windows[key]?.window?.close();
		delete commands_and_windows[key];
	}
}

function WSOnRelatedUpdatedCategories(data) {
	CATEGORIES = data;
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
		CATEGORIES = data.categories.split(",");
	}
	if (win && win.webContents) {
		setTimeout(() => { win.webContents.send("refresh_tasks", data.tasks) }, 1000)
		setTimeout(handleSocketConnect, 1000)
	}

	const key_commands = JSON.parse(data.key_commands);
	Object.keys(key_commands).forEach(command => {
		if (reserved_keys.includes(command)) return;
		commands_and_windows[command] = {
			window: null,
			key: command,
			url: key_commands[command].url
		}

		globalShortcut.register(`CommandOrControl+Shift+${command}`, () => {
			createKeyWindow(command, key_commands[command].url);
		})
	})
}

function WSOnGetCompletedTasks(data) {
	if (completedTasksWindow) {
		completedTasksWindow.webContents.send("completed-tasks-list",
			{
				tasks: data,
				categories: CATEGORIES,
			});
	}
}

function WSOnRequestHardRefresh(data) {
	CATEGORIES = data.categories.split(",");
	if (win && win.webContents)
		win.webContents.send("refresh_tasks", data.tasks);
}
