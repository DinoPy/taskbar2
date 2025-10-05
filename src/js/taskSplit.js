const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;

let taskData = null;
let splits = [];
let maxDuration = 0; // Maximum duration in seconds

// DOM Elements
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskDuration = document.getElementById('taskDuration');
const remainingDuration = document.getElementById('remainingDuration');
const addSplitBtn = document.getElementById('addSplitBtn');
const splitsTableBody = document.getElementById('splitsTableBody');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');

// Initialize the window
document.addEventListener("DOMContentLoaded", () => {
	// Focus on the first input when window loads
	setTimeout(() => {
		const firstInput = document.querySelector('input[type="text"]');
		if (firstInput) firstInput.focus();
	}, 100);
});

// Receive task data from parent window
ipc.on('data-from-parent', (e, data) => {
	console.log('Received task data:', data); // Debug log
	taskData = data;
	populateTaskHeader();
	updateRemainingDuration();
});

function populateTaskHeader() {
	taskTitle.textContent = taskData.title;
	taskDescription.textContent = taskData.description || 'No description provided';
	
	// Duration is already in HH:MM:SS format from the server
	const durationString = taskData.duration;
	console.log('Duration string:', durationString); // Debug log
	
	if (!durationString || durationString === 'undefined') {
		console.error('Duration is undefined or missing');
		taskDuration.textContent = 'Duration: Not available';
		maxDuration = 0;
		return;
	}
	
	taskDuration.textContent = `Duration: ${durationString}`;
	
	// Convert duration from HH:MM:SS to seconds for validation
	const durationParts = durationString.split(':');
	if (durationParts.length !== 3) {
		console.error('Invalid duration format:', durationString);
		maxDuration = 0;
		return;
	}
	
	const hours = parseInt(durationParts[0]);
	const minutes = parseInt(durationParts[1]);
	const seconds = parseInt(durationParts[2]);
	maxDuration = (hours * 3600) + (minutes * 60) + seconds;
	
	console.log('Max duration in seconds:', maxDuration); // Debug log
}

function addSplit() {
	const splitId = `split_${Date.now()}`;
	const split = {
		id: splitId,
		title: '',
		description: '',
		duration: '00:00:00'
	};
	
	splits.push(split);
	renderSplitRow(split);
	updateRemainingDuration();
	updateSubmitButton();
}

function renderSplitRow(split) {
	const row = document.createElement('tr');
	row.id = `row_${split.id}`;
	
	row.innerHTML = `
		<td>
			<input type="text" 
				   class="split-title-input" 
				   data-split-id="${split.id}"
				   placeholder="Split task name"
				   value="${split.title}"
				   maxlength="100">
		</td>
		<td>
			<textarea class="split-description-input" 
					  data-split-id="${split.id}"
					  placeholder="Description (optional)"
					  rows="2">${split.description}</textarea>
		</td>
		<td>
			<input type="time" 
				   class="split-duration-input" 
				   data-split-id="${split.id}"
				   value="${split.duration}"
				   step="1">
		</td>
		<td>
			<button class="btn delete-btn" 
					data-split-id="${split.id}"
					title="Remove this split">
				×
			</button>
		</td>
	`;
	
	splitsTableBody.appendChild(row);
	
	// Add event listeners
	const titleInput = row.querySelector('.split-title-input');
	const descriptionInput = row.querySelector('.split-description-input');
	const durationInput = row.querySelector('.split-duration-input');
	const deleteBtn = row.querySelector('.delete-btn');
	
	titleInput.addEventListener('input', (e) => {
		split.title = e.target.value;
		updateSubmitButton();
	});
	
	descriptionInput.addEventListener('input', (e) => {
		split.description = e.target.value;
	});
	
	durationInput.addEventListener('input', (e) => {
		split.duration = e.target.value;
		updateRemainingDuration();
		updateSubmitButton();
	});
	
	deleteBtn.addEventListener('click', () => {
		removeSplit(split.id);
	});
}

function removeSplit(splitId) {
	splits = splits.filter(split => split.id !== splitId);
	const row = document.getElementById(`row_${splitId}`);
	if (row) {
		row.remove();
	}
	updateRemainingDuration();
	updateSubmitButton();
}

function updateRemainingDuration() {
	const totalUsedSeconds = splits.reduce((total, split) => {
		const [hours, minutes, seconds] = split.duration.split(':').map(Number);
		return total + (hours * 3600) + (minutes * 60) + seconds;
	}, 0);
	
	const remainingSeconds = maxDuration - totalUsedSeconds;
	
	// Format remaining time
	const hours = Math.floor(Math.abs(remainingSeconds) / 3600);
	const minutes = Math.floor((Math.abs(remainingSeconds) % 3600) / 60);
	const secs = Math.abs(remainingSeconds) % 60;
	
	const remainingString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	
	remainingDuration.textContent = `Remaining: ${remainingString}`;
	
	// Update styling based on remaining time
	remainingDuration.className = 'remaining-duration';
	if (remainingSeconds === 0) {
		remainingDuration.classList.add('success');
		remainingDuration.textContent = `✓ Ready to split!`;
	} else if (remainingSeconds < 0) {
		remainingDuration.classList.add('error');
	} else if (remainingSeconds < 300) { // Less than 5 minutes
		remainingDuration.classList.add('warning');
	}
}

function updateSubmitButton() {
	const hasValidSplits = splits.length > 0 && splits.every(split => 
		split.title.trim().length > 0 && split.duration !== '00:00:00'
	);
	
	const totalUsedSeconds = splits.reduce((total, split) => {
		const [hours, minutes, seconds] = split.duration.split(':').map(Number);
		return total + (hours * 3600) + (minutes * 60) + seconds;
	}, 0);
	
	// Only allow splitting when remaining duration is exactly 0
	const remainingSeconds = maxDuration - totalUsedSeconds;
	const isValidDuration = remainingSeconds === 0;
	
	submitBtn.disabled = !hasValidSplits || !isValidDuration;
}

function validateSplits() {
	const errors = [];
	
	if (splits.length === 0) {
		errors.push('At least one split is required');
		return errors;
	}
	
	// Check for empty titles
	const emptyTitles = splits.filter(split => split.title.trim().length === 0);
	if (emptyTitles.length > 0) {
		errors.push('All splits must have a title');
	}
	
	// Check for zero duration splits
	const zeroDurationSplits = splits.filter(split => split.duration === '00:00:00');
	if (zeroDurationSplits.length > 0) {
		errors.push('All splits must have a duration greater than 00:00:00');
	}
	
	// Check total duration - must be exactly equal to original task duration
	const totalUsedSeconds = splits.reduce((total, split) => {
		const [hours, minutes, seconds] = split.duration.split(':').map(Number);
		return total + (hours * 3600) + (minutes * 60) + seconds;
	}, 0);
	
	const remainingSeconds = maxDuration - totalUsedSeconds;
	if (remainingSeconds > 0) {
		errors.push(`You must use the full duration. ${formatDuration(remainingSeconds)} remaining.`);
	} else if (remainingSeconds < 0) {
		errors.push(`Total duration (${formatDuration(totalUsedSeconds)}) exceeds original task duration (${formatDuration(maxDuration)})`);
	}
	
	return errors;
}

function formatDuration(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function handleSubmit() {
	const errors = validateSplits();
	
	if (errors.length > 0) {
		alert('Please fix the following errors:\n\n' + errors.join('\n'));
		return;
	}
	
	// Format splits for server
	const formattedSplits = splits.map(split => ({
		title: split.title.trim(),
		description: split.description.trim(),
		duration: split.duration
	}));
	
	// Send to main process
	ipc.send('task-split-submission', {
		task_id: taskData.id,
		splits: formattedSplits
	});
}

function handleCancel() {
	ipc.send('close-children-window');
}

// Event Listeners
addSplitBtn.addEventListener('click', addSplit);

submitBtn.addEventListener('click', handleSubmit);

closeBtn.addEventListener('click', handleCancel);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
	// Ctrl/Cmd + Enter to submit
	if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
		e.preventDefault();
		handleSubmit();
	}
	
	// Escape to cancel
	if (e.key === 'Escape') {
		e.preventDefault();
		handleCancel();
	}
});

// Add initial split when window loads
setTimeout(() => {
	if (splits.length === 0) {
		addSplit();
	}
}, 100);
