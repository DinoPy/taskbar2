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
    const keys =  Object.keys(tasks);
    for (let i = 0; i < keys.length; i++) {
       tasks[keys[i]].updateIndex(i+1);
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
        tags = "",
        duration = 0,
        toggledFocusAt = 0,
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
            this.children.titleEl.textContent = newTitle;
        };

        updateDescription (newDescription) {
            this.description = newDescription;
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
            this.children.timerEl.style.color = '#1b1d23';
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
            this.children.timerEl.style.color = 'gray';
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

            // play animation when timer is counting
            this.taskEl.style.animationPlayState = 'running';
        };

        stopTimer () {
            // stop the interval timer
            clearInterval(this.taskTimerInterval);

            // update the duration
            if (this.toggledFocusAt > 0) this.duration += new Date().getTime() - this.toggledFocusAt;

            // pause animation when timer is not counting
            this.taskEl.style.animationPlayState = 'paused';

            // helps avoiding a bug where the time passed during the break causes the task timer to blow up.
            this.toggledFocusAt = 0;
        };

        destroySelfFromDOM () {
            this.taskEl.remove();
            // check if the taskEl still exists after removal as variable, if so equal it to null not to waste memory
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
                    this.removeFocus();
                    this.addToCompletedTaskList();
                    this.destroySelfFromDOM();
                    delete tasks[this.id];

                    taskIndexUpdater(tasks)
                } else if (e.which === 3) {
                    this.openCtxMenu();
                    e.stopPropagation();
                    taskIndexUpdater(tasks)
                }
            });
        };

        setTaskElUp () {
            this.taskEl.classList.add('task');
            this.taskEl.title = this.title;
            this.taskEl.id = this.id;
        };

        setChildrenElUp () {
            this.children.titleEl.classList.add('taskTitle');
            this.children.titleEl.textContent = this.title;
            this.children.timerEl.classList.add('activeTaskTimer');
            this.children.timerEl.textContent =
                this.formatCountdownText(Math.ceil(this.duration / 1000));
            this.children.categoryEl.classList.add('taskCategory');
            this.children.categoryEl.textContent = this.category;
            this.children.indexEl.classList.add("index")
            this.children.indexEl.textContent = Object.keys(tasks).length;

            this.taskEl.append(this.children.titleEl);
            this.taskEl.append(this.children.timerEl);
            this.taskEl.append(this.children.categoryEl);
            this.taskEl.append(this.children.indexEl);
        };

        setTaskUp (from_relative= false) {
            this.setTaskElUp();
            this.setChildrenElUp();
            this.taskContainer.append(this.taskEl);
            if (!from_relative)
                ipc.send("task_create", this.formatTask("Object", false))
        };

        updateIndex (num) {
            this.children.indexEl.textContent = (num);
        }

        openCtxMenu () {
            const props = { id: this.id, title: this.title, description: this.description, category: this.category };
            ipc.send('show-task-context-menu', props);
        };

        formatTask (type, isCompleted) {
            const formatedDescription = '"' + this.description.replaceAll(',', '') + '"';
            const formatedCompletedAt = this.formatCurrentDate();
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
                        tags: "",
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
