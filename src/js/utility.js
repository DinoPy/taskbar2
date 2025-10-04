const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;
import { isSocketConnected, tasks_compl_or_del_while_nocon, tasks} from "./newIndex.js";

export function formatCountdownText(time) {
    let minutes = Math.floor((time / 60) % 60);
    let hours = Math.floor(time / 60 / 60);
    let seconds = time % 60;
    return `${hours > 0 ? (hours < 10 ? '0' + hours : hours) + ' : ' : ''} ${minutes < 10 ? '0' + minutes : minutes
        } : ${seconds < 10 ? '0' + seconds : seconds}`;
}

export const formatCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, "0")
    const day = String(today.getDate()).padStart(2, "0")
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
};


export const taskIndexUpdater = (tasks) => {
    console.log(tasks);
    const keys =  Object.keys(tasks);
    console.log(`Current number of tasks: ${keys.length}`);
    for (let i = 0; i < keys.length; i++) {
       tasks[keys[i]].updateIndex(i+1);
    }
}

// Urgency calculation function - Refined 5-level system
export const calculateUrgencyLevel = (due_at) => {
    // If no due date is set or it's invalid, return null (no urgency)
    if (!due_at || due_at === "0001-01-01T00:00:00Z" || due_at === "0001-01-01T00:00:00.000Z") {
        return null;
    }
    
    const currentTime = new Date();
    const dueDate = new Date(due_at);
    
    // Check if the date is valid
    if (isNaN(dueDate.getTime())) {
        return null;
    }
    
    const timeRemaining = dueDate.getTime() - currentTime.getTime();
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);
    
    // Return urgency level based on refined thresholds
    if (hoursRemaining <= 0) {
        return 'critical'; // Past due
    } else if (hoursRemaining <= 0.5) { // 30 minutes
        return 'critical'; 
    } else if (hoursRemaining <= 2) { // 2 hours
        return 'high';
    } else if (hoursRemaining <= 6) { // 6 hours
        return 'medium-high';
    } else if (hoursRemaining <= 12) { // 12 hours
        return 'medium';
    } else if (hoursRemaining <= 24) { // 24 hours
        return 'low';
    } else {
        return null; // Beyond 24 hours, no urgency styling
    }
}

// Function to calculate countdown text for corner indicator
export const calculateCountdownText = (due_at) => {
    // If no due date is set or it's invalid, return empty string
    if (!due_at || due_at === "0001-01-01T00:00:00Z" || due_at === "0001-01-01T00:00:00.000Z") {
        return '';
    }
    
    const currentTime = new Date();
    const dueDate = new Date(due_at);
    
    // Check if the date is valid
    if (isNaN(dueDate.getTime())) {
        return '';
    }
    
    const timeRemaining = dueDate.getTime() - currentTime.getTime();
    const minutesRemaining = Math.floor(timeRemaining / (1000 * 60));
    
    // Return appropriate countdown text
    if (minutesRemaining <= 0) {
        return 'OVER'; // Past due
    } else if (minutesRemaining < 60) {
        return `${minutesRemaining}m`; // Less than 1 hour - show minutes
    } else if (minutesRemaining < 1440) { // Less than 24 hours
        const hours = Math.floor(minutesRemaining / 60);
        const minutes = minutesRemaining % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}`; // Show hours:minutes format
    } else {
        const days = Math.floor(minutesRemaining / 1440);
        return `${days}d`; // Show days
    }
}

export class Task {
    constructor({
        id,
        title,
        createdAt,
        taskEl,
        childrenEl,
        completedTasks,
        taskContainer,
        barDetails,
        noActiveTaskWarning,
        category,
        isActive = false,
        description = "no description",
        tags = [],
        duration = 0,
        toggledFocusAt = 0,
        priority = null,
        due_at = null,
        show_before_due_time = null,
        last_modified_at = +new Date()
    }) {
        this.id = id;
        this.title = title;
        this.createdAt = createdAt;
        this.taskEl = document.createElement("div");
        this.children = {
            titleEl: document.createElement('p'),
            timerEl: document.createElement('p'),
            categoryEl: document.createElement('p'),
            indexEl: document.createElement('p'),
        },
        this.isFocused = isActive;
        this.taskTimerInterval = null;
        this.description = description;
        this.duration = duration;
        this.category = category;
        this.toggledFocusAt = toggledFocusAt;
        this.tags = tags
        this.priority = priority;
        this.due_at = due_at;
        this.show_before_due_time = show_before_due_time;

        this.taskContainer = taskContainer;
        this.barDetails = barDetails;
        this.noActiveTaskWarning = noActiveTaskWarning;
        this.completedTasks = completedTasks;
        this.last_modified_at = last_modified_at

        if (isActive)
            this.addFocus(true);
    }
        updateTitle (newTitle) {
            this.title = newTitle;
            this.taskEl.title = newTitle;
            // Update the span element inside the title paragraph
            const titleSpan = this.children.titleEl.querySelector('span');
            if (titleSpan) {
                titleSpan.textContent = newTitle;
            } else {
                // Fallback if span doesn't exist
                this.children.titleEl.textContent = newTitle;
            }
        };

        updateDescription (newDescription) {
            this.description = newDescription;
        };

        updateTags (newTags) {
            this.tags = newTags;
        };

        updatePriority (newPriority, from_relative = false) {
            const currentEpochTime = +new Date();
            this.priority = newPriority;
            this.last_modified_at = currentEpochTime;

            if (!from_relative)
                ipc.send("task_edit", {
                    category: this.category,
                    title: this.title,
                    description: this.description,
                    tags: this.tags,
                    priority: newPriority,
                    due_at: this.due_at,
                    show_before_due_time: this.show_before_due_time,
                    id: this.id,
                    last_modified_at: currentEpochTime,
                })
        };

        updateDueAt (newDueAt, from_relative = false) {
            const currentEpochTime = +new Date();
            this.due_at = newDueAt;
            this.last_modified_at = currentEpochTime;

            // Update the due date element in the DOM
            const dueDateEl = this.taskEl.querySelector('.taskDueDate');
            if (dueDateEl) {
                if (newDueAt) {
                    const dueDate = new Date(newDueAt);
                    // Check if date is valid (not year 0001 or invalid)
                    if (dueDate.getFullYear() > 1900 && !isNaN(dueDate.getTime())) {
                        dueDateEl.textContent = dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    } else {
                        dueDateEl.textContent = '';
                    }
                } else {
                    dueDateEl.textContent = '';
                }
            }

            // Update urgency styling when due date changes
            this.updateUrgencyStyling();

            if (!from_relative)
                ipc.send("task_edit", {
                    category: this.category,
                    title: this.title,
                    description: this.description,
                    tags: this.tags,
                    priority: this.priority,
                    due_at: newDueAt,
                    show_before_due_time: this.show_before_due_time,
                    id: this.id,
                    last_modified_at: currentEpochTime,
                })
        };

        updateShowBeforeDueTime (newShowBeforeDueTime, from_relative = false) {
            const currentEpochTime = +new Date();
            this.show_before_due_time = newShowBeforeDueTime;
            this.last_modified_at = currentEpochTime;

            if (!from_relative)
                ipc.send("task_edit", {
                    category: this.category,
                    title: this.title,
                    description: this.description,
                    tags: this.tags,
                    priority: this.priority,
                    due_at: this.due_at,
                    show_before_due_time: newShowBeforeDueTime,
                    id: this.id,
                    last_modified_at: currentEpochTime,
                })
        };

        updateCategory (newCategory, from_relative= false) {
            const currentEpochTime = +new Date();

            this.category = newCategory;
            this.children.categoryEl.textContent = newCategory;
            this.last_modified_at = currentEpochTime;

            if (!from_relative)
                ipc.send("task_edit", {
                    category: newCategory,
                    title: this.title,
                    description: this.description,
                    tags: this.tags,
                    priority: this.priority,
                    due_at: this.due_at,
                    show_before_due_time: this.show_before_due_time,
                    id: this.id,
                    last_modified_at: currentEpochTime,
                })
        };

        getIsFocusedStatus () {
            return this.isFocused;
        };

        getCategory () {
            return this.category;
        };

        addFocus (from_relative= false) {
            const currentEpochTime = +new Date();

            this.last_modified_at = currentEpochTime
            this.isFocused = true;
            if (from_relative)
                this.startTimer(this.toggledFocusAt);
            else
                this.startTimer();
            this.taskEl.classList.add('activeTask');
            this.noActiveTaskWarning.classList.add('invisible');
            
            // TODO: On toggle, update the duration
            if (!from_relative)
                ipc.send("task_toggle",
                    { uuid: this.id,
                        toggled_at: this.toggledFocusAt,
                        is_active: this.isFocused,
                        duration: this.formatTaskDuration(Math.ceil(this.duration / 1000)),
                        last_modified_at: currentEpochTime
                    });
        };

        removeFocus (from_delete = false) {
            const currentEpochTime = +new Date();

            this.last_modified_at = currentEpochTime;
            this.isFocused = false;
            this.stopTimer();
            this.taskEl.classList.remove('activeTask');
            
            if (!from_delete)
                ipc.send("task_toggle",
                    { uuid: this.id,
                        toggled_at: this.toggledFocusAt,
                        is_active: this.isFocused,
                        duration: this.formatTaskDuration(Math.ceil(this.duration / 1000)),
                        last_modified_at: currentEpochTime
                    });
        };

    // TODO: add toggled at from relative
        startTimer (existentTime) {
            console.log(existentTime);
            // settings up the interval

            this.taskTimerInterval = setInterval(()=> {
                let timePassed = Math.floor(
                    (this.duration + +new Date() - this.toggledFocusAt) / 1000
                );
                this.children.timerEl.textContent = formatCountdownText(timePassed);
            }, 1000);

            // update when the task was focused
            this.toggledFocusAt = existentTime || new Date().getTime();
        };

        stopTimer () {
            // stop the interval timer
            clearInterval(this.taskTimerInterval);

            // update the duration
            if (this.toggledFocusAt > 0) this.duration += new Date().getTime() - this.toggledFocusAt;

            // helps avoiding a bug where the time passed during the break causes the task timer to blow up.
            this.toggledFocusAt = 0;
        };

        destroySelfFromDOM () {
            this.taskEl.remove();
            // check if the taskEl still exists after removal as variable, if so equal it to null not to waste memory
        };

        show () {
            this.taskEl.style.display = 'flex';
            this.taskEl.style.flexDirection = 'column';
            this.updateUrgencyStyling();
        };

        hide () {
            this.taskEl.style.display = 'none';
        };

        updateUrgencyStyling () {
            // Remove all existing urgency classes
            this.taskEl.classList.remove('urgency-low', 'urgency-medium', 'urgency-medium-high', 'urgency-high', 'urgency-critical');
            
            // Calculate urgency level
            const urgencyLevel = calculateUrgencyLevel(this.due_at);
            
            // Apply urgency class if there's an urgency level
            if (urgencyLevel) {
                this.taskEl.classList.add(`urgency-${urgencyLevel}`);
                
                // Update corner indicator with countdown text
                const countdownText = calculateCountdownText(this.due_at);
                this.taskEl.style.setProperty('--corner-text', `"${countdownText}"`);
            } else {
                // Clear corner indicator text for tasks without urgency
                this.taskEl.style.setProperty('--corner-text', '""');
            }
        };

        addToCompletedTaskList () {
            this.completedTasks.push(this.formatTask('Object', true));
            if (!isSocketConnected)
                tasks_compl_or_del_while_nocon.push(this.id);
            ipc.send("task_complete", this.formatTask('Object', true));
        };

        addTaskListeners () {
            this.taskEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                // which gets the button that's pressed on the mouse 1 being right click
                if (e.which === 1) {
                    console.log(isSocketConnected);
                    if (this.isFocused) this.removeFocus();
                    else this.addFocus();
                } else if (e.which === 2) {
                    this.removeFocus(true);
                    this.addToCompletedTaskList();
                    this.destroySelfFromDOM();
                    delete tasks[this.id];

                    taskIndexUpdater(tasks)
                } else if (e.which === 3) {
                    this.openCtxMenu();
                    e.stopPropagation();
                }
            });
        };

        setTaskElUp () {
            this.taskEl.classList.add('task');
            this.taskEl.title = this.title;
            this.taskEl.id = this.id;
        };

        setChildrenElUp () {
            // Create top row container for category, due date, and timer
            const topRowEl = document.createElement('div');
            topRowEl.classList.add('taskTopRow');
            
            this.children.titleEl.classList.add('taskTitle');
            const titleSpan = document.createElement('span');
            titleSpan.textContent = this.title;
            this.children.titleEl.appendChild(titleSpan);
            this.children.timerEl.classList.add('activeTaskTimer');
            this.children.timerEl.textContent =
                this.formatCountdownText(Math.ceil(this.duration / 1000));
            this.children.categoryEl.classList.add('taskCategory');
            this.children.categoryEl.textContent = this.category;
            this.children.indexEl.classList.add("index")
            this.children.indexEl.textContent = Object.keys(tasks).length;

            // Create due date element
            const dueDateEl = document.createElement('p');
            dueDateEl.classList.add('taskDueDate');
            if (this.due_at) {
                const dueDate = new Date(this.due_at);
                // Check if date is valid (not year 0001 or invalid)
                if (dueDate.getFullYear() > 1900 && !isNaN(dueDate.getTime())) {
                    dueDateEl.textContent = dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                } else {
                    dueDateEl.textContent = '';
                }
            } else {
                dueDateEl.textContent = '';
            }

            // Add category, due date, and timer to top row
            topRowEl.append(this.children.categoryEl);
            topRowEl.append(dueDateEl);
            topRowEl.append(this.children.timerEl);

            this.taskEl.append(topRowEl);
            this.taskEl.append(this.children.titleEl);
            this.taskEl.append(this.children.indexEl);
        };

        setTaskUp (from_relative= false) {
            this.setTaskElUp();
            this.setChildrenElUp();
            this.taskContainer.append(this.taskEl);
            this.updateUrgencyStyling();
            if (!from_relative)
                ipc.send("task_create", this.formatTask("Object", false))
        };

        updateIndex (num) {
            this.children.indexEl.textContent = (num);
        }

        openCtxMenu () {
            const props = {
                id: this.id,
                title: this.title,
                description: this.description,
                category: this.category,
                tags: this.tags,
                priority: this.priority,
                due_at: this.due_at,
                show_before_due_time: this.show_before_due_time,
            };
            ipc.send('show-task-context-menu', props);
        };

        formatTask (type, isCompleted) {
            const formatedDescription = '"' + this.description.replaceAll(',', '') + '"';
            const formatedCompletedAt = new Date().toISOString();
            const formatedDuration =
                this.formatTaskDuration(Math.ceil(this.duration / 1000));

            switch (type) {
                case 'Object':
                    return {
                        id: this.id,
                        title: this.title,
                        description: formatedDescription,
                        created_at: this.createdAt,
                        completed_at: formatedCompletedAt,
                        duration: formatedDuration,
                        category: this.category,
                        tags: this.tags,
                        priority: this.priority,
                        due_at: this.due_at,
                        show_before_due_time: this.show_before_due_time,
                        toggled_at: this.toggledFocusAt,
                        is_completed: isCompleted,
                        is_active: false,
                        last_modified_at: this.last_modified_at
                    }
                case 'Array':
                    return [
                        this.title,
                        this.description,
                        this.createdAt,
                        formatedCompletedAt,
                        formatedDuration,
                        this.category,
                    ]
            }
        }

        formatCountdownText (time) {
            // getting the value of minutes
            let minutes = Math.floor((time / 60) % 60);
            // getting the value of hours
            let hours = Math.floor(time / 60 / 60);
            // getting the value of seconds
            let seconds = time % 60;
            // some nested conditionals to ensure the return of correct information
            return `${hours > 0 ? (hours < 10 ? '0' + hours : hours) + ' : ' : ''} ${minutes < 10 ? '0' + minutes : minutes
                } : ${seconds < 10 ? '0' + seconds : seconds}`;
        };

        formatTaskDuration (time) {
            // similar to formatcountdowntext however it exports into an excel duration format
            let minutes = Math.floor((time / 60) % 60);
            let hours = Math.floor(time / 60 / 60);
            let seconds = time % 60;
            return `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes
                }:${seconds < 10 ? '0' + seconds : seconds}`;
        };

        formatCurrentDate () {
            const today = new Date();
            const year = today.getFullYear()
            const month = String(today.getMonth() + 1).padStart(2, "0")
            const day = String(today.getDate()).padStart(2, "0")
            const hours = String(today.getHours()).padStart(2, '0');
            const minutes = String(today.getMinutes()).padStart(2, '0');
            const seconds = String(today.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
        };
}
