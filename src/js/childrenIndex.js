const { ipcRenderer } = require('electron');
import { parseString } from './helpers.js';
const ipc = ipcRenderer;

let ID;
let category;
let tags = [];
let priority = null;
let due_at = null;
let show_before_due_time = null;
let originalDueAt = null; // Track original due date to detect changes

const containerEl = document.querySelector(".body-container");
const closeBtn = document.getElementById('closeBtn');
const submitBtn = document.getElementById('submitBtn');
const dialogEl = document.querySelector('dialog');
const addNewCategoryBtn = document.getElementById('addCategoryBtn');
const cancelAddCategoryBtn = document.getElementById('cancelAddCategoryBtn');
const addCategoryInput = document.getElementById('addCategoryInput');

const titleInput = document.getElementById('title');
const categorySelect = document.getElementById('category');
const descriptionInput = document.getElementById('description');
const tagsInput = document.getElementById("tags-input");
const tagsButton = document.getElementById("tags-button");
const tagsListContainer = document.querySelector(".tags-list-container");
const priorityInput = document.getElementById('priority');
const dueAtInput = document.getElementById('due_at');
const showBeforeDueHoursInput = document.getElementById('show_before_due_hours');
const showBeforeDueMinutesInput = document.getElementById('show_before_due_minutes');



document.addEventListener("DOMContentLoaded", () => {
	titleInput.focus();

	// Set minimum date to current time
	const now = new Date();
	const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
	dueAtInput.min = localDateTime;

	// Don't automatically set a default value when user focuses on empty due date field
	// This prevents accidentally setting a due date when user just wants to see the field
})

console.log(containerEl);

let categories = [];

ipc.on('data-from-parent', (e, data) => {

	ID = data.id;
	titleInput.value = data.title;
	descriptionInput.value = data.description;

	category = data.category;
	categories = data.categories;
	populateCategoryOptions();
	categorySelect.value = data.category;

	// Handle new properties
	priority = data.priority;
	due_at = data.due_at;
	show_before_due_time = data.show_before_due_time;
	originalDueAt = data.due_at; // Store original due date



	// Populate form fields
	priorityInput.value = priority || '';

	if (due_at) {
		// Convert ISO date to datetime-local format
		const date = new Date(due_at);
		const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
		dueAtInput.value = localDateTime;
	} else {
		// Leave empty if no due date is set
		dueAtInput.value = '';
	}

	// Convert minutes to hours and minutes
	if (show_before_due_time && show_before_due_time > 0) {
		const hours = Math.floor(show_before_due_time / 60);
		const minutes = show_before_due_time % 60;
		showBeforeDueHoursInput.value = hours;
		showBeforeDueMinutesInput.value = minutes;
	} else {
		showBeforeDueHoursInput.value = '';
		showBeforeDueMinutesInput.value = '';
	}

	if (data.tags.length === 0)
		return;
	tags = data.tags;
	populateTags();
});

const createTagElement = (tag) => {
	const p = document.createElement("p");
	p.textContent = tag;
	p.classList.add("tags-item");
	tagsListContainer.append(p);

	p.addEventListener("click", (e) => {
		tags = tags.filter((t) => t !== tag);
		e.target.remove();
		console.log(tag, e, tags);
	})
}

const populateTags = () => {
	for (let tag of tags) {
		createTagElement(tag);
	}
}

const populateCategoryOptions = () => {
	if (!categories.includes(category)) {
		categories.push(category);
	}

	let categoryOptions = '';
	let changeEvent;

	for (let cat of categories) {
		let categoryEl = `<option value="${cat}" ${cat === 'none' ? 'selected' : ''
			}>${cat}</option>`;
		categoryOptions += categoryEl;
	}

	categorySelect.innerHTML = categoryOptions;

	const addCategoryOptionString = `<option value="addCategory"> Add category </option>`;
	categorySelect.innerHTML += addCategoryOptionString;

	document.removeEventListener('change', changeEvent);
	changeEvent = categorySelect.addEventListener('change', (e) => {
		category = e.target.value === 'addCategory' ? category : e.target.value;
		if (e.target.value !== 'addCategory') return;

		dialogEl.showModal();
	});
};

const listenForNewCat = () => {
	dialogEl.addEventListener('cancel', (e) => {
		e.preventDefault();
	});

	cancelAddCategoryBtn.addEventListener('click', (e) => {
		categorySelect.value = category;
		addCategoryInput.value = '';
		dialogEl.close();
	});

	addNewCategoryBtn.addEventListener('click', (e) => {
		const value = parseString(addCategoryInput.value);
		if (value.length < 1) {
			categorySelect.value = category;
			dialogEl.close();
		} else {
			// add new cat to localStorage
			categories.push(value);
			localStorage.setItem('categories', JSON.stringify(categories));

			// repopulate the options
			populateCategoryOptions();

			// give new cat value to select
			categorySelect.value = value;

			// reset addCategoryInput value
			addCategoryInput.value = '';
			// close modal
			dialogEl.close();
		}
	});
};
listenForNewCat();

// v both are taking care of closing the child window.
closeBtn.addEventListener('click', () => {
	ipc.send('close-children-window');
});

function handleSubmit() {
	console.log("in sumit we have the following tags", tags);

	// Get values from form inputs
	const priorityValue = priorityInput.value ? parseInt(priorityInput.value) : null;
	
	// Only process due date if it was actually changed
	let dueAtValue = null;
	if (dueAtInput.value) {
		const newDueAt = new Date(dueAtInput.value).toISOString();
		dueAtValue = newDueAt;
	}
	// If dueAtInput.value is empty, dueAtValue remains null
	// This means if there was an original due date and user clears the field, it will be set to null

	// Convert hours and minutes to total minutes
	const hours = parseInt(showBeforeDueHoursInput.value) || 0;
	const minutes = parseInt(showBeforeDueMinutesInput.value) || 0;
	const showBeforeDueTimeValue = (hours * 60) + minutes > 0 ? (hours * 60) + minutes : null;


	ipc.send("edit-submission-event-from-edit-popup", {
		title: parseString(titleInput.value),
		category: categorySelect.value.replaceAll(',', ''),
		description: parseString(descriptionInput.value),
		id: ID,
		categories: categories.filter((c) => c !== 'none'),
		tags: tags,
		priority: priorityValue,
		due_at: dueAtValue,
		show_before_due_time: showBeforeDueTimeValue,
	});
}

submitBtn.addEventListener('click', () => {
	handleSubmit();
});

containerEl.addEventListener("keydown", (e) => {
	if ((e.metaKey || event.ctrlKey) && event.key === "Enter")
		handleSubmit();
})

tagsButton.addEventListener("click", (e) => {
	if (tagsInput.value.length === 0)
		return;

	// add tag element and push to the list
	tags.push(tagsInput.value);
	createTagElement(tagsInput.value);
	tagsInput.value = "";
})

titleInput.addEventListener('change', (e) => {
	console.log(categorySelect.value);
	const titleLength = e.target.value.length;
	if (titleLength < 3) {
		titleInput.placeholder = 'Minimum length of 1 characters';
		titleInput.style.backgroundColor = '#f78b92';
		titleInput.style.border = '1px solid red';
	} else {
		titleInput.placeholder = 'Title';
		titleInput.style.backgroundColor = '#292c35';
		titleInput.style.border = 'none';
	}
});
