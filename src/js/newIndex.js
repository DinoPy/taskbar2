import { Task, formatCurrentDate, formatCountdownText, taskIndexUpdater, calculateUrgencyLevel, calculateCountdownText } from './utility.js';
import { parseString } from './helpers.js';
const { ipcRenderer } = window.require('electron');
const ipc = ipcRenderer;

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
const notificationsBtn = document.getElementById('notificationsBtn');
const notificationsBadge = document.getElementById('notificationsBadge');
let notificationAudioContext = null;

export const tasks = {};
const completedTasks = [];
export let tasks_compl_or_del_while_nocon = []

export let isSocketConnected = false;
let isTimerRunning = true;
let lastCategorySelected = 'none';
let showAllTasks = false;
let selectedCategories = []; // Empty means show all categories
let visualTaskOrder = []; // Stores task IDs in their visual display order

const requestTaskCompletionForInstance = (taskInstance) => {
	if (!taskInstance) return false;
	ipc.send("request-task-completion", {
		task: taskInstance.formatTask("Object", false),
	});
	return true;
};

function updateNotificationsBadge(count) {
	if (!notificationsBadge || !notificationsBtn) return;
	const total = Number.isFinite(count) ? count : parseInt(count, 10) || 0;
	if (total > 0) {
		const capped = total > 99 ? '99+' : String(total);
		notificationsBadge.textContent = capped;
		notificationsBadge.classList.remove('hidden');
		notificationsBtn.classList.add('has-unread');
	} else {
		notificationsBadge.classList.add('hidden');
		notificationsBtn.classList.remove('has-unread');
	}
}

updateNotificationsBadge(0);

async function ensureNotificationAudioContext() {
	if (notificationAudioContext) {
		try {
			await notificationAudioContext.resume();
		} catch (error) {
			console.warn('Failed to resume notification audio context', error);
		}
		return notificationAudioContext;
	}

	const AudioCtx = window.AudioContext || window.webkitAudioContext;
	if (!AudioCtx) return null;

	notificationAudioContext = new AudioCtx();
	return notificationAudioContext;
}

async function playNotificationSound() {
	const ctx = await ensureNotificationAudioContext();
	if (!ctx) return;

	const now = ctx.currentTime;
	const oscillator = ctx.createOscillator();
	const gain = ctx.createGain();

	oscillator.type = 'triangle';
	oscillator.frequency.setValueAtTime(880, now);
	oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.25);

	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

	oscillator.connect(gain);
	gain.connect(notificationAudioContext.destination);
	oscillator.start(now);
	oscillator.stop(now + 0.45);
}

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

ipc.on('notifications-update', (e, data) => {
	updateNotificationsBadge(data?.unreadCount ?? 0);
});

ipc.on('notification-received', () => {
	playNotificationSound().catch((error) => console.warn('Notification sound error', error));
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
		due_at: t.due_at.Time && t.due_at.Time !== "0001-01-01T00:00:00Z" ? t.due_at.Time : null,
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
	renderTasksByCategory();
	tasks_compl_or_del_while_nocon = [];

	// Fetch list status for all tasks
	const taskIds = Object.keys(tasks);
	if (taskIds.length > 0) {
		ipc.send("fetch-all-task-list-status", taskIds);
	}
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
	renderTasksByCategory();

	// Fetch list status for all tasks
	const taskIds = Object.keys(tasks);
	if (taskIds.length > 0) {
		ipc.send("fetch-all-task-list-status", taskIds);
	}
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
	
	renderTasksByCategory();

	// Fetch list status for the new task
	if (data.id) {
		ipc.send("fetch-all-task-list-status", [data.id]);
	}
})


ipc.on("related_task_toggled", (e, data) => {
	console.log("Related task toggled", data);
	if (data.is_active) {
		// Update toggledFocusAt with the timestamp from the mobile app if valid
		if (data.toggled_at && data.toggled_at.Valid) {
			tasks[data.id].toggledFocusAt = data.toggled_at.Int64;
		}
		tasks[data.id].addFocus(true);
	} else {
		tasks[data.id].removeFocus(true);
	}
})

ipc.on("related_task_deleted", (e, data) => {
	tasks[data.id].removeFocus(true);
	tasks[data.id].destroySelfFromDOM();
	delete tasks[data.id];
	taskIndexUpdater(tasks)
})

ipc.on("related_task_edited", (e, data) => {
	if (!tasks.hasOwnProperty(data.id)) {
		return; // Task doesn't exist, skip
	}
	
	tasks[data.id].updateTitle(data.title);
	tasks[data.id].updateDescription(data.description);
	tasks[data.id].updateCategory(data.category, true);
	tasks[data.id].updateTags(data.tags);
	
	// Extract and update priority if valid
	if (data.priority !== undefined) {
		const priority = data.priority?.Int32 !== undefined && data.priority?.Valid 
			? data.priority.Int32 
			: (typeof data.priority === 'number' ? data.priority : null);
		tasks[data.id].updatePriority(priority, true);
	}
	
	// Extract and update due_at if valid
	if (data.due_at !== undefined) {
		const dueAt = data.due_at?.Time && data.due_at?.Valid && data.due_at.Time !== "0001-01-01T00:00:00Z"
			? data.due_at.Time
			: (typeof data.due_at === 'string' ? data.due_at : null);
		tasks[data.id].updateDueAt(dueAt, true);
	}
	
	// Extract and update show_before_due_time - match pattern from createTaskFromDataList and new_task_from_relative
	if (data.show_before_due_time !== undefined) {
		const showBefore = data.show_before_due_time?.Int32 !== undefined
			? data.show_before_due_time.Int32
			: (typeof data.show_before_due_time === 'number' ? data.show_before_due_time : 0);
		tasks[data.id].updateShowBeforeDueTime(showBefore, true);
	}
	
	// Update visibility after property changes
	renderTasksByCategory();
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
		renderTasksByCategory();
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
	renderTasksByCategory();

	if (!isSocketConnected)
		tasks_compl_or_del_while_nocon.push(data.id);
});

ipc.on('completeTask', (e, data) => {
	tasks[data.id].removeFocus(true);
	// Update tags if provided (from completion confirmation dialog)
	if (data.tags) {
		tasks[data.id].tags = data.tags;
	}
	tasks[data.id].addToCompletedTaskList();
	tasks[data.id].destroySelfFromDOM();
	delete tasks[data.id];

	if (!isSocketConnected)
		tasks_compl_or_del_while_nocon.push(data.id);
	renderTasksByCategory();
});

ipc.on('task-list-status', (e, data) => {
	if (data?.taskId && tasks[data.taskId]) {
		tasks[data.taskId].updateListStatus(data);
	}
});

ipc.on('socket-connection-error', (e, data) => {
	if (data?.type === 'task_blocked_by_list') {
		// Task completion was rejected by the server because required list items
		// are still incomplete. The task was optimistically removed — request a
		// full refresh to restore it.
		ipc.send("request_hard_refresh");
	}
});

ipc.on('update-task-category', (e, data) => {
	tasks[data.id].updateCategory(data.newCategory);
	lastCategorySelected = data.newCategory;
	renderTasksByCategory();
});

ipc.on('toggle-show-all-tasks', (e, data) => {
	showAllTasks = data.showAllTasks;
	updateTaskVisibility();
});

ipc.on('update-category-filter', (e, data) => {
	selectedCategories = data.selectedCategories || [];
	renderTasksByCategory();
});

// Function to check if a task should be visible based on due date
function shouldShowTask(task) {
	if (showAllTasks) return true;
	
	// If no due date is set or it's the default invalid date, always show the task
	if (!task.due_at || task.due_at === "0001-01-01T00:00:00Z" || task.due_at === "0001-01-01T00:00:00.000Z") {
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
	return shouldShow;
}

// Function to render tasks grouped by category
export function renderTasksByCategory() {
	const taskContainer = document.querySelector('.taskContainer');
	taskContainer.innerHTML = ''; // Clear existing tasks
	
	// Determine which categories to show
	const categoriesToShow = selectedCategories.length === 0 
		? [...new Set(Object.values(tasks).map(t => t.category))] 
		: selectedCategories;
	
	// Sort categories alphabetically
	categoriesToShow.sort();
	
	categoriesToShow.forEach((category, categoryIndex) => {
		// Get tasks for this category
		const categoryTasks = Object.values(tasks).filter(
			task => task.category === category && shouldShowTask(task)
		);
		
		// Only proceed if there are visible tasks in this category
		if (categoryTasks.length === 0) return;
		
		// Add category label before tasks (only if we have tasks to show)
		const categoryLabel = document.createElement('div');
		categoryLabel.className = 'category-separator';
		categoryLabel.textContent = category;
		taskContainer.appendChild(categoryLabel);
		
		// Sort tasks by due date urgency (closest due date first)
		categoryTasks.sort((a, b) => {
			// Tasks without due dates go last
			const aDue = a.due_at && a.due_at !== "0001-01-01T00:00:00Z" 
				? new Date(a.due_at).getTime() 
				: Infinity;
			const bDue = b.due_at && b.due_at !== "0001-01-01T00:00:00Z"
				? new Date(b.due_at).getTime()
				: Infinity;
			return aDue - bDue;
		});
		
		// Create category group wrapper
		const groupWrapper = document.createElement('div');
		groupWrapper.className = 'category-group';
		groupWrapper.dataset.category = category;
		
		// Add tasks to the group
		categoryTasks.forEach(task => {
			task.show(); // Explicitly show the task
			groupWrapper.appendChild(task.taskEl);
		});
		
		taskContainer.appendChild(groupWrapper);
	});
	
	// Track the visual order of tasks for command execution
	visualTaskOrder = [];
	const allVisibleTasks = Array.from(taskContainer.querySelectorAll('.task'));
	allVisibleTasks.forEach(taskEl => {
		visualTaskOrder.push(taskEl.id);
	});

	// Update task indices
	taskIndexUpdater(tasks, visualTaskOrder);
}

// Function to update task visibility based on the showAllTasks flag
function updateTaskVisibility() {
	renderTasksByCategory();
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
		if (!tasks[t].isFocused) continue;
		requestTaskCompletionForInstance(tasks[t]);
		break;
	}
});

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

notificationsBtn?.addEventListener('click', () => {
	ipc.send('notifications-toggle');
	ensureNotificationAudioContext();
});

notificationsBtn?.addEventListener('keydown', (event) => {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		ipc.send('notifications-toggle');
		ensureNotificationAudioContext();
	}
});

document.addEventListener('pointerdown', () => {
	ensureNotificationAudioContext();
}, { once: true });

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
	renderTasksByCategory();
	
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

let noActiveTaskWarningTimeout = null;

const hideNoActiveTaskWarning = () => {
	clearTimeout(noActiveTaskWarningTimeout);
	bodyEl.classList.remove('noActiveTaskBodyWarning');
	noActiveTaskParagraph.classList.add('invisible');
};

const triggerNoActiveTaskWarning = () => {
	clearTimeout(noActiveTaskWarningTimeout);
	bodyEl.classList.add('noActiveTaskBodyWarning');
	noActiveTaskParagraph.classList.remove('invisible');
	noActiveTaskWarningTimeout = setTimeout(() => {
		bodyEl.classList.remove('noActiveTaskBodyWarning');
	}, 1000);
};

setInterval(() => {
	const taskList = Object.keys(tasks);
	const hasActiveTask = taskList.some((taskId) => tasks[taskId].getIsFocusedStatus());
	const hasAnyTask = taskList.length > 0;

	if (!hasAnyTask || hasActiveTask) {
		hideNoActiveTaskWarning();
		return;
	}

	triggerNoActiveTaskWarning();
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
	
	// Add due command: ad1, ad2, etc.
	if (trimmed.match(/^ad(\d+)$/)) {
		const match = trimmed.match(/^ad(\d+)$/);
		return { type: 'add_due', index: parseInt(match[1]) };
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

	// Calendar command
	if (trimmed === 'calendar') {
		return { type: 'open_calendar' };
	}

	if (trimmed === 'notif') {
		return { type: 'toggle_notifications' };
	}

	if (trimmed === 'remind') {
		return { type: 'open_reminder' };
	}

	// Templates command
	if (trimmed === 'templates') {
		return { type: 'open_templates' };
	}

	// List current task: llc
	if (trimmed === 'llc') {
		return { type: 'list_current' };
	}

	// List for task N: ll1, ll2, etc.
	if (trimmed.match(/^ll(\d+)$/)) {
		const match = trimmed.match(/^ll(\d+)$/);
		return { type: 'list', index: parseInt(match[1]) };
	}

	// Standalone lists home: lists
	if (trimmed === 'lists') {
		return { type: 'open_lists_home' };
	}

	// Split task: sp1, sp2, etc.
	if (trimmed.match(/^sp(\d+)$/)) {
		const match = trimmed.match(/^sp(\d+)$/);
		return { type: 'split', index: parseInt(match[1]) };
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
	const taskKeys = visualTaskOrder.length > 0 ? visualTaskOrder : Object.keys(tasks);
	
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
					ipc.send("request-task-delete", {
						tasks: [{
							id: taskId,
							title: taskData.title,
						}],
					});
					return { success: true, message: `Confirm deletion for task ${command.index}` };
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
					requestTaskCompletionForInstance(taskData);
					return { success: true, message: `Completing task ${command.index}` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'add_due':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				const taskData = tasks[taskId];
				if (taskData) {
					console.log(`Command: Adding due date to task ${command.index} (ID: ${taskId})`);
					ipc.send("open-add-due-window", taskData.formatTask('Object'));
					return { success: true, message: `Adding due date to task ${command.index}` };
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

		case 'toggle_notifications':
			ipc.send('notifications-toggle');
			return { success: true, message: 'Toggled notifications window' };
			
		case 'split':
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				const taskData = tasks[taskId];
				if (taskData) {
					console.log(`Command: Splitting task ${command.index} (ID: ${taskId})`);
					ipc.send("open-task-split", { id: taskId, taskData: taskData.formatTask('Object') });
					return { success: true, message: `Opening split window for task ${command.index}` };
				}
				return { success: false, message: `Task ${command.index} not found` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
			
		case 'screen_switch':
			ipc.send("switch-screen", { 
				screenIndex: command.screenIndex, 
				direction: command.direction 
			});
			return { success: true, message: `Switching to screen ${command.screenIndex} ${command.direction}` };

		case 'open_reminder':
			ipc.send('open-reminder-window');
			return { success: true, message: "Opening reminder window" };

		case 'open_calendar':
			ipc.send('open-calendar-window');
			return { success: true, message: "Opening calendar window" };

		case 'list_current': {
			const fid = Object.keys(tasks).find(id => tasks[id].isFocused);
			if (fid) {
				ipc.send("open-list-window", { target: { kind: "task", id: fid } });
				return { success: true, message: "Opening list for current task" };
			}
			return { success: false, message: "No task is currently focused" };
		}

		case 'list': {
			if (command.index > 0 && command.index <= taskKeys.length) {
				const taskId = taskKeys[command.index - 1];
				ipc.send("open-list-window", { target: { kind: "task", id: taskId } });
				return { success: true, message: `Opening list for task ${command.index}` };
			}
			return { success: false, message: `Invalid task index: ${command.index}` };
		}

		case 'open_lists_home':
			ipc.send("open-list-window", { target: { kind: "standalone_home" } });
			return { success: true, message: "Opening standalone lists" };

		case 'open_templates':
			ipc.send('open-template-window');
			return { success: true, message: "Opening templates window" };

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
		{ command: 'ad1', description: 'add due date to task 1' },
		{ command: 'ec', description: 'edit current task' },
		{ command: 'sat', description: 'show all tasks' },
		{ command: 'notif', description: 'toggle notifications window' },
		{ command: 'remind', description: 'create reminder/task' },
		{ command: 'sw0d', description: 'screen 0 down' },
		{ command: 'sw0u', description: 'screen 0 up' },
		{ command: 'calendar', description: 'open calendar window' },
		{ command: 'llc', description: 'open list for current task' },
		{ command: 'll1', description: 'open list for task 1' },
		{ command: 'lists', description: 'open standalone lists' },
		{ command: 'templates', description: 'open task templates' }
	];
	}

	if ('notif'.startsWith(trimmed)) {
		suggestions.push({ command: 'notif', description: 'toggle notifications window' });
	}
	if ('calendar'.startsWith(trimmed)) {
		suggestions.push({ command: 'calendar', description: 'open calendar window' });
	}
	if ('llc'.startsWith(trimmed) && trimmed.startsWith('l')) {
		suggestions.push({ command: 'llc', description: 'open list for current task' });
	}
	if ('lists'.startsWith(trimmed) && trimmed.startsWith('li') && !trimmed.startsWith('ll')) {
		suggestions.push({ command: 'lists', description: 'open standalone lists' });
	}
	if ('templates'.startsWith(trimmed) && trimmed.startsWith('te')) {
		suggestions.push({ command: 'templates', description: 'open task templates' });
	}
	if (trimmed.startsWith('ll') && trimmed.match(/^ll\d*$/)) {
		if (trimmed.match(/^ll\d+$/)) {
			const match = trimmed.match(/^ll(\d+)$/);
			suggestions.push({ command: trimmed, description: `open list for task ${match[1]}` });
		} else {
			suggestions.push({ command: 'll1, ll2, ll3...', description: 'open list for task' });
		}
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
		{ command: 'ad', description: 'add due date', pattern: /^ad(\d+)$/ },
		{ command: 'sp', description: 'split task', pattern: /^sp(\d+)$/ },
		{ command: 'sw', description: 'switch screen', pattern: /^sw(\d+)([du])$/ },
		{ command: 'remind', description: 'create reminder/task', pattern: /^remind$/ },
		{ command: 'calendar', description: 'open calendar window', pattern: /^calendar$/ },
		{ command: 'll', description: 'open list for task', pattern: /^ll(\d+)$/ },
		{ command: 'llc', description: 'open list for current task', pattern: /^llc$/ },
		{ command: 'lists', description: 'open standalone lists', pattern: /^lists$/ },
		{ command: 'templates', description: 'open task templates', pattern: /^templates$/ }
	];
	
	// Handle all command types with consistent logic
	if (trimmed.startsWith('ad')) {
		if (trimmed.match(/^ad\d+$/)) {
			const match = trimmed.match(/^ad(\d+)$/);
			suggestions.push({ command: trimmed, description: `add due date to task ${match[1]}` });
		} else {
			suggestions.push({ command: 'ad1, ad2, ad3...', description: 'add due date to task' });
		}
	} else if (trimmed.startsWith('sw')) {
		suggestions.push({ command: 'sw_n_d/u', description: 'switch to screen n down/up' });
	} else if (trimmed.startsWith('sp')) {
		if (trimmed.match(/^sp\d+$/)) {
			const match = trimmed.match(/^sp(\d+)$/);
			suggestions.push({ command: trimmed, description: `split task ${match[1]}` });
		} else {
			suggestions.push({ command: 'sp1, sp2, sp3...', description: 'split task' });
		}
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
	} else if (trimmed === 'remind') {
		suggestions.push({ command: 'remind', description: 'create reminder/task' });
	} else if (trimmed === 'calendar') {
		suggestions.push({ command: 'calendar', description: 'open calendar window' });
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
					} else if (trimmed.match(/^sp(\d+)$/)) {
						const match = trimmed.match(/^sp(\d+)$/);
						suggestions.push({ command: trimmed, description: `split task ${match[1]}` });
					} else if (trimmed === 'sat') {
						suggestions.push({ command: trimmed, description: 'show all tasks' });
					} else if (trimmed === 'ec') {
						suggestions.push({ command: trimmed, description: 'edit current task' });
					} else if (trimmed === 'aot') {
						suggestions.push({ command: trimmed, description: 'toggle always on top' });
					} else if (trimmed === 'remind') {
						suggestions.push({ command: trimmed, description: 'create reminder/task' });
					} else if (trimmed === 'calendar') {
						suggestions.push({ command: trimmed, description: 'open calendar window' });
					} else if (trimmed === 'lists') {
						suggestions.push({ command: 'lists', description: 'open standalone lists' });
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
					} else if (cmd.command === 'remind') {
						suggestions.push({ command: 'remind', description: 'create reminder/task' });
					} else if (cmd.command === 'calendar') {
						suggestions.push({ command: 'calendar', description: 'open calendar window' });
					} else if (cmd.command === 'sp') {
						suggestions.push({ command: 'sp1, sp2, sp3...', description: 'split task' });
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
	searchInput.placeholder = "s1, e2, c3, d4, ddd5, ec, llc, ll1, lists, sat, sw0d, remind, calendar...";

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
			searchInput.placeholder = "s1, e2, c3, d4, ddd5, ec, llc, ll1, lists, sat, sw0d, remind, calendar...";
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

// ===== Fuzzy Finder =====
const fuzzyFinderContainer = document.getElementById("fuzzyFinderContainer");
const fuzzyFinderInput = document.getElementById("fuzzyFinderInput");

let fuzzyFinderActive = false;
let fuzzySelectedTaskId = null;
let fuzzyVisibleTasks = []; // Stores visible task IDs in order during fuzzy search

// Simple fuzzy match function - returns score (higher = better match)
const fuzzyMatch = (pattern, str) => {
    pattern = pattern.toLowerCase();
    str = str.toLowerCase();

    let patternIdx = 0;
    let score = 0;
    let lastMatchIdx = -1;

    for (let i = 0; i < str.length && patternIdx < pattern.length; i++) {
        if (str[i] === pattern[patternIdx]) {
            score += 1;
            // Bonus for consecutive matches
            if (lastMatchIdx === i - 1) score += 2;
            // Bonus for matching at start or after space
            if (i === 0 || str[i - 1] === ' ') score += 3;
            lastMatchIdx = i;
            patternIdx++;
        }
    }

    // Return score only if all pattern chars matched
    return patternIdx === pattern.length ? score : 0;
};

// Filter actual tasks by showing/hiding them
const applyFuzzyFilter = (query) => {
    const allTasks = Object.values(tasks);
    let visibleTasks = [];

    if (!query.trim()) {
        // Show all tasks
        allTasks.forEach(task => {
            task.taskEl.classList.remove('fuzzy-hidden');
            visibleTasks.push({ task, score: 1 });
        });
    } else {
        allTasks.forEach(task => {
            const score = fuzzyMatch(query, task.title);
            if (score > 0) {
                task.taskEl.classList.remove('fuzzy-hidden');
                visibleTasks.push({ task, score });
            } else {
                task.taskEl.classList.add('fuzzy-hidden');
            }
        });
        // Sort by score descending
        visibleTasks.sort((a, b) => b.score - a.score);
    }

    // Update category group visibility
    const categoryGroups = document.querySelectorAll('.category-group');
    const categorySeparators = document.querySelectorAll('.category-separator');

    categoryGroups.forEach((group, index) => {
        const visibleTasksInGroup = group.querySelectorAll('.task:not(.fuzzy-hidden)');
        if (visibleTasksInGroup.length === 0) {
            group.classList.add('fuzzy-empty');
            // Also hide the corresponding separator
            if (categorySeparators[index]) {
                categorySeparators[index].classList.add('fuzzy-hidden');
            }
        } else {
            group.classList.remove('fuzzy-empty');
            if (categorySeparators[index]) {
                categorySeparators[index].classList.remove('fuzzy-hidden');
            }
        }
    });

    // Store visible task IDs in score order for navigation
    fuzzyVisibleTasks = visibleTasks.map(v => v.task.id);

    return visibleTasks.map(v => v.task);
};

// Update selection highlight on task elements
const updateFuzzySelection = (taskId) => {
    // Remove previous selection
    document.querySelector('.task.fuzzy-selected')?.classList.remove('fuzzy-selected');

    // Add new selection
    if (taskId && tasks[taskId]) {
        tasks[taskId].taskEl.classList.add('fuzzy-selected');
        tasks[taskId].taskEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    fuzzySelectedTaskId = taskId;
};

// Navigate to next/previous visible task
const navigateFuzzySelection = (direction) => {
    if (fuzzyVisibleTasks.length === 0) return;

    const currentIndex = fuzzyVisibleTasks.indexOf(fuzzySelectedTaskId);
    let newIndex;

    if (currentIndex === -1) {
        // No current selection, select first
        newIndex = 0;
    } else if (direction === 'next') {
        // Right arrow - next task
        newIndex = (currentIndex + 1) % fuzzyVisibleTasks.length;
    } else {
        // Left arrow - previous task
        newIndex = (currentIndex - 1 + fuzzyVisibleTasks.length) % fuzzyVisibleTasks.length;
    }

    updateFuzzySelection(fuzzyVisibleTasks[newIndex]);
};

const toggleFuzzyTask = (task) => {
    if (task.isFocused) {
        task.removeFocus();
    } else {
        task.addFocus();
    }
    closeFuzzyFinder();
};

const openFuzzyTaskContextMenu = (task) => {
    task.openCtxMenu();
    closeFuzzyFinder();
};

const openFuzzyFinder = () => {
    fuzzyFinderActive = true;
    fuzzyFinderContainer.classList.add('active');
    fuzzyFinderInput.value = '';

    // Show all tasks initially, select first one
    const visibleTasks = applyFuzzyFilter('');
    if (visibleTasks.length > 0) {
        updateFuzzySelection(visibleTasks[0].id);
    }
    fuzzyFinderInput.focus();
};

const closeFuzzyFinder = () => {
    fuzzyFinderActive = false;
    fuzzyFinderContainer.classList.remove('active');
    fuzzyFinderInput.blur();

    // Remove all fuzzy classes from tasks
    Object.values(tasks).forEach(task => {
        task.taskEl.classList.remove('fuzzy-hidden', 'fuzzy-selected');
    });

    // Remove fuzzy classes from category elements
    document.querySelectorAll('.category-group').forEach(group => {
        group.classList.remove('fuzzy-empty');
    });
    document.querySelectorAll('.category-separator').forEach(sep => {
        sep.classList.remove('fuzzy-hidden');
    });

    fuzzySelectedTaskId = null;
    fuzzyVisibleTasks = [];
};

// Event listeners
fuzzyFinderInput?.addEventListener("input", () => {
    const visibleTasks = applyFuzzyFilter(fuzzyFinderInput.value);
    // Auto-select first matching task
    if (visibleTasks.length > 0) {
        updateFuzzySelection(visibleTasks[0].id);
    } else {
        updateFuzzySelection(null);
    }
});

fuzzyFinderInput?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateFuzzySelection('next');
    } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateFuzzySelection('prev');
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (fuzzySelectedTaskId && tasks[fuzzySelectedTaskId]) {
            if (e.metaKey || e.ctrlKey) {
                openFuzzyTaskContextMenu(tasks[fuzzySelectedTaskId]);
            } else {
                toggleFuzzyTask(tasks[fuzzySelectedTaskId]);
            }
        }
    } else if (e.key === "Escape") {
        e.preventDefault();
        closeFuzzyFinder();
    }
});

// IPC listener for global shortcut
ipc.on("open-fuzzy-finder", () => {
    openFuzzyFinder();
});
