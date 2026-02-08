const { ipcRenderer } = window.require("electron");
import { setupFuzzyFinder } from './helpers.js';

let currentConfig = {
	title: "Confirm action",
	summary: "",
	confirmLabel: "Confirm",
	cancelLabel: "Cancel",
	confirmEvent: "confirmation-confirmed",
	cancelEvent: "confirmation-cancelled",
};
let currentTasks = [];
let currentTags = [];
let availableTags = [];

const headingEl = document.querySelector(".confirm-card h1");
const summaryEl = document.getElementById("deleteConfirmSummary");
const listEl = document.getElementById("deleteConfirmList");
const confirmBtn = document.getElementById("deleteConfirmBtn");
const cancelBtn = document.getElementById("deleteCancelBtn");

const tagsSection = document.getElementById("tagsSection");
const tagsList = document.getElementById("tagsList");
const tagsInput = document.getElementById("tagsInput");
const tagsAddBtn = document.getElementById("tagsAddBtn");

const resizeWindow = () => {
	const card = document.querySelector(".confirm-card");
	if (!card) return;
	const bodyStyle = window.getComputedStyle(document.body);
	const bodyPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
	const cardHeight = card.scrollHeight;
	const shadowBuffer = 20; // Account for box-shadow blur and spread
	const height = bodyPadding + cardHeight + shadowBuffer;
	ipcRenderer.send("confirm-dialog-resize", { height });
};

const renderTags = () => {
	if (!tagsList) return;
	tagsList.innerHTML = "";
	currentTags.forEach((tag, index) => {
		const tagEl = document.createElement("span");
		tagEl.className = "tag-item";
		tagEl.textContent = tag;
		tagEl.addEventListener("click", () => {
			currentTags.splice(index, 1);
			renderTags();
			resizeWindow();
		});
		tagsList.appendChild(tagEl);
	});
};

const addTag = () => {
	if (!tagsInput) return;
	const value = tagsInput.value.trim();
	if (value && !currentTags.includes(value)) {
		currentTags.push(value);
		tagsInput.value = "";
		renderTags();
		resizeWindow();
	}
};

const renderTasks = (tasks = []) => {
	listEl.innerHTML = "";
	currentTasks = tasks.filter((task) => task?.id);

	if (!currentTasks.length) {
		summaryEl.textContent = "No tasks selected.";
		confirmBtn.disabled = true;
		confirmBtn.blur();
		resizeWindow();
		return;
	}

	summaryEl.textContent =
		currentConfig.summary ||
		(currentTasks.length === 1
			? `You’re about to ${currentConfig.title?.toLowerCase() ?? "perform this action"} "${currentTasks[0].title || "Task"}".`
			: `You’re about to ${currentConfig.title?.toLowerCase() ?? "perform this action"} ${currentTasks.length} tasks.`);

	currentTasks.forEach((task) => {
		const item = document.createElement("li");
		item.textContent = task.title || `Task ${task.id}`;
		listEl.appendChild(item);
	});

	// Initialize tags from first task (completion is single-task)
	currentTags = [...(currentTasks[0]?.tags || [])];

	// Only show tags section for completion (not delete)
	const isCompletion = currentConfig.confirmEvent === "completion-confirmation-confirmed";
	if (tagsSection) {
		tagsSection.style.display = isCompletion ? "block" : "none";
	}
	if (isCompletion) {
		renderTags();
	}

	confirmBtn.disabled = false;
	confirmBtn.focus({ preventScroll: true });
	resizeWindow();
};

const applyConfig = (config = {}) => {
	currentConfig = {
		...currentConfig,
		...config,
	};
	headingEl.textContent = currentConfig.title ?? "Confirm action";
	confirmBtn.textContent = currentConfig.confirmLabel ?? "Confirm";
	cancelBtn.textContent = currentConfig.cancelLabel ?? "Cancel";
};

ipcRenderer.on("confirm-dialog-data", (_, payload) => {
	if (!payload) return;
	applyConfig(payload.config);
	availableTags = payload.allTags || [];
	renderTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
});

confirmBtn?.addEventListener("click", () => {
	if (confirmBtn.disabled) return;
	ipcRenderer.send(currentConfig.confirmEvent, {
		tasks: currentTasks,
		tags: currentTags,
	});
});

cancelBtn?.addEventListener("click", () => {
	ipcRenderer.send(currentConfig.cancelEvent);
});

tagsAddBtn?.addEventListener("click", addTag);



window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		event.preventDefault();
		ipcRenderer.send(currentConfig.cancelEvent);
	}
});

setupFuzzyFinder({
	inputElement: tagsInput,
	containerElement: document.querySelector(".tags-input-container"),
	getAllTags: () => availableTags,
	onSelectTag: (tag) => {
		if (tag && !currentTags.includes(tag)) {
			currentTags.push(tag);
			renderTags();
			resizeWindow();
		}
	},
	getExcludedTags: () => currentTags,
	onCustomEnter: addTag,
});
