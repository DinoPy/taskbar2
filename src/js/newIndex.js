const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;
import { Task, formatCurrentDate, formatCountdownText, taskIndexUpdater } from './utility.js';
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
	tasks[data.id] = new Task({
		id: data.id,
		title: data.title,
		createdAt: data.created_at,
		category: data.category,
		description: data.description,
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		priority: data.priority?.Int32 || data.priority,
		due_at: data.due_at?.Time || data.due_at,
		show_before_due_time: data.show_before_due_time?.Int32 || data.show_before_due_time,
		noActiveTaskWarning: noActiveTaskParagraph,
		tags: data.tags,
		isActive: data.is_active
	});

	tasks[data.id].setTaskUp(true);
	tasks[data.id].addTaskListeners();
	
	// Apply visibility filter to task from relative
	const shouldShow = shouldShowTask(tasks[data.id]);
	if (!shouldShow) {
		tasks[data.id].hide();
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

		tasks[data.id].updateTitle(data.title);
		tasks[data.id].updateDescription(data.description);
		tasks[data.id].updateTags(data.tags);
		tasks[data.id].updateCategory(data.category);
		tasks[data.id].updatePriority(data.priority);
		tasks[data.id].updateDueAt(data.due_at);
		tasks[data.id].updateShowBeforeDueTime(data.show_before_due_time);
		
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


const handleTaskChangeSearch = () => {
	searchContainer.style.display = "flex";
	searchInput.focus()

	const searchInputListener = (e) => {
		if (e.key !== "Enter") return;

		searchInput.removeEventListener("keydown", searchInputListener);

		const index = parseInt(searchInput.value);
		if (isNaN(index)) {
			searchInput.blur();
			searchInput.value = "";
			searchContainer.style.display = "none"
		}

		const taskKeys = Object.keys(tasks);
		if (index > 0 && index <= taskKeys.length) {
			for (let k of taskKeys) {
				if (k === taskKeys[index - 1])
					continue;
				tasks[k].removeFocus();
			}
			tasks[taskKeys[index - 1]].addFocus();
		}

		searchInput.blur();
		searchInput.value = "";
		searchContainer.style.display = "none"
	}

	searchInput.addEventListener("keydown", searchInputListener);

}

ipc.on("task_switch_trigger", (e, data) => {
	handleTaskChangeSearch()
})
