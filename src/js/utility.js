const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;

export function formatCountdownText(time) {
    let minutes = Math.floor((time / 60) % 60);
    let hours = Math.floor(time / 60 / 60);
    let seconds = time % 60;
    return `${hours > 0 ? (hours < 10 ? '0' + hours : hours) + ' : ' : ''} ${minutes < 10 ? '0' + minutes : minutes
        } : ${seconds < 10 ? '0' + seconds : seconds}`;
}

export const formatCurrentDate = () => {
    // get current time.
    const today = new Date();
    // format the returned value to desired form
    return `${today.getMonth() + 1
        }/${today.getDate()}/${today.getFullYear()} ${today.getHours()}:${today.getMinutes()}:${today.getSeconds()}`;
};

export class Task {
    constructor({
        id,
        title,
        createdAt,
        taskEl,
        childrenEl,
        completedTasks,
        tasks,
        taskContainer,
        barDetails,
        noActiveTaskWarning,
        category,
        isActive = false,
        description = "no description",
        tags = "",
        duration = 0,
        toggledFocusAt = 0,
    }) {
        this.id = id;
        this.title = title;
        this.createdAt = createdAt;
        this.taskEl = document.createElement("div");
        this.children = {
            titleEl: document.createElement('p'),
            timerEl: document.createElement('p'),
            categoryEl: document.createElement('p'),
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
            this.category = newCategory;
            this.children.categoryEl.textContent = newCategory;
            if (!from_relative)
                ipc.send("task_edit", {
                    category: newCategory,
                    title: this.title,
                    description: this.description,
                    tags: this.tags,
                    id: this.id
                })
        };

        getIsFocusedStatus () {
            return this.isFocused;
        };

        getCategory () {
            return this.category;
        };

        addFocus (from_relative= false) {
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
                        duration: this.formatTaskDuration(Math.ceil(this.duration / 1000))
                    });
        };

        removeFocus (from_delete = false) {
            this.isFocused = false;
            this.stopTimer();
            this.taskEl.classList.remove('activeTask');
            this.children.timerEl.style.color = 'gray';
            if (!from_delete)
                ipc.send("task_toggle",
                    { uuid: this.id,
                        toggled_at: this.toggledFocusAt,
                        is_active: this.isFocused,
                        duration: this.formatTaskDuration(Math.ceil(this.duration / 1000))
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
            ipc.send("task_complete", this.formatTask('Object', true));
        };

        addTaskListeners () {
            this.taskEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                // which gets the button that's pressed on the mouse 1 being right click
                if (e.which === 1) {
                    if (this.isFocused) this.removeFocus();
                    else this.addFocus();
                } else if (e.which === 2) {
                    this.removeFocus();
                    this.addToCompletedTaskList();
                    this.destroySelfFromDOM();
                    delete tasks[this.id];
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
            this.children.titleEl.classList.add('taskTitle');
            this.children.titleEl.textContent = this.title;
            this.children.timerEl.classList.add('activeTaskTimer');
            this.children.timerEl.textContent =
                this.formatCountdownText(Math.ceil(this.duration / 1000));
            this.children.categoryEl.classList.add('taskCategory');
            this.children.categoryEl.textContent = this.category;

            this.taskEl.append(this.children.titleEl);
            this.taskEl.append(this.children.timerEl);
            this.taskEl.append(this.children.categoryEl);
        };

        setTaskUp (from_relative= false) {
            this.setTaskElUp();
            this.setChildrenElUp();
            this.taskContainer.append(this.taskEl);
            if (!from_relative)
                ipc.send("task_create", this.formatTask("Object", false))
        };

        openCtxMenu () {
            const props = { id: this.id, title: this.title, description: this.description, category: this.category };
            ipc.send('show-task-context-menu', props);
        };

        formatTask (type, isCompleted) {
            const formatedDescription = '"' + this.description.replaceAll(',', '') + '"';
            const formatedCompletedAt = this.formatCurrentDate();
            const formatedDuration =
                this.formatTaskDuration(Math.ceil(this.duration / 1000));
            /*
                const id = idNew;
                let title = titleNew;
                const createdAt = createdAtNew;
                let taskEl = taskElNew;
                let children = childrenEl;
                let isFocused = false;
                let taskTimerInterval = null;
                let description = 'no description';
                let duration = 0;
                let category = categoryNew;
                let toggledFocusAt = 0;
            */

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
            // get current time.
            const today = new Date();
            // format the returned value to desired form
            return `${today.getMonth() + 1
                }/${today.getDate()}/${today.getFullYear()} ${today.getHours()}:${today.getMinutes()}:${today.getSeconds()}`;
        };
}
