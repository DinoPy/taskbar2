const { ipcRenderer } = require('electron');
import { parseString } from './helpers.js';
const ipc = ipcRenderer;

let ID;
let category;

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

document.addEventListener("DOMContentLoaded", () => {
    titleInput.focus();
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
});

const populateCategoryOptions = () => {
	if (!categories.includes(category)) {
		categories.push(category);
	}

	let categoryOptions = '';
	let changeEvent;

	for (let cat of categories) {
		let categoryEl = `<option value="${cat}" ${
			cat === 'none' ? 'selected' : ''
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
    ipc.send("edit-submission-event-from-edit-popup", {
        title: parseString(titleInput.value),
        category: categorySelect.value.replaceAll(',', ''),
        description: parseString(descriptionInput.value),
        id: ID,
        categories: categories.filter((c) => c !== 'none'),
    });
}

submitBtn.addEventListener('click', () => {
    handleSubmit();
});

containerEl.addEventListener("keydown", (e) => {
    if((e.metaKey || event.ctrlKey) && event.key === "Enter")
        handleSubmit();
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
