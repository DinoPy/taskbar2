const { ipcRenderer } = window.require("electron");

/**
 * Renders a compact list summary widget for embedding in various windows.
 *
 * @param {{ lists: Array, target: { kind: string, id: string } }} options
 * @returns {HTMLElement}
 */
export function renderListSummary({ lists, target }) {
	const container = document.createElement("div");
	container.className = "list-summary";

	if (!Array.isArray(lists) || lists.length === 0) {
		// No lists state
		const label = document.createElement("span");
		label.className = "list-summary-label";
		label.textContent = "Lists";

		const none = document.createElement("span");
		none.className = "list-summary-none";
		none.textContent = "None";

		const addBtn = document.createElement("button");
		addBtn.type = "button";
		addBtn.className = "list-summary-btn";
		addBtn.textContent = "Add";
		addBtn.addEventListener("click", () => {
			ipcRenderer.send("open-list-window", { target });
		});

		container.appendChild(label);
		container.appendChild(none);
		container.appendChild(addBtn);
		return container;
	}

	// Aggregate progress across all runs
	let requiredCompleted = 0;
	let requiredTotal = 0;

	for (const bundle of lists) {
		if (bundle.run) {
			requiredCompleted += bundle.run.required_completed ?? 0;
			requiredTotal += bundle.run.required_total ?? 0;
		}
	}

	const percentage = requiredTotal > 0 ? Math.round((requiredCompleted / requiredTotal) * 100) : 0;

	const countLabel = document.createElement("span");
	countLabel.className = "list-summary-label";
	countLabel.textContent = lists.length === 1 ? "1 List" : `${lists.length} Lists`;

	const progressBarWrapper = document.createElement("div");
	progressBarWrapper.className = "list-summary-progress-bar";

	const progressBarFill = document.createElement("div");
	progressBarFill.className = "list-summary-progress-fill";
	progressBarFill.style.width = `${percentage}%`;
	if (percentage === 100) {
		progressBarFill.classList.add("complete");
	}
	progressBarWrapper.appendChild(progressBarFill);

	const progressText = document.createElement("span");
	progressText.className = "list-summary-progress-text";
	progressText.textContent = requiredTotal > 0
		? `${requiredCompleted}/${requiredTotal} (${percentage}%)`
		: "No required items";

	const openBtn = document.createElement("button");
	openBtn.type = "button";
	openBtn.className = "list-summary-btn";
	openBtn.textContent = lists.length > 1 ? "Manage" : "Open";
	openBtn.addEventListener("click", () => {
		ipcRenderer.send("open-list-window", { target });
	});

	container.appendChild(countLabel);
	container.appendChild(progressBarWrapper);
	container.appendChild(progressText);
	container.appendChild(openBtn);
	return container;
}

/**
 * Creates a <style> element with self-contained CSS for the list summary widget.
 * @returns {HTMLStyleElement}
 */
export function createListSummaryStyles() {
	const style = document.createElement("style");
	style.textContent = `
		.list-summary {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 10px;
			border-radius: 6px;
			background: oklch(0.28 0.04 80);
			border: 1px solid oklch(0.40 0.06 80 / 0.5);
			margin: 8px 0;
			font-size: 12px;
			min-height: 28px;
		}

		.list-summary-label {
			color: oklch(0.80 0.06 80);
			font-weight: 600;
			white-space: nowrap;
			flex-shrink: 0;
		}

		.list-summary-none {
			color: oklch(0.60 0.03 80);
			font-style: italic;
			flex: 1;
		}

		.list-summary-progress-bar {
			flex: 1;
			height: 6px;
			background: oklch(0.35 0.03 80);
			border-radius: 3px;
			overflow: hidden;
			min-width: 60px;
		}

		.list-summary-progress-fill {
			height: 100%;
			background: oklch(0.65 0.15 145);
			border-radius: 3px;
			transition: width 0.3s ease;
		}

		.list-summary-progress-fill.complete {
			background: oklch(0.70 0.18 145);
		}

		.list-summary-progress-text {
			color: oklch(0.75 0.04 80);
			white-space: nowrap;
			flex-shrink: 0;
			font-size: 11px;
			font-variant-numeric: tabular-nums;
		}

		.list-summary-btn {
			background: oklch(0.40 0.08 80);
			color: oklch(0.90 0.04 80);
			border: 1px solid oklch(0.50 0.08 80 / 0.5);
			border-radius: 4px;
			padding: 2px 10px;
			font-size: 11px;
			font-weight: 500;
			cursor: pointer;
			white-space: nowrap;
			flex-shrink: 0;
			transition: background 0.15s ease;
		}

		.list-summary-btn:hover {
			background: oklch(0.48 0.10 80);
		}

		.list-summary-btn:active {
			background: oklch(0.36 0.08 80);
		}

		.list-summary-error-toast {
			position: fixed;
			bottom: 16px;
			left: 50%;
			transform: translateX(-50%);
			background: oklch(0.35 0.15 25);
			color: oklch(0.92 0.04 25);
			padding: 8px 18px;
			border-radius: 6px;
			font-size: 13px;
			font-weight: 500;
			z-index: 9999;
			box-shadow: 0 4px 16px oklch(0 0 0 / 0.4);
			pointer-events: none;
			opacity: 1;
			transition: opacity 0.4s ease;
		}

		.list-summary-error-toast.fade-out {
			opacity: 0;
		}
	`;
	return style;
}
