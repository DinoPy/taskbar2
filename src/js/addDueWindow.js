import {
	parseChrono,
	ensureDefaultTime,
} from "../common-language-parser/src/parser-browser.js";

const { ipcRenderer } = window.require("electron");

const taskTitleEl = document.getElementById("taskTitle");
const dateInput = document.getElementById("dateInput");
const datePreview = document.getElementById("datePreview");
const showBeforeHours = document.getElementById("showBeforeHours");
const showBeforeMinutes = document.getElementById("showBeforeMinutes");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");

let taskData = null;
let parsedDate = null;

ipcRenderer.on("add-due-data", (_, data) => {
	taskData = data;
	if (taskData?.title) {
		taskTitleEl.textContent = taskData.title;
	}
	dateInput.focus();
});

const updatePreview = () => {
	const text = dateInput.value.trim();
	if (!text) {
		datePreview.innerHTML = "&nbsp;";
		datePreview.className = "add-due-preview";
		parsedDate = null;
		return;
	}

	const now = new Date();
	const chronoResult = parseChrono(text, now);

	if (chronoResult) {
		ensureDefaultTime(chronoResult);
		const date = chronoResult.date();
		parsedDate = date;
		datePreview.textContent = date.toLocaleString();
		datePreview.className = "add-due-preview valid";
	} else {
		parsedDate = null;
		datePreview.textContent = "Could not parse date";
		datePreview.className = "add-due-preview invalid";
	}
};

dateInput.addEventListener("input", updatePreview);

const submit = () => {
	if (!parsedDate || !taskData) return;

	const hours = parseInt(showBeforeHours.value, 10) || 0;
	const minutes = parseInt(showBeforeMinutes.value, 10) || 0;
	const totalMinutes = hours * 60 + minutes;

	ipcRenderer.send("add-due-submit", {
		...taskData,
		due_at: parsedDate.toISOString(),
		show_before_due_time: totalMinutes,
		last_modified_at: +new Date(),
	});
};

const cancel = () => {
	ipcRenderer.send("add-due-close");
};

submitBtn.addEventListener("click", submit);
cancelBtn.addEventListener("click", cancel);

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		cancel();
	} else if (e.key === "Enter") {
		submit();
	}
});
