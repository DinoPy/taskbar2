const { ipcRenderer: ipc } = require("electron");

let template = null;
let mode = "create_task";

const vpTitle = document.getElementById("vpTitle");
const vpFields = document.getElementById("vpFields");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");

ipc.on("variable-prompt-data", (_, data) => {
	template = data?.template ?? data;
	mode = data?.mode ?? "create_task";
	render();
});

function render() {
	if (!template) return;
	vpTitle.textContent = template.title || "Use Template";
	vpFields.innerHTML = "";

	const variables = template.variables || [];
	if (variables.length === 0) {
		submitForm();
		return;
	}

	variables.forEach((v, i) => {
		const field = document.createElement("div");
		field.className = "vp-field";

		const label = document.createElement("label");
		label.textContent = (v.label || v.key) + (v.required === false ? " (optional)" : "");
		label.setAttribute("for", `var-${v.key}`);
		field.appendChild(label);

		const input = document.createElement("input");
		input.type = "text";
		input.id = `var-${v.key}`;
		input.dataset.key = v.key;
		input.dataset.required = v.required !== false ? "true" : "false";
		input.placeholder = v.label || v.key;
		if (i === 0) input.autofocus = true;
		field.appendChild(input);

		vpFields.appendChild(field);
	});

	requestAnimationFrame(() => {
		const firstInput = vpFields.querySelector("input");
		firstInput?.focus();
	});
}

function collectVariables() {
	const variables = {};
	const inputs = vpFields.querySelectorAll("input[data-key]");
	let valid = true;

	inputs.forEach((input) => {
		const value = input.value.trim();
		const isRequired = input.dataset.required === "true";
		if (isRequired && !value) {
			input.classList.add("vp-error");
			valid = false;
		} else {
			input.classList.remove("vp-error");
		}
		if (value) {
			variables[input.dataset.key] = value;
		}
	});

	return { variables, valid };
}

function submitForm() {
	if (!template) return;

	const variables = template.variables || [];
	let vars = {};
	if (variables.length > 0) {
		const result = collectVariables();
		if (!result.valid) return;
		vars = result.variables;
	}

	ipc.send("variable-prompt-submit", {
		mode,
		template_use: {
			template_id: template.id,
			template_rev: template.rev,
			variables: vars,
		},
	});
}

submitBtn.addEventListener("click", submitForm);

cancelBtn.addEventListener("click", () => {
	ipc.send("variable-prompt-close");
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		ipc.send("variable-prompt-close");
	}
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		submitForm();
	}
});
