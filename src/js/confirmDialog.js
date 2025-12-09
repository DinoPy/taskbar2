const { ipcRenderer } = window.require("electron");

let currentConfig = {
	title: "Confirm action",
	summary: "",
	confirmLabel: "Confirm",
	cancelLabel: "Cancel",
	confirmEvent: "confirmation-confirmed",
	cancelEvent: "confirmation-cancelled",
};
let currentTasks = [];

const headingEl = document.querySelector(".confirm-card h1");
const summaryEl = document.getElementById("deleteConfirmSummary");
const listEl = document.getElementById("deleteConfirmList");
const confirmBtn = document.getElementById("deleteConfirmBtn");
const cancelBtn = document.getElementById("deleteCancelBtn");

const resizeWindow = () => {
	const height = document.documentElement.scrollHeight + 28;
	ipcRenderer.send("confirm-dialog-resize", { height });
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
	renderTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
});

confirmBtn?.addEventListener("click", () => {
	if (confirmBtn.disabled) return;
	ipcRenderer.send(currentConfig.confirmEvent, { tasks: currentTasks });
});

cancelBtn?.addEventListener("click", () => {
	ipcRenderer.send(currentConfig.cancelEvent);
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		event.preventDefault();
		ipcRenderer.send(currentConfig.cancelEvent);
	}
});
