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
const listStatusSection = document.getElementById("listStatusSection");

let listsBlocked = false;

const resizeWindow = () => {
	const card = document.querySelector(".confirm-card");
	if (!card) return;
	const bodyStyle = window.getComputedStyle(document.body);
	const bodyPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
	const cardHeight = Math.ceil(card.getBoundingClientRect().height);
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
	}
};

const renderTasks = (tasks = []) => {
	listEl.innerHTML = "";
	currentTasks = tasks.filter((task) => task?.id);

	if (!currentTasks.length) {
		summaryEl.textContent = "No tasks selected.";
		confirmBtn.disabled = true;
		confirmBtn.blur();
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
	// Wait for layout + ResizeObserver to fire, then signal the main process to show
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			ipcRenderer.send("confirm-dialog-ready");
		});
	});
});

const renderListStatus = (payload) => {
	if (!listStatusSection) return;
	const isCompletion = currentConfig.confirmEvent === "completion-confirmation-confirmed";
	if (!isCompletion) return;

	const lists = payload?.lists;
	if (!Array.isArray(lists) || lists.length === 0) {
		listStatusSection.classList.remove("visible");
		listsBlocked = false;
		confirmBtn.disabled = false;
		return;
	}

	listStatusSection.innerHTML = "";
	listStatusSection.classList.add("visible");

	const header = document.createElement("p");
	header.className = "list-status-header";
	header.textContent = "Checklist progress";
	listStatusSection.appendChild(header);

	let totalRequired = 0;
	let totalCompleted = 0;

	for (const bundle of lists) {
		if (!bundle.run) continue;
		const reqTotal = bundle.run.required_total ?? 0;
		const reqDone = bundle.run.required_completed ?? 0;
		totalRequired += reqTotal;
		totalCompleted += reqDone;

		if (reqTotal === 0) continue;

		const pct = Math.round((reqDone / reqTotal) * 100);
		const done = reqDone >= reqTotal;

		const item = document.createElement("div");
		item.className = "list-status-item";

		const name = document.createElement("span");
		name.className = "list-status-name";
		name.textContent = bundle.definition?.title ?? "List";
		item.appendChild(name);

		const bar = document.createElement("div");
		bar.className = "list-status-progress-bar";
		const fill = document.createElement("div");
		fill.className = `list-status-progress-fill ${done ? "complete" : "incomplete"}`;
		fill.style.width = `${pct}%`;
		bar.appendChild(fill);
		item.appendChild(bar);

		const count = document.createElement("span");
		count.className = "list-status-count";
		count.textContent = `${reqDone}/${reqTotal}`;
		item.appendChild(count);

		listStatusSection.appendChild(item);
	}

	const hasIncomplete = totalRequired > 0 && totalCompleted < totalRequired;
	listsBlocked = hasIncomplete;

	if (hasIncomplete) {
		const msg = document.createElement("div");
		msg.className = "list-status-blocked-msg";
		msg.textContent = `${totalRequired - totalCompleted} required item${totalRequired - totalCompleted === 1 ? "" : "s"} still incomplete. Complete all required checklist items before finishing this task.`;
		listStatusSection.appendChild(msg);
		confirmBtn.disabled = true;
		confirmBtn.blur();
	} else {
		confirmBtn.disabled = !currentTasks.length;
	}
};

ipcRenderer.on("confirm-dialog-lists-data", (_, payload) => {
	renderListStatus(payload);
});

confirmBtn?.addEventListener("click", () => {
	if (confirmBtn.disabled || listsBlocked) return;
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
		}
	},
	getExcludedTags: () => currentTags,
	onCustomEnter: addTag,
});

// Automatically resize the window whenever the card's content changes size
const cardEl = document.querySelector(".confirm-card");
if (cardEl) {
	new ResizeObserver(() => resizeWindow()).observe(cardEl);
}
