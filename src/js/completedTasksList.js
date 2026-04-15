const { ipcRenderer } = window.require('electron');
const ipc = ipcRenderer;

// =========================================
// DOM refs
// =========================================

const startDateInputEl = document.getElementById("startDate");
const endDateInputEl = document.getElementById("endDate");

// =========================================
// Filter state
// =========================================

let TABLEEL;
const dates = { start_date: "", end_date: "" };
let selectedCategories = [];
let includeTags = [];
let excludeTags = [];
let includeKeywords = [];
let excludeKeywords = [];
let hasListsFilter = null; // null = no filter, true = with lists, false = without

// Server-provided filter options
let availableCategories = [];
let availableTags = [];

// =========================================
// Send filter request
// =========================================

function sendFilterRequest() {
	const payload = {
		start_date: dates.start_date ? new Date(dates.start_date).toISOString() : null,
		end_date: dates.end_date ? new Date(dates.end_date).toISOString() : null,
		categories: selectedCategories,
		include_tags: includeTags,
		exclude_tags: excludeTags,
		include_keywords: includeKeywords,
		exclude_keywords: excludeKeywords,
	};
	if (hasListsFilter !== null) payload.has_lists = hasListsFilter;
	ipc.send("completed_task_date_updated", payload);
}

// =========================================
// Chip rendering helpers
// =========================================

function renderChips(containerId, items, onRemove, cssClass) {
	const container = document.getElementById(containerId);
	container.innerHTML = "";
	for (const item of items) {
		const chip = document.createElement("span");
		chip.classList.add("filter-chip", "filter-chip--active");
		if (cssClass) chip.classList.add(cssClass);
		chip.textContent = item;

		const removeBtn = document.createElement("span");
		removeBtn.classList.add("filter-chip-x");
		removeBtn.textContent = "\u00D7";
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onRemove(item);
		});
		chip.appendChild(removeBtn);
		container.appendChild(chip);
	}
}

function renderCategoryChips() {
	const container = document.getElementById("category-chips");
	container.innerHTML = "";
	for (const cat of availableCategories) {
		const chip = document.createElement("span");
		const isSelected = selectedCategories.includes(cat);
		chip.classList.add("filter-chip");
		if (isSelected) chip.classList.add("filter-chip--active");
		chip.textContent = cat;
		chip.addEventListener("click", () => {
			if (selectedCategories.includes(cat)) {
				selectedCategories = selectedCategories.filter(c => c !== cat);
			} else {
				selectedCategories.push(cat);
			}
			renderCategoryChips();
			sendFilterRequest();
		});
		container.appendChild(chip);
	}
}

// =========================================
// Tri-state tag picker
// =========================================

const tagPopover = document.getElementById("tag-popover");
const tagPopoverList = document.getElementById("tag-popover-list");
const tagPopoverSearch = document.getElementById("tag-popover-search");
const tagPickerBtn = document.getElementById("tag-picker-btn");
const tagPopoverClose = document.getElementById("tag-popover-close");
const tagActiveChips = document.getElementById("tag-active-chips");

function getTagState(tag) {
	if (includeTags.includes(tag)) return "include";
	if (excludeTags.includes(tag)) return "exclude";
	return "neutral";
}

function setTagState(tag, state) {
	includeTags = includeTags.filter(t => t !== tag);
	excludeTags = excludeTags.filter(t => t !== tag);
	if (state === "include") includeTags.push(tag);
	else if (state === "exclude") excludeTags.push(tag);
}

function cycleTagState(tag) {
	const current = getTagState(tag);
	if (current === "neutral") setTagState(tag, "include");
	else if (current === "include") setTagState(tag, "exclude");
	else setTagState(tag, "neutral");
	renderTagPopoverList();
	renderTagActiveChips();
	sendFilterRequest();
}

function renderTagPopoverList() {
	const search = tagPopoverSearch.value.toLowerCase();
	tagPopoverList.innerHTML = "";
	for (const tag of availableTags) {
		if (search && !tag.toLowerCase().includes(search)) continue;
		const state = getTagState(tag);
		const row = document.createElement("div");
		row.className = "tag-popover-item";
		if (state !== "neutral") row.classList.add("tag-popover-item--" + state);

		const indicator = document.createElement("span");
		indicator.className = "tag-popover-indicator";
		if (state === "include") indicator.textContent = "+";
		else if (state === "exclude") indicator.textContent = "\u2212";
		else indicator.textContent = "";

		const label = document.createElement("span");
		label.className = "tag-popover-label";
		label.textContent = tag;

		row.appendChild(indicator);
		row.appendChild(label);
		row.addEventListener("click", () => cycleTagState(tag));
		tagPopoverList.appendChild(row);
	}
}

function renderTagActiveChips() {
	tagActiveChips.innerHTML = "";
	for (const tag of [...includeTags]) {
		tagActiveChips.appendChild(buildActiveChip(tag, "include"));
	}
	for (const tag of [...excludeTags]) {
		tagActiveChips.appendChild(buildActiveChip(tag, "exclude"));
	}
}

function buildActiveChip(tag, state) {
	const chip = document.createElement("span");
	chip.classList.add("filter-chip", "filter-chip--active");
	if (state === "exclude") chip.classList.add("filter-chip--exclude");
	chip.title = state === "include" ? "Click to exclude, \u00D7 to remove" : "Click to include, \u00D7 to remove";

	const label = document.createElement("span");
	label.textContent = tag;
	label.style.cursor = "pointer";
	label.addEventListener("click", (e) => {
		e.stopPropagation();
		// Toggle between include and exclude
		setTagState(tag, state === "include" ? "exclude" : "include");
		renderTagActiveChips();
		renderTagPopoverList();
		sendFilterRequest();
	});
	chip.appendChild(label);

	const x = document.createElement("span");
	x.classList.add("filter-chip-x");
	x.textContent = "\u00D7";
	x.addEventListener("click", (e) => {
		e.stopPropagation();
		setTagState(tag, "neutral");
		renderTagActiveChips();
		renderTagPopoverList();
		sendFilterRequest();
	});
	chip.appendChild(x);
	return chip;
}

function openTagPopover() {
	tagPopover.classList.remove("hidden");
	tagPopoverSearch.value = "";
	renderTagPopoverList();
	tagPopoverSearch.focus();
}

function closeTagPopover() {
	tagPopover.classList.add("hidden");
}

tagPickerBtn.addEventListener("click", (e) => {
	e.stopPropagation();
	if (tagPopover.classList.contains("hidden")) openTagPopover();
	else closeTagPopover();
});

tagPopoverClose.addEventListener("click", closeTagPopover);

tagPopoverSearch.addEventListener("input", () => renderTagPopoverList());
tagPopoverSearch.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeTagPopover();
});

document.addEventListener("click", (e) => {
	if (!tagPopover.classList.contains("hidden") && !tagPopover.contains(e.target) && e.target !== tagPickerBtn) {
		closeTagPopover();
	}
});

// =========================================
// Filter section setup
// =========================================

function setupFilterInput(inputId, btnId, getList, setList) {
	const input = document.getElementById(inputId);
	const btn = document.getElementById(btnId);

	const addValue = () => {
		const val = input.value.trim();
		const current = getList();
		if (!val || current.includes(val)) return;
		setList([...current, val]);
		input.value = "";
		sendFilterRequest();
	};

	btn.addEventListener("click", addValue);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			addValue();
		}
	});
}

function refreshIncludeKeywordChips() {
	renderChips("include-keywords-chips", includeKeywords, (kw) => {
		includeKeywords = includeKeywords.filter(k => k !== kw);
		refreshIncludeKeywordChips();
		sendFilterRequest();
	});
}

function refreshExcludeKeywordChips() {
	renderChips("exclude-keywords-chips", excludeKeywords, (kw) => {
		excludeKeywords = excludeKeywords.filter(k => k !== kw);
		refreshExcludeKeywordChips();
		sendFilterRequest();
	}, "filter-chip--exclude");
}

// =========================================
// Date listeners
// =========================================

startDateInputEl.addEventListener("change", (e) => {
	dates.start_date = e.target.value;
	sendFilterRequest();
});

endDateInputEl.addEventListener("change", (e) => {
	dates.end_date = e.target.value;
	sendFilterRequest();
});

// =========================================
// Filter input setup
// =========================================

setupFilterInput("include-keywords-input", "include-keywords-btn", () => includeKeywords, (v) => { includeKeywords = v; refreshIncludeKeywordChips(); });
setupFilterInput("exclude-keywords-input", "exclude-keywords-btn", () => excludeKeywords, (v) => { excludeKeywords = v; refreshExcludeKeywordChips(); });

document.getElementById("has-lists-filter").addEventListener("change", (e) => {
	const val = e.target.value;
	hasListsFilter = val === "" ? null : val === "true";
	sendFilterRequest();
});

// =========================================
// Table rendering
// =========================================

const createTableElement = () => {
	TABLEEL = document.createElement('table');
	const tableHeader = document.createElement('thead');
	const tableHeadRow = document.createElement('tr');

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

	const listsHead = document.createElement('th');
	listsHead.textContent = 'Lists';

	const actionsHead = document.createElement('th');
	actionsHead.textContent = 'actions';

	tableHeadRow.append(titleHead, tagsHead, categoryHead, durationHead, completedAtHead, listsHead, actionsHead);
	tableHeader.append(tableHeadRow);
	TABLEEL.append(tableHeader);

	const tableBody = document.createElement('tbody');
	TABLEEL.append(tableBody);
	document.querySelector('.tableContainer').append(TABLEEL);
	return tableBody;
}

const createTaskListElements = (data, tableBody) => {
	// Group tasks by completion date
	const groupedByDate = {};

	data.forEach((task) => {
		if (task.completed_at.Valid) {
			const completionDate = new Date(task.completed_at.Time);
			const dateKey = completionDate.toDateString();

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
		return new Date(a) - new Date(b);
	});

	sortedDateKeys.forEach((dateKey) => {
		const dateGroup = groupedByDate[dateKey];

		// Create date header row with stats
		const dateHeaderRow = document.createElement('tr');
		dateHeaderRow.classList.add('date-header-row');

		const dateHeaderCell = document.createElement('td');
		dateHeaderCell.colSpan = 7;

		// Calculate daily stats
		const taskCount = dateGroup.tasks.length;
		const totalDuration = calculateTotalDuration(dateGroup.tasks);

		// Create date header content
		const dateText = formatDateHeader(dateGroup.date);
		const statsText = ` \u2022 ${taskCount} task${taskCount !== 1 ? 's' : ''} \u2022 ${totalDuration}`;

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

				const listsField = document.createElement('td');
				if (t.lists_summary) {
					const ls = t.lists_summary;
					const badge = document.createElement('span');
					badge.classList.add('lists-badge');
					badge.textContent = `${ls.completed_items}/${ls.total_items}`;
					badge.title = `${ls.list_count} list${ls.list_count !== 1 ? 's' : ''} \u2022 ${ls.completed_items}/${ls.total_items} items`;
					if (ls.completed_items >= ls.total_items && ls.total_items > 0) {
						badge.classList.add('lists-badge-complete');
					}
					badge.style.cursor = 'pointer';
					badge.addEventListener('click', (e) => {
						e.stopPropagation();
						ipc.send("open-list-window", { target: { kind: "task", id: t.id } });
					});
					listsField.appendChild(badge);
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
				editBtn.textContent = 'Edit';
				editBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("toggle_given_task_edit", {
						id: t.id,
						title: t.title,
						description: t.description,
						category: t.category,
						tags: t.tags,
					})
				});

				// Duplicate button
				const duplicateBtn = document.createElement('button');
				duplicateBtn.classList.add('action-btn', 'duplicate-btn');
				duplicateBtn.title = 'Duplicate task';
				duplicateBtn.textContent = 'Copy';
				duplicateBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("duplicate_completed_task", {
						id: t.id,
						title: t.title,
						description: t.description,
						category: t.category,
						tags: t.tags,
						duration: t.duration
					});
				});

				// Split button
				const splitBtn = document.createElement('button');
				splitBtn.classList.add('action-btn', 'split-btn');
				splitBtn.title = 'Split task';
				splitBtn.textContent = 'Split';
				splitBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("split_completed_task", {
						id: t.id,
						title: t.title,
						description: t.description,
						category: t.category,
						tags: t.tags,
						duration: t.duration
					});
				});

				// Lists button
				const listsBtn = document.createElement('button');
				listsBtn.classList.add('action-btn', 'lists-btn');
				listsBtn.title = 'Open lists';
				listsBtn.textContent = 'Lists';
				listsBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					ipc.send("open-list-window", { target: { kind: "task", id: t.id } });
				});

				// Delete button
				const deleteBtn = document.createElement('button');
				deleteBtn.classList.add('action-btn', 'delete-btn');
				deleteBtn.title = 'Delete task';
				deleteBtn.textContent = 'Delete';
				deleteBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					showDeleteConfirmation(t);
				});

				actionsContainer.append(editBtn, duplicateBtn, splitBtn, listsBtn, deleteBtn);
				actionsField.append(actionsContainer);

				tableRow.title = t.title;
				tableRow.append(titleField, tagsField, categoryField, durationField, completedAtField, listsField, actionsField);

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

		const hoursFromMinutes = Math.floor(time.minutes / 60);
		const minutesReminder = time.minutes % 60;
		time.hours += hoursFromMinutes;
		time.minutes = minutesReminder;

		const timeAsString = (unit) => unit <= 9 ? `0${unit}` : unit;

		return `${timeAsString(time.hours)}:${timeAsString(time.minutes)}:${timeAsString(time.seconds)}`
	}

	document.querySelector('.tasksSoFar').dataset.tasks = data.length;
	document.querySelector('.totalDuration').dataset.duration = parseTime(time);

	// Average duration
	if (data.length > 0) {
		const totalSeconds = time.hours * 3600 + time.minutes * 60 + time.seconds;
		const avgSeconds = Math.round(totalSeconds / data.length);
		const avgTime = {
			hours: Math.floor(avgSeconds / 3600),
			minutes: Math.floor((avgSeconds % 3600) / 60),
			seconds: avgSeconds % 60,
		};
		document.querySelector('.avgDuration').dataset.avg = parseTime(avgTime);
	} else {
		document.querySelector('.avgDuration').dataset.avg = "00:00:00";
	}
}

// =========================================
// IPC listener (v2 response)
// =========================================

ipc.on('completed-tasks-v2-list', (_, data) => {
	if (TABLEEL) TABLEEL.remove();
	const tableBody = createTableElement();
	createTaskListElements(data.tasks, tableBody);
	updateDataAttribute(data.tasks);

	// Update available filters from server
	const filters = data.available_filters || {};
	availableCategories = filters.categories || [];
	availableTags = filters.tags || [];

	// Re-render filter chips with updated available options
	renderCategoryChips();
	renderTagActiveChips();
	renderTagPopoverList();
});

// Keep v1 listener for backwards compatibility during transition
ipc.on('completed-tasks-list', (_, data) => {
	if (TABLEEL) TABLEEL.remove();
	const tableBody = createTableElement();
	createTaskListElements(data.tasks, tableBody);
	updateDataAttribute(data.tasks);

	if (data.categories) {
		availableCategories = data.categories;
		renderCategoryChips();
	}
	if (data.tags) {
		availableTags = data.tags;
	}
	renderTagActiveChips();
	renderTagPopoverList();
});

// =========================================
// Close / Delete
// =========================================

document.getElementById('closeBtn').addEventListener('click', () => {
	ipc.send('close-completed-list-window');
});

const showDeleteConfirmation = (task) => {
	const confirmed = confirm(`Are you sure you want to delete the task "${task.title}"?\n\nThis action cannot be undone.`);
	if (confirmed) {
		ipc.send("delete_completed_task", { id: task.id });
	}
}
