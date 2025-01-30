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
	const durationStringSplit = t[5].split(":");
	const durationInt = (parseInt(durationStringSplit[0]) * 60 * 60 +
		parseInt(durationStringSplit[1]) * 60 +
		parseInt(durationStringSplit[2])) * 1000;
	tasks[t[0]] = new Task({
		id: t[0],
		title: t[1],
		description: t[2],
		createdAt: t[3],
		duration: durationInt,
		category: t[6],
		tags: t[7],
		isActive: Boolean(t[9]),
		toggledFocusAt: t[8],
		last_modified_at: t[12],
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
	});
	tasks[t[0]].setTaskUp(true);
	tasks[t[0]].addTaskListeners();
}

ipc.on("resume-tasks", (e, data) => {
	// first delete all active tasks
	// then add the new ones
	// this won't do well for situations without connection.

	for (let t of data) {
		if (tasks.hasOwnProperty(t[0])) {
			console.log(`task: ${t[0]} exists`)
			//11th
			if (tasks[t[0]].last_modified_at > t[12]) {
				console.log(`task: ${t[0]} with time: ${t[12]} has more updated information locally`)
				continue;
			} else if (tasks[t[0]].last_modified_at < t[12]) {
				console.log(`task: ${t[0]} with time: ${t[12]} is outdated`)
				tasks[t[0]].removeFocus(true);
				tasks[t[0]].destroySelfFromDOM();
				createTaskFromDataList(t);
			} else {
				console.log(`task: ${t[0]} with time: ${t[12]} is the same`)
				continue;
			}
		} else {
			console.log(`task: ${t[0]} does not exist`)
			if (!tasks_compl_or_del_while_nocon.includes(t[0]))
				createTaskFromDataList(t);
		}
		taskIndexUpdater(tasks);
	}

	tasks_compl_or_del_while_nocon = [];
})

ipc.on("refresh_tasks", (e, data) => {
	console.log("refresh tasks triggered", JSON.stringify(data));
	for (let t in tasks) {
		tasks[t].removeFocus(true);
		tasks[t].destroySelfFromDOM();
		delete tasks[t];
	}

	for (let t of data) {
		createTaskFromDataList(t);
	}

	taskIndexUpdater(tasks);
})

// -------------- FROM RELATED APP ----------------- //

ipc.on("new_task_from_relative", (e, data) => {
	tasks[data.id] = new Task({
		id: data.id,
		title: data.title,
		createdAt: data.created_at,
		category: data.category,
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
		tags: data.tags,
		isActive: data.is_active
	});

	tasks[data.id].setTaskUp(true);
	tasks[data.id].addTaskListeners();
	taskIndexUpdater(tasks);
})


ipc.on("related_task_toggled", (e, data) => {
	if (data.is_active)
		tasks[data.uuid].addFocus(true);
	else
		tasks[data.uuid].removeFocus(true);
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
	} else {
		ipc.send("task_edit", {
			category: data.category,
			title: data.title,
			description: data.description,
			tags: data.tags,
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

// -------------- CMD HELPERS ---------------------- //

ipc.on("request-current-task-data-for-edit", () => {
	for (let id in tasks) {
		if (tasks[id].getIsFocusedStatus()) {
			ipc.send("toggle_current_task_edit", {
				id,
				title: tasks[id].title,
				description: tasks[id].description,
				category: tasks[id].category,
				tags: tasks[id].tags
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
		createdAt: formatCurrentDate(),
		category: lastCategorySelected,
		completedTasks,
		tasks,
		taskContainer,
		barDetails,
		noActiveTaskWarning: noActiveTaskParagraph,
	});

	tasks[newId].setTaskUp();
	tasks[newId].addTaskListeners();
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
