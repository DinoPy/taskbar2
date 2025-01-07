const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;
import { Task, formatCurrentDate, formatCountdownText } from './utility.js';
import { parseString } from './helpers.js';

const closeBtn = document.getElementById('closeBtn');
const countdownText = document.getElementById('countdown');
const playPauseBtn = document.getElementById('playPauseIcon');
const skipPauseBtn = document.getElementById('skipPauseIcon');
const bodyEl = document.querySelector('body');
const noActiveTaskParagraph = document.querySelector('.noActiveTaskWarning');
const connectionStatusIcon = document.querySelector(".connection-status-icon");
const userLoginIcon = document.querySelector(".user-icon");
const searchContainer = document.querySelector(".search-container");

const tasks = {};
const completedTasks = [];
let isTimerRunning = true;
let lastCategorySelected = 'none';

// ----------- LOGGING ----------------//
ipc.on("print-to-console", (e, data) => {
    console.log(data);
});

// ----------- CONN & AUTH ----------------//
ipc.on("user-login-status", (e, data) => {
    if (data)
        userLoginIcon.classList.add("logged-in-color");
});

ipc.on("socket-connected", (e, data) => {
    console.log("socket connected");
    connectionStatusIcon.classList.add("logged-in-color");
});

ipc.on("socket-disconnected", (e, data) => {
    console.log("socket diconnected");
    connectionStatusIcon.classList.remove("logged-in-color");
});

// ------------- HELPERS ----------------//

ipc.on('data-from-main', (e, data) => {
    isTimerRunning = data.isTimerRunning;
});

ipc.on('toggle-countdown-timer', (e, data) => {
    isTimerRunning = data.isTimerRunning;
});

ipc.on('request-list-of-completed-tasks', () => {
    ipc.send('sending-completed-tasks', completedTasks);
})

ipc.on('task-post-error', (e, data) => {
    console.log(data);
    console.log(e);
    alert(data);
});

// -------------- FROM SERVER ---- ----------------- //

ipc.on("resume-tasks", (e, data) => {
    console.log(data);

    for (let t of data) {
        const durationStringSplit = t[5].split(":");
        const durationInt = (parseInt(durationStringSplit[0]) * 60 * 60 +
            parseInt(durationStringSplit[1]) * 60 +
            parseInt(durationStringSplit[2])) * 1000;
        console.log(durationInt);
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
            completedTasks,
            tasks,
            taskContainer,
            barDetails,
            noActiveTaskWarning: noActiveTaskParagraph,
        });

        tasks[t[0]].setTaskUp(true);
        tasks[t[0]].addTaskListeners();
    }
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
})

ipc.on("related_task_edited", (e, data) => {
    tasks[data.id].updateTitle(data.title);
    tasks[data.id].updateDescription(data.description);
    tasks[data.id].updateCategory(data.category, true);


})

// ---------- CRUD HELPERS ----------- //

ipc.on('msg-redirected-to-parent', (e, data) => {
    lastCategorySelected =
        data.category !== tasks[data.id].getCategory()
            ? data.category
            : lastCategorySelected;

    tasks[data.id].updateTitle(data.title);
    tasks[data.id].updateDescription(data.description);
    tasks[data.id].updateCategory(data.category);
});

ipc.on('deleteTask', (e, data) => {
    tasks[data.id].removeFocus(true);
    tasks[data.id].destroySelfFromDOM();
    ipc.send("task_delete", { id: tasks[data.id].id });
    delete tasks[data.id];
});

ipc.on('completeTask', (e, data) => {
    tasks[data.id].removeFocus();
    tasks[data.id].addToCompletedTaskList();
    tasks[data.id].destroySelfFromDOM();
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
                category: tasks[id].category
            });
            break;
        }
    }
});



closeBtn.addEventListener('click', () => {
    ipc.send('closeApp', completedTasks);
});


bodyEl.addEventListener('mousedown', (e) => {
    if (e.button === 2) ipc.send('show-general-context-menu');
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

            for (let task in tasks) {
                tasks[task].stopTimer();
            }
            if (countdownInitialValue === activeTime) {
                barDetails.barStatus = 'pause';
                countdown = pauseTime;
                countdownInitialValue = countdown;
                skipPauseBtn.style.display = 'inline';

                ipc.send('Interval-Ended', 'Start pause.');
            } else {
                countdown = activeTime;
                barDetails.barStatus = 'active';
                countdownInitialValue = countdown;
                skipPauseBtn.style.display = 'none';

                ipc.send('Interval-Ended', 'Start work.');
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
        for (let task in tasks) {
            if (tasks[task].getIsFocusedStatus()) tasks[task].startTimer();
        }
    } else {
        // stop the main timer
        clearInterval(intervalId);

        for (let task in tasks) {
            tasks[task].stopTimer();
        }

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

    for (let task in tasks) {
        if (tasks[task].getIsFocusedStatus()) tasks[task].startTimer();
    }
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
    const newId = addTask('To be replaced');
    Object.keys(tasks).forEach(t => tasks[t].removeFocus());
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
