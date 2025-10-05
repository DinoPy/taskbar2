const { ipcRenderer } = require('electron/renderer');
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


	const actionsHead = document.createElement('th');
	actionsHead.textContent = 'actions';

	tableHeadRow.append(idHead, titleHead, tagsHead, categoryHead, durationHead, completedAtHead, actionsHead);
	tableHeader.append(tableHeadRow);
	TABLEEL.append(tableHeader);

	const tableBody = document.createElement('tbody');
	TABLEEL.append(tableBody);
	document.querySelector('.tableContainer').append(TABLEEL);
	return tableBody;
}

const createTaskListElements = (data, tableBody) => {
	console.log(data);
	
	// Group tasks by completion date
	const groupedByDate = {};
	
	data.forEach((task) => {
		if (task.completed_at.Valid) {
			const completionDate = new Date(task.completed_at.Time);
			const dateKey = completionDate.toDateString(); // e.g., "Fri Oct 03 2025"
			
			if (!groupedByDate[dateKey]) {
				groupedByDate[dateKey] = {
					date: completionDate,
					tasks: []
				};
			}
			groupedByDate[dateKey].tasks.push(task);
		}
	});
	
	// Sort dates in descending order (most recent first)
	const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
		return new Date(b) - new Date(a);
	});
	
	let globalIndex = 1;
	
	sortedDateKeys.forEach((dateKey) => {
		const dateGroup = groupedByDate[dateKey];
		
		// Create date header row with stats
		const dateHeaderRow = document.createElement('tr');
		dateHeaderRow.classList.add('date-header-row');
		
		const dateHeaderCell = document.createElement('td');
		dateHeaderCell.colSpan = 7; // Span all columns (id, title, tags, category, duration, completed_at, actions)
		
		// Calculate daily stats
		const taskCount = dateGroup.tasks.length;
		const totalDuration = calculateTotalDuration(dateGroup.tasks);
		
		// Create date header content
		const dateText = formatDateHeader(dateGroup.date);
		const statsText = ` • ${taskCount} task${taskCount !== 1 ? 's' : ''} • ${totalDuration}`;
		
		dateHeaderCell.innerHTML = `
			<span class="date-text">${dateText}</span>
			<span class="date-stats">${statsText}</span>
		`;
		dateHeaderCell.classList.add('date-header');
		
		dateHeaderRow.append(dateHeaderCell);
		tableBody.append(dateHeaderRow);
		
		// Add tasks for this date (sorted by completion time - earliest first)
		const sortedTasks = dateGroup.tasks.sort((a, b) => new Date(a.completed_at.Time) - new Date(b.completed_at.Time));
		
		sortedTasks.forEach((t, taskIndex) => {
				const tableRow = document.createElement('tr');

				const indexField = document.createElement('td');
				indexField.textContent = globalIndex++;

				const titleField = document.createElement('td');
				titleField.textContent = t.title;

				const tagsField = document.createElement('td');
				if (t.tags && t.tags.length > 0)
					tagsField.textContent = t.tags.join(" | ");

				const categoryField = document.createElement('td');
				categoryField.textContent = t.category;

				const durationField = document.createElement('td');
				durationField.textContent = t.duration;

				const completedAtField = document.createElement('td');
				if (t.completed_at.Valid) {
					const completedTime = new Date(t.completed_at.Time);
					completedAtField.textContent = completedTime.toLocaleTimeString('en-US', {
						hour: 'numeric',
						minute: '2-digit',
						hour12: true
					});
				}

				const actionsField = document.createElement('td');
				actionsField.classList.add("actions-container");
				
				// Create action buttons container
				const actionsContainer = document.createElement('div');
				actionsContainer.classList.add('action-buttons-row');
				
				// Edit button
				const editBtn = document.createElement('button');
				editBtn.classList.add('action-btn', 'edit-btn');
				editBtn.title = 'Edit task';
				editBtn.innerHTML = '✏️';
				editBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("toggle_given_task_edit", {
						id: t.id,
						title: t.title,
						description: t.descripiton,
						category: t.category,
						tags: t.tags,
					})
				});
				
				// Duplicate button
				const duplicateBtn = document.createElement('button');
				duplicateBtn.classList.add('action-btn', 'duplicate-btn');
				duplicateBtn.title = 'Duplicate task';
				duplicateBtn.innerHTML = '📋';
				duplicateBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("duplicate_completed_task", {
						id: t.id,
						title: t.title,
						description: t.descripiton,
						category: t.category,
						tags: t.tags,
						duration: t.duration
					});
				});
				
				// Split button
				const splitBtn = document.createElement('button');
				splitBtn.classList.add('action-btn', 'split-btn');
				splitBtn.title = 'Split task';
				splitBtn.innerHTML = '✂️';
				splitBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("split_completed_task", {
						id: t.id,
						title: t.title,
						description: t.descripiton,
						category: t.category,
						tags: t.tags,
						duration: t.duration
					});
				});
				
				// Separator
				const separator = document.createElement('span');
				separator.classList.add('action-separator');
				separator.innerHTML = '|';
				
				// Delete button
				const deleteBtn = document.createElement('button');
				deleteBtn.classList.add('action-btn', 'delete-btn');
				deleteBtn.title = 'Delete task';
				deleteBtn.innerHTML = '🗑️';
				deleteBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					showDeleteConfirmation(t);
				});
				
				actionsContainer.append(editBtn, duplicateBtn, splitBtn, separator, deleteBtn);
				actionsField.append(actionsContainer);

				tableRow.title = t.title;
				tableRow.append(indexField, titleField, tagsField, categoryField, durationField, completedAtField, actionsField);
				
				// Add spacing class to last task row of each date group (except the last date group)
				const isLastTaskOfGroup = taskIndex === sortedTasks.length - 1;
				const isLastDateGroup = dateKey === sortedDateKeys[sortedDateKeys.length - 1];
				
				if (isLastTaskOfGroup && !isLastDateGroup) {
					tableRow.classList.add('date-task-group-end');
				}
				
				tableBody.append(tableRow);
			});
	});
}

// Helper function to format date header
const formatDateHeader = (date) => {
	const options = { 
		weekday: 'long', 
		year: 'numeric', 
		month: 'long', 
		day: 'numeric' 
	};
	return date.toLocaleDateString('en-US', options);
}

// Helper function to calculate total duration for a group of tasks
const calculateTotalDuration = (tasks) => {
	let time = { hours: 0, minutes: 0, seconds: 0 };
	
	tasks.forEach((task) => {
		const timeSplit = task.duration.split(':');
		const hours = parseInt(timeSplit[0]);
		const minutes = parseInt(timeSplit[1]);
		const seconds = parseInt(timeSplit[2]);

		time.hours += hours;
		time.minutes += minutes;
		time.seconds += seconds;
	});

	// Convert seconds to minutes
	const minutesFromSeconds = Math.floor(time.seconds / 60);
	const secondsReminder = time.seconds % 60;
	time.minutes += minutesFromSeconds;
	time.seconds = secondsReminder;

	// Convert minutes to hours
	const hoursFromMinutes = Math.floor(time.minutes / 60);
	const minutesReminder = time.minutes % 60;
	time.hours += hoursFromMinutes;
	time.minutes = minutesReminder;

	const timeAsString = (unit) => unit <= 9 ? `0${unit}` : unit;
	return `${timeAsString(time.hours)}:${timeAsString(time.minutes)}:${timeAsString(time.seconds)}`;
}

const updateDataAttribute = (data) => {
	let time = { hours: 0, minutes: 0, seconds: 0 }
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
		const minutesFromSeconds = Math.floor(time.seconds / 60);
		const secondsReminder = time.seconds % 60;
		time.minutes += minutesFromSeconds;
		time.seconds = secondsReminder;
		console.log(minutesFromSeconds, secondsReminder)

		// same for minutes
		const hoursFromMinutes = Math.floor(time.minutes / 60);
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
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
})

categorySelect.addEventListener("change", (e) => {
	e.preventDefault();
	selectedCategory = e.target.value;
	ipc.send("completed_task_date_updated",
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
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
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
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
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
})


startDateInputEl.addEventListener("change", (e) => {
	dates.start_date = e.target.value;
	ipc.send("completed_task_date_updated",
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
})

endDateInputEl.addEventListener("change", (e) => {
	dates.end_date = e.target.value;
	ipc.send("completed_task_date_updated",
		{
			start_date: dates.start_date !== "" ? new Date(dates.start_date).toISOString() : null,
			end_date: dates.end_date !== "" ? new Date(dates.end_date).toISOString() : null,
			tags,
			search_query: searchQuery,
			category: selectedCategory
		})
})


ipc.on('completed-tasks-list', (_, data) => {
	console.log(data);
	if (TABLEEL)
		TABLEEL.remove();
	const tableBody = createTableElement();
	createTaskListElements(data.tasks, tableBody);
	updateDataAttribute(data.tasks);

	categories = data.categories;
	if (!selectedCategory)
		populateCategoryOptions();
})

document.getElementById('closeBtn').addEventListener('click', () => {
	ipc.send('close-completed-list-window');
})

// Delete confirmation function
const showDeleteConfirmation = (task) => {
	const confirmed = confirm(`Are you sure you want to delete the task "${task.title}"?\n\nThis action cannot be undone.`);
	if (confirmed) {
		ipc.send("delete_completed_task", {
			id: task.id
		});
	}
}

