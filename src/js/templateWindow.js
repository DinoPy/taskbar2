const { ipcRenderer: ipc } = require("electron");

// ---- State ----
let templates = [];
let selectedId = null;
let isNewMode = false;
let searchDebounce = null;
let statusTimeout = null;
let tags = [];

const VAR_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

// ---- DOM refs ----
const closeBtn = document.getElementById("closeBtn");
const searchInput = document.getElementById("searchInput");
const templateList = document.getElementById("templateList");
const newTemplateBtn = document.getElementById("newTemplateBtn");
const editorPanel = document.getElementById("editorPanel");
const editorEmpty = document.getElementById("editorEmpty");
const editorForm = document.getElementById("editorForm");
const tplTitle = document.getElementById("tplTitle");
const tplDescription = document.getElementById("tplDescription");
const tplCategory = document.getElementById("tplCategory");
const tplTagsInput = document.getElementById("tplTagsInput");
const tplTagsAddBtn = document.getElementById("tplTagsAddBtn");
const tplTagsList = document.getElementById("tplTagsList");
const tplPriority = document.getElementById("tplPriority");
const tplShowBeforeH = document.getElementById("tplShowBeforeH");
const tplShowBeforeM = document.getElementById("tplShowBeforeM");
const tplDueOffsetH = document.getElementById("tplDueOffsetH");
const tplDueOffsetM = document.getElementById("tplDueOffsetM");
const tplVarsList = document.getElementById("tplVarsList");
const tplVarsAddBtn = document.getElementById("tplVarsAddBtn");
const manageListsBtn = document.getElementById("manageListsBtn");
const useTemplateBtn = document.getElementById("useTemplateBtn");
const deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
const saveTemplateBtn = document.getElementById("saveTemplateBtn");
const tplStatus = document.getElementById("tplStatus");

function showStatus(message, type = "success") {
	clearTimeout(statusTimeout);
	tplStatus.textContent = message;
	tplStatus.className = `tpl-status visible ${type}`;
	statusTimeout = setTimeout(() => {
		tplStatus.className = "tpl-status";
	}, 2500);
}

// ---- Init ----
ipc.send("template-list");

// ---- IPC Listeners ----
ipc.on("template-list", (_, data) => {
	templates = Array.isArray(data) ? data : [];
	renderList();
	if (selectedId) {
		const still = templates.find((t) => t.id === selectedId);
		if (still) loadEditor(still);
		else clearEditor();
	}
});

ipc.on("template-search", (_, data) => {
	templates = Array.isArray(data) ? data : [];
	renderList();
});

ipc.on("template-created", (_, tpl) => {
	if (!tpl?.id) return;
	const idx = templates.findIndex((t) => t.id === tpl.id);
	if (idx >= 0) templates[idx] = tpl;
	else templates.unshift(tpl);
	renderList();
	if (isNewMode) {
		isNewMode = false;
		selectedId = tpl.id;
		loadEditor(tpl);
		showStatus("Template created");
	}
});

ipc.on("template-updated", (_, tpl) => {
	if (!tpl?.id) return;
	const idx = templates.findIndex((t) => t.id === tpl.id);
	if (idx >= 0) templates[idx] = tpl;
	else templates.unshift(tpl);
	renderList();
	if (selectedId === tpl.id) {
		loadEditor(tpl);
		showStatus("Template saved");
	}
});

ipc.on("template-deleted", (_, data) => {
	const id = data?.id;
	if (!id) return;
	templates = templates.filter((t) => t.id !== id);
	renderList();
	showStatus("Template deleted");
	if (selectedId === id) clearEditor();
});

ipc.on("socket-reconnected", () => {
	ipc.send("template-list");
});

ipc.on("lists-surface-updated", (_, data) => {
	const target = data?.target;
	if (target?.kind !== "task_template") return;
	const tpl = templates.find((t) => t.id === target.id);
	if (tpl) {
		tpl.rev = (tpl.rev || 0) + 1;
	}
});

// ---- List rendering ----
function renderList() {
	templateList.innerHTML = "";
	if (templates.length === 0) {
		templateList.innerHTML = '<div class="tpl-list-empty">No templates found</div>';
		return;
	}
	templates.forEach((tpl) => {
		const card = document.createElement("div");
		card.className = "tpl-card" + (tpl.id === selectedId ? " active" : "");
		card.dataset.id = tpl.id;

		const title = document.createElement("div");
		title.className = "tpl-card-title";
		title.textContent = tpl.title;
		card.appendChild(title);

		const meta = document.createElement("div");
		meta.className = "tpl-card-meta";
		meta.textContent = tpl.category || "Life";
		if (tpl.variables?.length) {
			meta.textContent += ` \u00b7 ${tpl.variables.length} var${tpl.variables.length > 1 ? "s" : ""}`;
		}
		card.appendChild(meta);

		card.addEventListener("click", () => {
			isNewMode = false;
			selectedId = tpl.id;
			loadEditor(tpl);
			renderList();
		});

		templateList.appendChild(card);
	});
}

// ---- Editor ----
function clearEditor() {
	selectedId = null;
	isNewMode = false;
	editorForm.style.display = "none";
	editorEmpty.style.display = "flex";
}

function loadEditor(tpl) {
	editorEmpty.style.display = "none";
	editorForm.style.display = "flex";

	tplTitle.value = tpl.title || "";
	tplDescription.value = tpl.description || "";
	tplCategory.value = tpl.category || "";
	tplPriority.value = tpl.priority?.Valid ? tpl.priority.Int32 : "";

	const showBefore = tpl.show_before_due_time || 0;
	tplShowBeforeH.value = Math.floor(showBefore / 60);
	tplShowBeforeM.value = showBefore % 60;

	const dueOffset = tpl.due_offset_minutes?.Valid ? tpl.due_offset_minutes.Int32 : 0;
	tplDueOffsetH.value = Math.floor(dueOffset / 60);
	tplDueOffsetM.value = dueOffset % 60;

	tags = Array.isArray(tpl.tags) ? [...tpl.tags] : [];
	renderTags();

	renderVariables(tpl.variables || []);

	deleteTemplateBtn.style.display = isNewMode ? "none" : "inline-block";
	manageListsBtn.style.display = isNewMode ? "none" : "inline-block";
	useTemplateBtn.style.display = isNewMode ? "none" : "inline-block";
}

function loadEmptyEditor() {
	editorEmpty.style.display = "none";
	editorForm.style.display = "flex";
	tplTitle.value = "";
	tplDescription.value = "";
	tplCategory.value = "";
	tplPriority.value = "";
	tplShowBeforeH.value = "0";
	tplShowBeforeM.value = "0";
	tplDueOffsetH.value = "0";
	tplDueOffsetM.value = "0";
	tags = [];
	renderTags();
	renderVariables([]);
	deleteTemplateBtn.style.display = "none";
	manageListsBtn.style.display = "none";
	useTemplateBtn.style.display = "none";
	tplTitle.focus();
}

// ---- Tags ----
function renderTags() {
	tplTagsList.innerHTML = "";
	tags.forEach((tag, i) => {
		const el = document.createElement("span");
		el.className = "tpl-tag";
		el.textContent = tag;
		el.title = "Click to remove";
		el.addEventListener("click", () => {
			tags.splice(i, 1);
			renderTags();
		});
		tplTagsList.appendChild(el);
	});
}

function addTag() {
	const val = tplTagsInput.value.trim();
	if (val && !tags.includes(val)) {
		tags.push(val);
		renderTags();
	}
	tplTagsInput.value = "";
	tplTagsInput.focus();
}

tplTagsAddBtn.addEventListener("click", addTag);
tplTagsInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") { e.preventDefault(); addTag(); }
});

// ---- Variables ----
function renderVariables(vars) {
	tplVarsList.innerHTML = "";
	vars.forEach((v) => addVariableRow(v));
}

function addVariableRow(v = {}) {
	const row = document.createElement("div");
	row.className = "tpl-var-row";

	const keyInput = document.createElement("input");
	keyInput.type = "text";
	keyInput.placeholder = "key";
	keyInput.value = v.key || "";
	keyInput.dataset.field = "key";
	row.appendChild(keyInput);

	const labelInput = document.createElement("input");
	labelInput.type = "text";
	labelInput.placeholder = "label";
	labelInput.value = v.label || "";
	labelInput.dataset.field = "label";
	row.appendChild(labelInput);

	const descInput = document.createElement("input");
	descInput.type = "text";
	descInput.placeholder = "description";
	descInput.value = v.description || "";
	descInput.dataset.field = "description";
	row.appendChild(descInput);

	const removeBtn = document.createElement("button");
	removeBtn.className = "tpl-var-remove-btn";
	removeBtn.textContent = "\u00d7";
	removeBtn.type = "button";
	removeBtn.addEventListener("click", () => row.remove());
	row.appendChild(removeBtn);

	tplVarsList.appendChild(row);
}

tplVarsAddBtn.addEventListener("click", () => addVariableRow());

// ---- Collect form data ----
function collectFormData() {
	const title = tplTitle.value.trim();
	if (!title) {
		tplTitle.focus();
		return null;
	}

	const variables = [];
	const seenKeys = new Set();
	let varError = null;
	tplVarsList.querySelectorAll(".tpl-var-row").forEach((row) => {
		const key = row.querySelector('[data-field="key"]').value.trim();
		if (!key) return;
		if (!VAR_KEY_REGEX.test(key)) {
			varError = `Invalid variable key "${key}" — must start with a letter, then letters/digits/underscores`;
			return;
		}
		if (seenKeys.has(key)) {
			varError = `Duplicate variable key "${key}"`;
			return;
		}
		seenKeys.add(key);
		const obj = { key };
		const label = row.querySelector('[data-field="label"]').value.trim();
		const desc = row.querySelector('[data-field="description"]').value.trim();
		if (label) obj.label = label;
		if (desc) obj.description = desc;
		variables.push(obj);
	});

	if (varError) {
		showStatus(varError, "error");
		return null;
	}

	const priorityVal = parseInt(tplPriority.value, 10);
	const showBefore = (parseInt(tplShowBeforeH.value, 10) || 0) * 60 + (parseInt(tplShowBeforeM.value, 10) || 0);
	const dueOffsetTotal = (parseInt(tplDueOffsetH.value, 10) || 0) * 60 + (parseInt(tplDueOffsetM.value, 10) || 0);

	const data = {
		title,
		description: tplDescription.value.trim(),
		category: tplCategory.value.trim() || "Life",
		tags: [...tags],
		priority: Number.isFinite(priorityVal) && priorityVal >= 1 && priorityVal <= 10 ? priorityVal : null,
		show_before_due_time: showBefore,
		due_offset_minutes: dueOffsetTotal > 0 ? dueOffsetTotal : null,
		variables,
		last_modified_at: Date.now(),
	};

	return data;
}

// ---- Save ----
editorForm.addEventListener("submit", (e) => {
	e.preventDefault();
	const data = collectFormData();
	if (!data) return;

	if (isNewMode) {
		ipc.send("template-create", data);
	} else if (selectedId) {
		data.id = selectedId;
		ipc.send("template-edit", data);
	}
});

// ---- Delete ----
deleteTemplateBtn.addEventListener("click", () => {
	if (!selectedId) return;
	if (!confirm("Delete this template?")) return;
	ipc.send("template-delete", { id: selectedId });
});

// ---- New template ----
newTemplateBtn.addEventListener("click", () => {
	isNewMode = true;
	selectedId = null;
	loadEmptyEditor();
	renderList();
});

// ---- Manage Lists ----
manageListsBtn.addEventListener("click", () => {
	if (!selectedId) return;
	ipc.send("open-list-window", {
		target: { kind: "task_template", id: selectedId },
	});
});

// ---- Use Template ----
useTemplateBtn.addEventListener("click", () => {
	if (!selectedId) return;
	const tpl = templates.find((t) => t.id === selectedId);
	if (!tpl) return;
	ipc.send("open-variable-prompt", { template: tpl });
});

// ---- Search ----
searchInput.addEventListener("input", () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(() => {
		const query = searchInput.value.trim();
		if (query) {
			ipc.send("template-search", { search_query: query });
		} else {
			ipc.send("template-list");
		}
	}, 250);
});

// ---- Close ----
closeBtn.addEventListener("click", () => {
	window.close();
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") window.close();
});
