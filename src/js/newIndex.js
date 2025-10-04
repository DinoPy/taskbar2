const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;
import { Task, formatCurrentDate, formatCountdownText, taskIndexUpdater, calculateUrgencyLevel, calculateCountdownText } from './utility.js';
import { parseString } from './helpers.js';

const closeBtn = document.getElementById('closeBtn');
const countdownText = document.getElementById('countdown');
const playPauseBtn = document.getElementById('playPauseIcon');
const skipPauseBtn = document.getElementById('skipPauseIcon');
const bodyEl = document.querySelector('body');
const noActiveTaskParagraph = document.querySelector('.noActiveTaskWarning');
const connectionStatusIcon = document.querySelector(".connection-status-icon");
const userLoginIcon = document.querySelector(".user-icon");
const userContainer = document.querySelector(".user");
const searchContainer = document.querySelector(".searchContainer");
const searchInput = document.querySelector(".searchInput");

export const tasks = {};
const completedTasks = [];
export let tasks_compl_or_del_while_nocon = []

export let isSocketConnected = false;
let isTimerRunning = true;
let lastCategorySelected = 'none';
let showAllTasks = false;

// ----------- LOGGING ----------------//
ipc.on("print-to-console", (e, data) => {
	console.log(JSON.stringify(data));
});

// ----------- CONN & AUTH ----------------//
ipc.on("user-logged-in", (e, data) => {
	userLoginIcon.classList.add("logged-in-color");
});

ipc.on("user-logged-out", (e, data) => {
	userLoginIcon.classList.remove("logged-in-color");
});

ipc.on("socket-connected", (e, data) => {
	console.log("socket connected");
	isSocketConnected = true;
	connectionStatusIcon.classList.add("logged-in-color");
});

ipc.on("socket-disconnected", (e, data) => {
	console.log("socket diconnected");
	isSocketConnected = false;
	connectionStatusIcon.classList.remove("logged-in-color");
});

// ------------- HELPERS ----------------//

ipc.on('data-from-main', (e, data) => {
	isTimerRunning = data.isTimerRunning;
});

ipc.on('toggle-countdown-timer', (e, data) => {
	isTimerRunning = data.isTimerRunning;
});


ipc.on('task-post-error', (e, data) => {
	console.log(data);
	console.log(e);
	alert(data);
});

// -------------- FROM SERVER ---- ----------------- //

// add last change property and only make change if the update is the most recent on the server.
function createTaskFromDataList(t) {
	const durationStringSplit = t.duration.split(":");
	const durationInt = (parseInt(durationStringSplit[0]) * 60 * 60 +
		parseInt(durationStringSplit[1]) * 60 +
		parseInt(durationStringSplit[2])) * 1000;
	tasks[t.id] = new Task({
		id: t.id,
		title: t.title,
		description: t.description,
		createdAt: t.created_at,
		duration: durationInt,
		category: t.category,
		tags: t.tags,
		isActive: t.is_active,
		toggledFocusAt: t.toggled_at.Int64,
		priority: t.priority.Int32,
		due_at: t.due_at.Time,
		show_before_due_time: t.show_before_due_time.Int32,
		last_modified_at: t.last_modified_at.Int64,
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
	});
	tasks[t.id].setTaskUp(true);
	tasks[t.id].addTaskListeners();
	
	// Apply visibility filter to task from server
	const shouldShow = shouldShowTask(tasks[t.id]);
	if (!shouldShow) {
		tasks[t.id].hide();
	}
}

ipc.on("resume-tasks", (e, data) => {
	// first delete all active tasks
	// then add the new ones
	// this won't do well for situations without connection.

	for (let t of data) {
		console.log(t)
		if (tasks.hasOwnProperty(t.id)) {
			console.log(`task: ${t} - ${t.title} exists`)
			if (tasks[t.id].last_modified_at > t.last_modified_at) {
				console.log(`task: ${t.id} - ${t.title} with time: ${t.last_modified_at} has more updated information locally`)
				continue;
			} else if (tasks[t.id].last_modified_at < t.last_modified_at) {
				console.log(`task: ${t.id} - ${t.title} with time: ${t.last_modified_at} is outdated`)
				tasks[t.id].removeFocus(true);
				tasks[t.id].destroySelfFromDOM();
				createTaskFromDataList(t);
			} else {
				console.log(`task: ${t.id} - ${t.title} with time: ${t.last_modified_at} is the same`)
				continue;
			}
		} else {
			console.log(`task: ${t.id} - ${t.title} does not exist`)
			if (!tasks_compl_or_del_while_nocon.includes(t.id))
				createTaskFromDataList(t);
		}
		taskIndexUpdater(tasks);
	}

	// Apply visibility filter to all tasks after resume
	updateTaskVisibility();
	tasks_compl_or_del_while_nocon = [];
})

ipc.on("refresh_tasks", (e, data) => {
	for (let t in tasks) {
		tasks[t].removeFocus(true);
		tasks[t].destroySelfFromDOM();
		delete tasks[t];
	}

	for (let t of data) {
		createTaskFromDataList(t);
	}

	// Apply visibility filter to all tasks after refresh
	updateTaskVisibility();
	taskIndexUpdater(tasks);
})

// -------------- FROM RELATED APP ----------------- //

ipc.on("new_task_from_relative", (e, data) => {
	console.log("Frontend: Received new task from relative:", data);
	
	// Calculate duration if provided
	const durationInt = data.duration ? 
		(parseInt(data.duration.split(":")[0]) * 60 * 60 +
		 parseInt(data.duration.split(":")[1]) * 60 +
		 parseInt(data.duration.split(":")[2])) * 1000 : 0;
	
	tasks[data.id] = new Task({
		id: data.id,
		title: data.title,
		createdAt: data.created_at,
		category: data.category,
		description: data.description,
		duration: durationInt,
		tags: data.tags,
		isActive: data.is_active,
		toggledFocusAt: data.toggled_at?.Int64 || data.toggled_at || 0,
		priority: data.priority?.Int32 || data.priority,
		due_at: data.due_at?.Time || data.due_at,
		show_before_due_time: data.show_before_due_time?.Int32 || data.show_before_due_time,
		last_modified_at: data.last_modified_at?.Int64 || data.last_modified_at || +new Date(),
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
	});

	tasks[data.id].setTaskUp(true);
	tasks[data.id].addTaskListeners();
	
	// Apply visibility filter to task from relative
	const shouldShow = shouldShowTask(tasks[data.id]);
	console.log("Should show duplicated task:", shouldShow);
	if (!shouldShow) {
		tasks[data.id].hide();
		console.log("Hiding duplicated task due to visibility filter");
	} else {
		console.log("Showing duplicated task");
	}
	
	taskIndexUpdater(tasks);
})


ipc.on("related_task_toggled", (e, data) => {
	if (data.is_active)
		tasks[data.id].addFocus(true);
	else
		tasks[data.id].removeFocus(true);
})

ipc.on("related_task_deleted", (e, data) => {
	tasks[data.id].removeFocus(true);
	tasks[data.id].destroySelfFromDOM();
	delete tasks[data.id];
	taskIndexUpdater(tasks)
})

ipc.on("related_task_edited", (e, data) => {
	tasks[data.id].updateTitle(data.title);
	tasks[data.id].updateDescription(data.description);
	tasks[data.id].updateCategory(data.category, true);
	tasks[data.id].updateTags(data.tags);
	
	// Update visibility after property changes
	const shouldShow = shouldShowTask(tasks[data.id]);
	if (shouldShow) {
		tasks[data.id].show();
	} else {
		tasks[data.id].hide();
	}
	
	taskIndexUpdater(tasks)
})

// ---------- CRUD HELPERS ----------- //

ipc.on('msg-redirected-to-parent', (e, data) => {
	if (tasks.hasOwnProperty(data.id)) {
		lastCategorySelected =
			data.category !== tasks[data.id].getCategory()
				? data.category
				: lastCategorySelected;

		// Update all properties without sending individual edit events
		tasks[data.id].updateTitle(data.title);
		tasks[data.id].updateDescription(data.description);
		tasks[data.id].updateTags(data.tags);
		tasks[data.id].updateCategory(data.category, true); // from_relative = true to prevent individual event
		tasks[data.id].updatePriority(data.priority, true); // from_relative = true to prevent individual event
		tasks[data.id].updateDueAt(data.due_at, true); // from_relative = true to prevent individual event
		tasks[data.id].updateShowBeforeDueTime(data.show_before_due_time, true); // from_relative = true to prevent individual event
		
		// Send a single edit event with all the updated data
		ipc.send("task_edit", {
			category: data.category,
			title: data.title,
			description: data.description,
			tags: data.tags,
			priority: data.priority,
			due_at: data.due_at,
			show_before_due_time: data.show_before_due_time,
			id: data.id,
			last_modified_at: +new Date(),
		});
		
		// Update visibility after property changes
		const shouldShow = shouldShowTask(tasks[data.id]);
		if (shouldShow) {
			tasks[data.id].show();
		} else {
			tasks[data.id].hide();
		}
	} else {
		ipc.send("task_edit", {
			category: data.category,
			title: data.title,
			description: data.description,
			tags: data.tags,
			priority: data.priority,
			due_at: data.due_at,
			show_before_due_time: data.show_before_due_time,
			id: data.id,
			last_modified_at: +new Date(),
		})
	}
});

ipc.on('deleteTask', (e, data) => {
	tasks[data.id].removeFocus(true);
	tasks[data.id].destroySelfFromDOM();
	ipc.send("task_delete", { id: tasks[data.id].id });
	delete tasks[data.id];
	taskIndexUpdater(tasks);

	if (!isSocketConnected)
		tasks_compl_or_del_while_nocon.push(data.id);
});

ipc.on('completeTask', (e, data) => {
	tasks[data.id].removeFocus(true);
	tasks[data.id].addToCompletedTaskList();
	tasks[data.id].destroySelfFromDOM();
	delete tasks[data.id];

	if (!isSocketConnected)
		tasks_compl_or_del_while_nocon.push(data.id);
	taskIndexUpdater(tasks);
});

ipc.on('update-task-category', (e, data) => {
	tasks[data.id].updateCategory(data.newCategory);
	lastCategorySelected = data.newCategory;
});

ipc.on('toggle-show-all-tasks', (e, data) => {
	showAllTasks = data.showAllTasks;
	updateTaskVisibility();
});

// Function to check if a task should be visible based on due date
function shouldShowTask(task) {
	console.log('shouldShowTask for task:', task.id, 'due_at:', task.due_at, 'showAllTasks:', showAllTasks);
	
	if (showAllTasks) return true;
	
	// If no due date is set or it's the default invalid date, always show the task
	if (!task.due_at || task.due_at === "0001-01-01T00:00:00Z" || task.due_at === "0001-01-01T00:00:00.000Z") {
		console.log('Task has no valid due date, showing');
		return true;
	}
	
	const currentTime = new Date();
	const dueDate = new Date(task.due_at);
	
	// Check if the date is valid
	if (isNaN(dueDate.getTime())) {
		console.log('Invalid due date, showing task');
		return true;
	}
	
	const showBeforeMinutes = task.show_before_due_time || 0;
	
	// Calculate the time when the task should start showing
	const showTime = new Date(dueDate.getTime() - (showBeforeMinutes * 60 * 1000));
	
	// Show task if current time is after the show time
	const shouldShow = currentTime >= showTime;
	console.log('Task due date check - currentTime:', currentTime, 'showTime:', showTime, 'shouldShow:', shouldShow);
	return shouldShow;
}

// Function to update task visibility based on the showAllTasks flag
function updateTaskVisibility() {
	for (let id in tasks) {
		const task = tasks[id];
		const shouldShow = shouldShowTask(task);
		
		if (shouldShow) {
			task.show();
		} else {
			task.hide();
		}
	}
}

// Timer to check task visibility every 30 seconds
setInterval(() => {
	if (!showAllTasks) {
		updateTaskVisibility();
	}
}, 30000); // 30 seconds

// Timer to update countdown indicators every minute
setInterval(() => {
	// Update urgency styling for all visible tasks to refresh countdown text
	for (let id in tasks) {
		const task = tasks[id];
		if (task.taskEl.style.display !== 'none') {
			task.updateUrgencyStyling();
		}
	}
}, 60000); // 60 seconds

// -------------- CMD HELPERS ---------------------- //

ipc.on("request-current-task-data-for-edit", () => {
	for (let id in tasks) {
		if (tasks[id].getIsFocusedStatus()) {
			ipc.send("toggle_current_task_edit", {
				id,
				title: tasks[id].title,
				description: tasks[id].description,
				category: tasks[id].category,
				tags: tasks[id].tags,
				priority: tasks[id].priority,
				due_at: tasks[id].due_at,
				show_before_due_time: tasks[id].show_before_due_time
			});
			break;
		}
	}
});

ipc.on("complete_current_task", () => {
	for (let t in tasks) {
		if (!tasks[t].isFocused)
			continue;

		tasks[t].removeFocus();
		tasks[t].addToCompletedTaskList();
		tasks[t].destroySelfFromDOM();
		delete tasks[t];

		taskIndexUpdater(tasks);

		if (!isSocketConnected)
			tasks_compl_or_del_while_nocon.push(data.id);
	}

})

// ------------------ END OF HELPERS ------------------- //

closeBtn.addEventListener('click', () => {
	ipc.send('close_app', completedTasks);
});


bodyEl.addEventListener('mousedown', (e) => {
	if (e.button === 2) ipc.send('show-general-context-menu');
});

userContainer.addEventListener('mousedown', (e) => {
	e.preventDefault();
	e.stopPropagation();
	if (e.button === 2) ipc.send("show-login-context-menu");
});

// ------------------- TIMER -------------------- //
const activeTime = 25 * 60;
const pauseTime = 5 * 60;

let barDetails = {
	barStatus: 'active',
	isCountingDown: false,
};

let countdown = activeTime;
let countdownInitialValue = countdown;
let intervalId;

// update the value countdown based on established default active time
countdownText.textContent = formatCountdownText(countdown);

// toggle play and pause
playPauseBtn.addEventListener('click', toggleCountdown);
skipPauseBtn.addEventListener('click', handleSkipBreak);

// ---------------- UTILITY FUNCTIONS ------------------- //

// starts the countdown

function startCountdown() {
	intervalId = setInterval(function() {
		if (isTimerRunning) countdown--; // main timer countdown value
		countdownText.textContent = formatCountdownText(countdown); //
		bodyEl.style.backgroundColor = '';
		if (countdown === 0) {
			clearInterval(intervalId);
			bodyEl.style.backgroundColor = '#c74242';

			if (countdownInitialValue === activeTime) {
				barDetails.barStatus = 'pause';
				countdown = pauseTime;
				countdownInitialValue = countdown;
				skipPauseBtn.style.display = 'inline';

				ipc.send("interval_end", 'Start pause.');
			} else {
				countdown = activeTime;
				barDetails.barStatus = 'active';
				countdownInitialValue = countdown;
				skipPauseBtn.style.display = 'none';

				ipc.send('interval_end', 'Start work.');
			}

			countdownText.textContent = formatCountdownText(countdown);
			playPauseIcon.src = 'images/play.svg';
			barDetails.isCountingDown = false;
		}
	}, 1000);
}

// starts and pauses the countdown

function toggleCountdown() {
	/// will be renamed to
	if (barDetails.isCountingDown === false) {
		// start main countdown
		startCountdown();

		barDetails.isCountingDown = true;
		playPauseBtn.src = 'images/pause.svg';
		bodyEl.style.backgroundColor = '';

		if (barDetails.barStatus === 'pause') return;
		// start the time of each focused task
	} else {
		// stop the main timer
		clearInterval(intervalId);

		barDetails.isCountingDown = false;
		playPauseBtn.src = 'images/play.svg';
		bodyEl.style.backgroundColor = '#c74242';
	}

	if (barDetails.barStatus === 'pause') {
		skipPauseBtn.style.display = 'inline';
	}
}

function handleSkipBreak() {
	// clear both intervals not to have duplicates
	clearInterval(intervalId);

	// update the countdown value to active time value (25 min)
	countdown = activeTime;

	// change bar status to active and is counting to true
	barDetails.barStatus = 'active';
	barDetails.isCountingDown = true;

	// update the initial value of countdown so we have a reference when the pause starts
	countdownInitialValue = countdown;

	// hide the skip pause btn
	skipPauseBtn.style.display = 'none';
	playPauseBtn.src = 'images/pause.svg';

	// update the countdown text and the body background
	countdownText.textContent = formatCountdownText(countdown); //
	bodyEl.style.backgroundColor = '';

	// start both task and main timers
	startCountdown();
}

// ----------------- ADD TASKS ----------------------- //

const addTaskContainer = document.getElementById('addTaskContainer');
const addTaskBtn = document.getElementById('addTaskBtn');

let isAddingTask = false;
let addTaskInput;

addTaskBtn.addEventListener('click', handleAddTask);

function handleAddTask() {
	if (isAddingTask === false) {
		addTaskBtn.src = 'images/done.svg';
		isAddingTask = true;
		addTaskInput = document.createElement('input');
		addTaskInput.classList.add('addTaskInput');
		addTaskInput.placeholder = 'Task ..';
		addTaskInput.addEventListener('keyup', (e) => {
			if (e.key === 'Enter') {
				handleAddTask();
			}
		});
		addTaskContainer.prepend(addTaskInput);
		addTaskInput.focus();
	} else {
		const taskTitle = addTaskInput.value;

		if (taskTitle.length > 0) {
			addTask(taskTitle);
		}
		addTaskContainer.removeChild(addTaskInput);
		addTaskBtn.src = 'images/add.svg';
		isAddingTask = false;
	}
}

// --------------- RENDER TASKS ------------------ //
const taskContainer = document.querySelector('.taskContainer');

function addTask(title) {
	const newId = crypto.randomUUID()
	tasks[newId] = new Task({
		id: newId,
		title: parseString(title),
		createdAt: new Date().toISOString(),
		category: lastCategorySelected,
		priority: null,
		due_at: null,
		show_before_due_time: null,
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
	});

	tasks[newId].setTaskUp();
	tasks[newId].addTaskListeners();
	
	// Apply visibility filter to new task
	const shouldShow = shouldShowTask(tasks[newId]);
	if (!shouldShow) {
		tasks[newId].hide();
	}
	
	return newId
}

ipc.on('addTask', () => handleAddTask());

ipc.on('addEmergencyTask', () => {
	Object.keys(tasks).forEach(t => tasks[t].removeFocus());
	const newId = addTask('To be replaced');
	tasks[newId].addFocus();
});

window.tasks = tasks;

// ------------ NO ACTIVE TASK WARNING ---------------//

setInterval(() => {
	const taskList = Object.keys(tasks);
	const activeTasks = taskList.filter((i) => tasks[i].getIsFocusedStatus());
	if (
		activeTasks.length === 0 &&
		barDetails.barStatus === 'active' &&
		barDetails.isCountingDown
	) {
		let timeout;
		clearTimeout(timeout);
		bodyEl.classList.add('noActiveTaskBodyWarning');
		noActiveTaskParagraph.classList.remove('invisible');
		timeout = setTimeout(() => {
			bodyEl.classList.remove('noActiveTaskBodyWarning');
		}, 1000);
	}
}, 2500);


// Command parsing system
const parseCommand = (input) => {
	const trimmed = input.trim().toLowerCase();
	
	// Switch command: s1, s2, etc.
	if (trimmed.match(/^s(\d+)$/)) {
		const match = trimmed.match(/^s(\d+)$/);
		return { type: 'switch', index: parseInt(match[1]) };
	}
	
	// Edit command: e1, e2, etc.
	if (trimmed.match(/^e(\d+)$/)) {
		const match = trimmed.match(/^e(\d+)$/);
		return { type: 'edit', index: parseInt(match[1]) };
	}
	
	// Duplicate command: d1, d2, dd1, dd2, etc. (single or double d)
	if (trimmed.match(/^d{1,2}\d+$/)) {
		const match = trimmed.match(/^d{1,2}(\d+)$/);
		return { type: 'duplicate', index: parseInt(match[1]) };
	}
	
	// Delete command: ddd1, ddd2, etc. (triple d or more for confirmation)
	if (trimmed.match(/^d{3,}(\d+)$/)) {
		const match = trimmed.match(/^d{3,}(\d+)$/);
		return { type: 'delete', index: parseInt(match[1]), confirmation: match[0].match(/d/g).length };
	}
	
	// Complete command: c1, c2, etc.
	if (trimmed.match(/^c(\d+)$/)) {
		const match = trimmed.match(/^c(\d+)$/);
		return { type: 'complete', index: parseInt(match[1]) };
	}
	
	// Show all tasks toggle: sat
	if (trimmed === 'sat') {
		return { type: 'show_all_tasks' };
	}
	
	// Edit current task: ec
	if (trimmed === 'ec') {
		return { type: 'edit_current' };
	}
	
	// Always on top toggle: aot
	if (trimmed === 'aot') {
		return { type: 'always_on_top' };
	}
	
	// Screen switch commands: sw0d, sw0u, sw1d, sw1u, etc.
	if (trimmed.match(/^sw(\d+)([du])$/)) {
		const match = trimmed.match(/^sw(\d+)([du])$/);
		return { 
			type: 'screen_switch', 
			screenIndex: parseInt(match[1]), 
			direction: match[2] === 'd' ? 'down' : 'up' 
		};
	}
	
	// Fallback to old numeric input for backward compatibility
	const numericIndex = parseInt(trimmed);
	if (!isNaN(numericIndex)) {
		return { type: 'switch', index: numericIndex };
	}
	
	return { type: 'invalid', input: trimmed };
};

const executeCommand = (command) => {
	const taskKeys = Object.keys(tasks);
	
	switch (command.type) {
		case 'switch':
			if (command.index > 0 && command.index <= taskKeys.length) {
				// Remove focus from all tasks
				for (let k of taskKeys) {
					if (k === taskKeys[command.index - 1]) continue;
					tasks[k].removeFocus();
				}
				// Focus the selected task
				tasks[taskKeys[command.index - 1]].addFocus();
				return { success: true, message: `Switched to task ${command.index}` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'edit':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				// Send the task data for editing
				const taskData = tasks[taskId];
				if (taskData) {
					ipc.send("toggle_given_task_edit", taskData.formatTask('Object'));
					return { success: true, message: `Editing task ${command.index}` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'duplicate':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				const taskData = tasks[taskId];
				if (taskData) {
					console.log(`Command: Duplicating task ${command.index} (ID: ${taskId})`);
					console.log('Task data:', taskData.formatTask('Object'));
					ipc.send("duplicate-task", { id: taskId });
					return { success: true, message: `Duplicating task ${command.index}` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'delete':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				const taskData = tasks[taskId];
				if (taskData) {
					console.log(`Command: Deleting task ${command.index} (ID: ${taskId})`);
					ipc.send("delete-task", { id: taskId });
					return { success: true, message: `Deleting task ${command.index} (${command.confirmation} confirmations)` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'complete':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				const taskData = tasks[taskId];
				if (taskData) {
					console.log(`Command: Completing task ${command.index} (ID: ${taskId})`);
					// Send the task data for completion using the correct IPC event
					ipc.send("complete-task", { id: taskId });
					return { success: true, message: `Completing task ${command.index}` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'show_all_tasks':
			ipc.send("toggle-show-all-tasks");
			return { success: true, message: "Toggled show all tasks" };
			
		case 'edit_current':
			// Find the currently focused task
			const focusedTaskId = Object.keys(tasks).find(id => tasks[id].isFocused);
			if (focusedTaskId) {
				const taskData = tasks[focusedTaskId];
				console.log(`Command: Editing current task (ID: ${focusedTaskId})`);
				ipc.send("toggle_given_task_edit", taskData.formatTask('Object'));
				return { success: true, message: "Editing current task" };
			}
			return { success: false, message: "No task is currently focused" };
			
		case 'always_on_top':
			console.log("Command: Toggling always on top");
			ipc.send("toggle-always-on-top");
			return { success: true, message: "Toggled always on top" };
			
		case 'screen_switch':
			ipc.send("switch-screen", { 
				screenIndex: command.screenIndex, 
				direction: command.direction 
			});
			return { success: true, message: `Switching to screen ${command.screenIndex} ${command.direction}` };
			
		case 'invalid':
			return { success: false, message: `Invalid command: ${command.input}` };
			
		default:
			return { success: false, message: "Unknown command" };
	}
};

// Command help system
const getCommandSuggestions = (input) => {
	const trimmed = input.trim().toLowerCase();
	const suggestions = [];
	
	if (trimmed.length === 0) {
		// Show all available commands when input is empty
		return [
			{ command: 's1', description: 'switch to task 1' },
			{ command: 'e2', description: 'edit task 2' },
			{ command: 'c3', description: 'complete task 3' },
			{ command: 'd4', description: 'duplicate task 4' },
			{ command: 'ddd5', description: 'delete task 5' },
			{ command: 'ec', description: 'edit current task' },
			{ command: 'sat', description: 'show all tasks' },
			{ command: 'sw0d', description: 'screen 0 down' },
			{ command: 'sw0u', description: 'screen 0 up' }
		];
	}
	
	// Filter commands that start with the input
	const allCommands = [
		{ command: 's', description: 'switch to task', pattern: /^s(\d+)$/ },
		{ command: 'e', description: 'edit task', pattern: /^e(\d+)$/ },
		{ command: 'c', description: 'complete task', pattern: /^c(\d+)$/ },
		{ command: 'd', description: 'duplicate task', pattern: /^d(\d+)$/ },
		{ command: 'ddd', description: 'delete task', pattern: /^d{2,}(\d+)$/ },
		{ command: 'sat', description: 'show all tasks', pattern: /^sat$/ },
		{ command: 'ec', description: 'edit current task', pattern: /^ec$/ },
		{ command: 'aot', description: 'toggle always on top', pattern: /^aot$/ },
		{ command: 'sw', description: 'switch screen', pattern: /^sw(\d+)([du])$/ }
	];
	
	// Handle all command types with consistent logic
	if (trimmed.startsWith('sw')) {
		suggestions.push({ command: 'sw_n_d/u', description: 'switch to screen n down/up' });
	} else if (trimmed.startsWith('s')) {
		if (trimmed.match(/^s\d+$/)) {
			const match = trimmed.match(/^s(\d+)$/);
			suggestions.push({ command: trimmed, description: `switch to task ${match[1]}` });
		} else {
			suggestions.push({ command: 's1, s2, s3...', description: 'switch to task' });
		}
	} else if (trimmed.startsWith('e')) {
		if (trimmed.match(/^e\d+$/)) {
			const match = trimmed.match(/^e(\d+)$/);
			suggestions.push({ command: trimmed, description: `edit task ${match[1]}` });
		} else {
			suggestions.push({ command: 'e1, e2, e3...', description: 'edit task' });
		}
	} else if (trimmed.startsWith('c')) {
		if (trimmed.match(/^c\d+$/)) {
			const match = trimmed.match(/^c(\d+)$/);
			suggestions.push({ command: trimmed, description: `complete task ${match[1]}` });
		} else {
			suggestions.push({ command: 'c1, c2, c3...', description: 'complete task' });
		}
	} else if (trimmed.startsWith('ddd')) {
		if (trimmed.match(/^ddd\d+$/)) {
			const match = trimmed.match(/^ddd(\d+)$/);
			suggestions.push({ command: trimmed, description: `delete task ${match[1]}` });
		} else {
			suggestions.push({ command: 'ddd1, ddd2, ddd3...', description: 'delete task' });
		}
	} else if (trimmed.startsWith('dd')) {
		if (trimmed.match(/^dd\d+$/)) {
			const match = trimmed.match(/^dd(\d+)$/);
			suggestions.push({ command: trimmed, description: `duplicate task ${match[1]}` });
		} else {
			suggestions.push({ command: 'dd1, dd2, dd3...', description: 'duplicate task' });
		}
	} else if (trimmed.startsWith('d')) {
		if (trimmed.match(/^d\d+$/)) {
			const match = trimmed.match(/^d(\d+)$/);
			suggestions.push({ command: trimmed, description: `duplicate task ${match[1]}` });
		} else {
			suggestions.push({ command: 'd1, d2, d3...', description: 'duplicate task' });
		}
	} else if (trimmed === 'sat') {
		suggestions.push({ command: 'sat', description: 'show all tasks' });
	} else if (trimmed === 'ec') {
		suggestions.push({ command: 'ec', description: 'edit current task' });
	} else if (trimmed === 'aot') {
		suggestions.push({ command: 'aot', description: 'toggle always on top' });
	} else {
		// Find matching commands for other cases
		for (const cmd of allCommands) {
			if (cmd.command.startsWith(trimmed)) {
				if (cmd.pattern.test(trimmed)) {
					// Exact match - show specific description
					if (trimmed.match(/^s(\d+)$/)) {
						const match = trimmed.match(/^s(\d+)$/);
						suggestions.push({ command: trimmed, description: `switch to task ${match[1]}` });
					} else if (trimmed.match(/^e(\d+)$/)) {
						const match = trimmed.match(/^e(\d+)$/);
						suggestions.push({ command: trimmed, description: `edit task ${match[1]}` });
					} else if (trimmed.match(/^c(\d+)$/)) {
						const match = trimmed.match(/^c(\d+)$/);
						suggestions.push({ command: trimmed, description: `complete task ${match[1]}` });
					} else if (trimmed.match(/^d(\d+)$/)) {
						const match = trimmed.match(/^d(\d+)$/);
						suggestions.push({ command: trimmed, description: `duplicate task ${match[1]}` });
					} else if (trimmed.match(/^d{2,}(\d+)$/)) {
						const match = trimmed.match(/^d{2,}(\d+)$/);
						suggestions.push({ command: trimmed, description: `delete task ${match[1]}` });
					} else if (trimmed === 'sat') {
						suggestions.push({ command: trimmed, description: 'show all tasks' });
					} else if (trimmed === 'ec') {
						suggestions.push({ command: trimmed, description: 'edit current task' });
					} else if (trimmed === 'aot') {
						suggestions.push({ command: trimmed, description: 'toggle always on top' });
					}
				} else {
					// Partial match - collect command names only
					if (cmd.command === 's') {
						suggestions.push({ command: 's1, s2, s3...', description: 'switch to task' });
					} else if (cmd.command === 'e') {
						suggestions.push({ command: 'e1, e2, e3...', description: 'edit task' });
					} else if (cmd.command === 'c') {
						suggestions.push({ command: 'c1, c2, c3...', description: 'complete task' });
					} else if (cmd.command === 'd') {
						suggestions.push({ command: 'd1, d2, d3...', description: 'duplicate task' });
					} else if (cmd.command === 'ddd') {
						suggestions.push({ command: 'ddd1, ddd2, ddd3...', description: 'delete task' });
					} else if (cmd.command === 'sat') {
						suggestions.push({ command: 'sat', description: 'show all tasks' });
					} else if (cmd.command === 'ec') {
						suggestions.push({ command: 'ec', description: 'edit current task' });
					} else if (cmd.command === 'aot') {
						suggestions.push({ command: 'aot', description: 'toggle always on top' });
					} else if (cmd.command === 'sw') {
						suggestions.push({ command: 'sw_n_d/u', description: 'switch to screen n down/up' });
					}
				}
			}
		}
	}
	
	// If no matches found, check if it's invalid
	if (suggestions.length === 0) {
		suggestions.push({ command: trimmed, description: 'invalid command' });
	}
	
	return suggestions;
};

const updateCommandHelp = (input) => {
	const commandHelp = document.querySelector('.commandHelp');
	if (!commandHelp) return;
	
	const suggestions = getCommandSuggestions(input);
	
	// Clear existing content
	commandHelp.innerHTML = '';
	
	// Add suggestions
	suggestions.forEach(suggestion => {
		const helpItem = document.createElement('div');
		helpItem.classList.add('helpItem');
		
		if (suggestion.description === 'invalid command') {
			helpItem.style.color = '#f44336';
			helpItem.style.fontWeight = 'bold';
		}
		
		helpItem.textContent = `${suggestion.command} - ${suggestion.description}`;
		commandHelp.appendChild(helpItem);
	});
	
	// Show help box
	commandHelp.style.display = 'block';
};

const handleTaskChangeSearch = () => {
	searchContainer.style.display = "flex";
	searchInput.focus();
	searchInput.placeholder = "s1, e2, c3, d4, ddd5, ec, sat, sw0d...";

	const commandHelp = document.querySelector('.commandHelp');
	
	// Show initial help
	updateCommandHelp('');
	
	const searchInputListener = (e) => {
		if (e.key !== "Enter") return;

		searchInput.removeEventListener("keydown", searchInputListener);
		searchInput.removeEventListener("input", inputListener);

		const command = parseCommand(searchInput.value);
		const result = executeCommand(command);
		
		// Show feedback (you can enhance this with better UI feedback)
		console.log(result.message);
		
		// Show temporary feedback
		if (result.success) {
			searchInput.style.backgroundColor = '#4CAF50';
			searchInput.style.color = 'white';
		} else {
			searchInput.style.backgroundColor = '#f44336';
			searchInput.style.color = 'white';
		}
		
		// Clear and hide after a short delay
		setTimeout(() => {
			searchInput.blur();
			searchInput.value = "";
			searchInput.placeholder = "s1, e2, c3, d4, ddd5, ec, sat, sw0d...";
			searchInput.style.backgroundColor = '';
			searchInput.style.color = '';
			searchContainer.style.display = "none";
		}, 300);
	}
	
	const inputListener = (e) => {
		// Update help based on current input
		updateCommandHelp(e.target.value);
	}

	searchInput.addEventListener("keydown", searchInputListener);
	searchInput.addEventListener("input", inputListener);
}

ipc.on("task_switch_trigger", (e, data) => {
	handleTaskChangeSearch()
})
