const { ipcRenderer } = window.require("electron");

let currentTasks = [];

const summaryEl = document.getElementById("deleteConfirmSummary");
const listEl = document.getElementById("deleteConfirmList");
const confirmBtn = document.getElementById("deleteConfirmBtn");
const cancelBtn = document.getElementById("deleteCancelBtn");

const renderTasks = (tasks = []) => {
	currentTasks = tasks.filter((task) => task && task.id);

	if (currentTasks.length === 0) {
		summaryEl.textContent = "No tasks selected for deletion.";
		listEl.innerHTML = "";
		confirmBtn.disabled = true;
		return;
	}

	confirmBtn.disabled = false;

	if (currentTasks.length === 1) {
		summaryEl.textContent = `You're about to delete "${currentTasks[0].title || "Untitled task"}".`;
	} else {
		summaryEl.textContent = `You're about to delete ${currentTasks.length} tasks:`;
	}

	listEl.innerHTML = "";
	currentTasks.forEach((task) => {
		const item = document.createElement("li");
		item.textContent = task.title || `Task ${task.id}`;
		listEl.appendChild(item);
	});
};

ipcRenderer.on("delete-confirm-data", (_event, payload) => {
	const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
	renderTasks(tasks);
});

confirmBtn.addEventListener("click", () => {
	if (currentTasks.length === 0) return;
	ipcRenderer.send("delete-confirmation-confirmed", { tasks: currentTasks });
});

cancelBtn.addEventListener("click", () => {
	ipcRenderer.send("delete-confirmation-cancelled");
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		ipcRenderer.send("delete-confirmation-cancelled");
	}
});
