export function createTasksController({
	appState,
	windowManager,
	sendEvent,
	getTaskbarWindow,
}) {
	const forwardToRenderer = (channel, payload) => {
		const taskbar = getTaskbarWindow();
		if (taskbar && !taskbar.isDestroyed()) {
			taskbar.webContents.send(channel, payload);
		}
	};

	const deleteTask = (props) => {
		forwardToRenderer("deleteTask", props);
		if (appState.openTaskProps && props.id === appState.openTaskProps.id) {
			appState.openTaskProps = null;
		}
	};

	const completeTask = (props) => {
		forwardToRenderer("completeTask", props);
		if (appState.openTaskProps && props.id === appState.openTaskProps.id) {
			appState.openTaskProps = null;
		}
	};

	const duplicateTask = (props) => {
		sendEvent("task_duplicate", {
			task_id: props.id,
		});
	};

	const refreshCompletedTasksIfOpen = () => {
		if (windowManager.getCompletedTasksWindow()) {
			setTimeout(() => {
				sendEvent("get_completed_tasks_v2", appState.fromCompletedData);
			}, 250);
			return true;
		}
		return false;
	};

	return {
		deleteTask,
		completeTask,
		duplicateTask,
		refreshCompletedTasksIfOpen,
	};
}
