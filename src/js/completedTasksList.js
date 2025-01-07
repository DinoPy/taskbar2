const { webContents } = require('electron');
const {ipcRenderer} = require('electron/renderer');
const ipc = ipcRenderer;

let TABLEEL;

const createTableElement = () => {
    TABLEEL = document.createElement('table');
    const tableHeader = document.createElement('thead');
    const tableHeadRow = document.createElement('tr');

    const idHead = document.createElement('th');
    idHead.textContent = 'id';

    const titleHead = document.createElement('th');
    titleHead.classList.add('titleHeader');
    titleHead.textContent = 'title';

    const categoryHead = document.createElement('th');
    categoryHead.textContent = 'category';

    const durationHead = document.createElement('th');
    durationHead.textContent = 'duration';

    tableHeadRow.append(idHead, titleHead, categoryHead, durationHead);
    tableHeader.append(tableHeadRow);
    TABLEEL.append(tableHeader);

    const tableBody = document.createElement('tbody');
    TABLEEL.append(tableBody);
    document.querySelector('.tableContainer').append(TABLEEL);
    return tableBody;
}

const createTaskListElements = (data, tableBody) => {
    console.log(data);
    const currentDate = new Date().toLocaleDateString("en-US");
    data
        .filter(i => i.createdAt.split(" ")[0] === currentDate)
        .map((t,i) => {
        const tableRow = document.createElement('tr');

        const indexField = document.createElement('td');
        indexField.textContent = i;

        const titleField = document.createElement('td');
        titleField.textContent = t.title;

        const categoryField = document.createElement('td');
        categoryField.textContent = t.category;

        const durationField = document.createElement('td');
        durationField.textContent = t.duration;

        tableRow.title = t.description;
        tableRow.append(indexField, titleField, categoryField, durationField);
        tableBody.append(tableRow);
    })
}

const updateDataAttribute = (data) => {
    data = data.filter(t => new Date().toLocaleDateString('en-EN') ===  t.completedAt.split(' ')[0])
    let time = {hours:0, minutes:0, seconds:0}
    data.forEach((task) => {
        const timeSplit = task.duration.split(':')
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


ipc.on('completed-tasks-list', (_,data) => {
    const tableBody = createTableElement();
    createTaskListElements(data,tableBody);
    updateDataAttribute(data);
})

document.getElementById('closeBtn').addEventListener('click',() => {
    ipc.send('close-completed-list-window');
})

