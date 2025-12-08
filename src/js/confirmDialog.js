const { ipcRenderer } = window.require("electron");

let currentTasks = [];
let currentConfig = {
	title: "Confirm action",
	summary: "",
	confirmLabel: "Confirm",
	cancelLabel: "Cancel",
	confirmEvent: "delete-confirmation-confirmed",
	cancelEvent: "delete-confirmation-cancelled",
};

const headingEl = document.querySelector(".confirm-card h1");
const summaryEl = document.getElementById("deleteConfirmSummary");
const listEl = document.getElementById("deleteConfirmList");
const confirmBtn = document.getElementById("deleteConfirmBtn");
const cancelBtn = document.getElementById("deleteCancelBtn");

const renderTasks = (tasks = []) => {
	currentTasks = tasks.filter((task) => task && task.id);

	if (currentTasks.length === 0) {
		summaryEl.textContent = "No tasks selected.";
		listEl.innerHTML = "";
		confirmBtn.disabled = true;
		confirmBtn.blur();
		adjustWindowSize();
		return;
	}

	confirmBtn.disabled = false;
	confirmBtn.focus({ preventScroll: true });

	if (currentTasks.length === 1) {
		summaryEl.textContent = currentConfig.summary || `You're about to ${currentConfig.title?.toLowerCase() ?? "complete"} "${currentTasks[0].title || "Untitled task"}".`;
	} else {
		summaryEl.textContent =
			currentConfig.summary ||
			`You're about to ${currentConfig.title?.toLowerCase() ?? "complete"} ${currentTasks.length} tasks:`;
	}

	listEl.innerHTML = "";
	currentTasks.forEach((task) => {
		const item = document.createElement("li");
		item.textContent = task.title || `Task ${task.id}`;
		listEl.appendChild(item);
	});

	adjustWindowSize();
};

const adjustWindowSize = () => {
	const height = document.documentElement.scrollHeight + 24;
	ipcRenderer.send("confirm-dialog-resize", { height });
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
	const config = payload?.config ?? {};
	applyConfig(config);
	renderTasks(Array.isArray(payload?.tasks) ? payload.tasks : []);
});

confirmBtn.addEventListener("click", () => {
	if (confirmBtn.disabled) return;
	ipcRenderer.send(currentConfig.confirmEvent, {
		tasks: currentTasks,
	});
});

cancelBtn.addEventListener("click", () => {
	ipcRenderer.send(currentConfig.cancelEvent);
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		event.preventDefault();
		ipcRenderer.send(currentConfig.cancelEvent);
	}
});
