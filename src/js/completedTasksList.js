const {ipcRenderer} = require('electron/renderer');
const ipc = ipcRenderer;

const startDateInputEl = document.getElementById("startDate")
const endDateInputEl = document.getElementById("endDate")
const tagsInput = document.getElementById("tags-input");
const tagsButton = document.getElementById("tags-button");
const tagsListContainer = document.querySelector(".tags-list-container");
const tagsContainer = document.querySelector(".tags-container");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("search-input")
const categorySelect = document.getElementById("category");

let TABLEEL;
let tags = [];
const dates = {
    start_date: "",
    end_date: ""
}
let categories = [];
let searchQuery = "";
let selectedCategory = "";

const createTableElement = () => {
    TABLEEL = document.createElement('table');
    const tableHeader = document.createElement('thead');
    const tableHeadRow = document.createElement('tr');

    const idHead = document.createElement('th');
    idHead.textContent = 'id';

    const titleHead = document.createElement('th');
    titleHead.textContent = 'title';

    const tagsHead = document.createElement('th');
    tagsHead.textContent = 'tags';

    const categoryHead = document.createElement('th');
    categoryHead.textContent = 'category';

    const durationHead = document.createElement('th');
    durationHead.textContent = 'duration';

    const completedAtHead = document.createElement('th');
    completedAtHead.textContent = 'Completed At';


    const editActionHead = document.createElement('th');

    tableHeadRow.append(idHead, titleHead, tagsHead, categoryHead, durationHead, completedAtHead, editActionHead);
    tableHeader.append(tableHeadRow);
    TABLEEL.append(tableHeader);

    const tableBody = document.createElement('tbody');
    TABLEEL.append(tableBody);
    document.querySelector('.tableContainer').append(TABLEEL);
    return tableBody;
}

const createTaskListElements = (data, tableBody) => {
    console.log(data);
    data
        .map((t,i) => {
        const tableRow = document.createElement('tr');

        const indexField = document.createElement('td');
        indexField.textContent = i + 1;

        const titleField = document.createElement('td');
        titleField.textContent = t[1];

        const tagsField = document.createElement('td');
        tagsField.textContent = t[7].replaceAll(",", " | ");

        const categoryField = document.createElement('td');
        categoryField.textContent = t[3];

        const durationField = document.createElement('td');
        durationField.textContent = t[6];

        const completedAtField = document.createElement('td');
        completedAtField.textContent = t[5];

        const editActionField = document.createElement('td');
        editActionField.classList.add("edit-action-button");
        editActionField.textContent = "Edit";
        editActionField.addEventListener("click", (e) => {
            ipc.send("toggle_given_task_edit", {
                id: t[0],
                title: t[1],
                description: t[2],
                category: t[3],
                tags: t[7]
            })
        })

        tableRow.title = t[2];
        tableRow.append(indexField, titleField, tagsField, categoryField, durationField, completedAtField, editActionField);
        tableBody.append(tableRow);
    })
}

const updateDataAttribute = (data) => {
    let time = {hours:0, minutes:0, seconds:0}
    data.forEach((task) => {
        const timeSplit = task[6].split(':')
        const hours = parseInt(timeSplit[0])
        const minutes = parseInt(timeSplit[1])
        const seconds = parseInt(timeSplit[2])

        time.hours += hours;
        time.minutes += minutes;
        time.seconds += seconds;
    })

    const parseTime = (time) => {
        const minutesFromSeconds = Math.floor(time.seconds/60);
        const secondsReminder = time.seconds % 60;
        time.minutes += minutesFromSeconds;
        time.seconds = secondsReminder;
        console.log(minutesFromSeconds, secondsReminder)

        // same for minutes
        const hoursFromMinutes = Math.floor(time.minutes/60);
        const minutesReminder = time.minutes % 60;
        time.hours += hoursFromMinutes;
        time.minutes = minutesReminder;

        const timeAsString = (unit) => unit <= 9 ? `0${unit}` : unit;

        return `${timeAsString(time.hours)}:${timeAsString(time.minutes)}:${timeAsString(time.seconds)}`

    }


    document.querySelector('.tasksSoFar').dataset.tasks = data.length;
    document.querySelector('.totalDuration').dataset.duration = parseTime(time);

}

const populateCategoryOptions = () => {
	let categoryOptions = `<option value=""> --- </option>`;

	for (let cat of categories) {
		let categoryEl = `<option value="${cat}">${cat}</option>`;
		categoryOptions += categoryEl;
	}

    categorySelect.innerHTML = categoryOptions;
}

searchContainer.addEventListener("submit", (e) => {
    e.preventDefault();
    searchQuery = searchInput.value;

    ipc.send("completed_task_date_updated",
        {...dates, tags, search_query:searchQuery, category: selectedCategory})
})

categorySelect.addEventListener("change", (e) => {
    e.preventDefault();
    selectedCategory = e.target.value;
    ipc.send("completed_task_date_updated",
        {...dates, tags, search_query:searchQuery, category: selectedCategory})
})

const createTagElement = (tag) => {
    const p = document.createElement("p");
    p.textContent = tag;
    p.classList.add("tags-item");
    tagsListContainer.append(p);

    p.addEventListener("click", (e) => {
        tags = tags.filter((t) => t !== tag);
        e.target.remove();
        ipc.send("completed_task_date_updated",
            {...dates, tags, search_query:searchQuery, category: selectedCategory})
    })
}

tagsContainer.addEventListener("submit", (e) => {
    e.preventDefault();
    tagsButton.click();
})

tagsButton.addEventListener("click", (e) => {
    if (tagsInput.value.length === 0)
        return;

    // add tag element and push to the list
    tags.push(tagsInput.value);
    createTagElement(tagsInput.value);
    tagsInput.value = "";
    ipc.send("completed_task_date_updated",
        {...dates, tags, search_query:searchQuery, category: selectedCategory})
})


startDateInputEl.addEventListener("change", (e) => {
    dates.start_date = e.target.value;
    ipc.send("completed_task_date_updated",
        {...dates, tags, search_query:searchQuery, category: selectedCategory})
})

endDateInputEl.addEventListener("change", (e) => {
    dates.end_date = e.target.value;
    ipc.send("completed_task_date_updated",
        {...dates, tags, search_query:searchQuery, category: selectedCategory})
})


ipc.on('completed-tasks-list', (_,data) => {
    if (TABLEEL)
        TABLEEL.remove();
    const tableBody = createTableElement();
    createTaskListElements(data.tasks, tableBody);
    updateDataAttribute(data.tasks);

    categories = data.categories;
    if (!selectedCategory)
        populateCategoryOptions();
})

document.getElementById('closeBtn').addEventListener('click',() => {
    ipc.send('close-completed-list-window');
})

