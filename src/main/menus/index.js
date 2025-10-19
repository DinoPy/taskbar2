import { Menu, MenuItem, screen } from "electron";

export function showMainContextMenu({
	win,
	appState,
	createCompletedTasksPopUp,
	createCustomCommandsWindow,
	createHelpWindow,
	toggleAlwaysOnTop,
	notificationReminderIntervalMinutes,
	setNotificationReminderInterval,
	notificationsMuted,
	setNotificationsMuted,
}) {
	const menu = new Menu();

	const displayMenus = screen.getAllDisplays().map((display, index) => ({
		label: `Screen ${index} - Top`,
		click: () => {
			appState.currentlySelectedScreenIndex = index;
			appState.currentlySelectedScreenSide = "top";
			win.setBounds({
				x: display.bounds.x,
				y: display.bounds.y,
				height: appState.taskbarHeight,
				width: display.bounds.width,
			});
		},
	}));

	displayMenus.push(
		...screen.getAllDisplays().map((display, index) => ({
			label: `Screen ${index} - Bottom`,
			click: () => {
				appState.currentlySelectedScreenIndex = index;
				appState.currentlySelectedScreenSide = "bottom";
				win.setBounds({
					x: display.bounds.x,
					y: display.bounds.y + display.bounds.height - appState.taskbarHeight,
					height: appState.taskbarHeight,
					width: display.bounds.width,
				});
			},
		}))
	);

	menu.append(
		new MenuItem({
			label: "Mute notifications",
			toolTip: "Silence system alerts and sounds for notifications",
			type: "checkbox",
			checked: Boolean(notificationsMuted),
			click: () => setNotificationsMuted?.(!notificationsMuted),
		})
	);

	menu.append(
		new MenuItem({
			label: "Select screen",
			submenu: displayMenus,
		})
	);

	menu.append(
		new MenuItem({
			label: "Toggle timer",
			toolTip: `Timer is currently ${appState.isTimerRunning ? "running" : "deactivated"}`,
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

	menu.append(
		new MenuItem({
			label: "Completed tasks",
			toolTip: "Show tasks that were completed so far",
			click: () => createCompletedTasksPopUp(),
		})
	);

	menu.append(
		new MenuItem({
			label: "Toggle always on top",
			toolTip: "When toggled the window will stay on top of all other tasks",
			type: "checkbox",
			checked: win.isAlwaysOnTop(),
			click: () => toggleAlwaysOnTop(),
		})
	);

	const reminderOptions = [
		{ label: "Off", value: 0 },
		{ label: "Every minute", value: 1 },
		{ label: "Every 5 minutes", value: 5 },
		{ label: "Every 15 minutes", value: 15 },
		{ label: "Every 30 minutes", value: 30 },
		{ label: "Every hour", value: 60 },
	];

	menu.append(
		new MenuItem({
			label: "Notification reminder",
			toolTip: "Choose how often unread notifications resurface",
			submenu: reminderOptions.map(({ label, value }) =>
				new MenuItem({
					label,
					type: "radio",
					checked: value === notificationReminderIntervalMinutes,
					click: () => setNotificationReminderInterval?.(value),
				})
			),
		})
	);

	menu.append(
		new MenuItem({
			label: "Custom Commands",
			toolTip: "Open settings window for custom commands",
			click: () => createCustomCommandsWindow(),
		})
	);

	menu.append(
		new MenuItem({
			label: "Help",
			toolTip: "Opens the help window",
			click: () => createHelpWindow(),
		})
	);

	menu.append(
		new MenuItem({
			label: "Show all tasks",
			toolTip: "Toggle between showing all tasks or only tasks that are due soon",
			type: "checkbox",
			checked: appState.showAllTasks,
			click: () => {
				appState.showAllTasks = !appState.showAllTasks;
				win.webContents.send("toggle-show-all-tasks", {
					showAllTasks: appState.showAllTasks,
				});
			},
		})
	);

	menu.popup({
		window: win,
	});
}

export function showTaskContextMenu({
	win,
	appState,
	task,
	tasksController,
	openEditWindowForTask,
	getTaskWindow,
	createTaskSplitWindow,
}) {
	const menu = new Menu();

	menu.append(
		new MenuItem({
			label: "Edit",
			click: () => openEditWindowForTask(task),
		})
	);

	menu.append(
		new MenuItem({
			label: "Delete",
			click: () => {
				const editWindow = getTaskWindow();
				if (editWindow && appState.openTaskProps?.id === task.id) editWindow.close();
				tasksController.deleteTask(task);
			},
		})
	);

	menu.append(
		new MenuItem({
			label: "Complete",
			click: () => {
				const editWindow = getTaskWindow();
				if (editWindow && appState.openTaskProps?.id === task.id) editWindow.close();
				tasksController.completeTask(task);
			},
		})
	);

	menu.append(
		new MenuItem({
			label: "Duplicate",
			click: () => {
				tasksController.duplicateTask(task);
			},
		})
	);

	menu.append(
		new MenuItem({
			label: "Split",
			click: () => createTaskSplitWindow(task),
		})
	);

	menu.append(
		new MenuItem({
			label: "Category",
			submenu: appState.categories.map(
				(category) =>
					new MenuItem({
						label: category,
						type: "radio",
						checked: category === task.category,
						click: () => {
							win.webContents.send("update-task-category", {
								id: task.id,
								newCategory: category,
							});
						},
					})
			),
		})
	);

	menu.popup({
		window: win,
	});
}

export function showLoginContextMenu({
	win,
	userInfo,
	socketClient,
	fs,
	config,
	doAuthentication,
}) {
	const menu = new Menu();
	const isLoggedIn = userInfo.hasOwnProperty("id");

	menu.append(
		new MenuItem({
			label: isLoggedIn ? "Sign Out" : "Sign In",
			click: () => {
				if (isLoggedIn) {
					socketClient.close();
					Object.keys(userInfo).forEach((key) => delete userInfo[key]);
					fs.unlink(config.tokensFilePath, (error) => {
						if (error && error.code !== "ENOENT") {
							console.log(error);
						}
					});
					win.webContents.send("user-logged-out", userInfo);
				} else {
					doAuthentication();
				}
			},
		})
	);

	menu.popup({
		window: win,
	});
}
