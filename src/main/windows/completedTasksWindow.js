import { BrowserWindow, screen } from "electron";

export const createCompletedTasksWindow = ({
	onDidFinishLoad,
	onDomReady,
	onClose,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const completedTasksWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 1200 / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.15),
		width: 1400,
		height: 750,
		minimizable: false,
		resizable: false,
		modal: true,
		show: false,
		frame: false,
		alwaysOnTop: true,
		transparent: true,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	completedTasksWindow.setBackgroundColor = "#1b1d23";
	completedTasksWindow.loadFile("./src/html/completedTasks.html");

	if (onDidFinishLoad) {
		completedTasksWindow.webContents.once("did-finish-load", () => {
			onDidFinishLoad(completedTasksWindow);
		});
	}

	completedTasksWindow.webContents.once("dom-ready", async () => {
		completedTasksWindow.show();
		onDomReady?.(completedTasksWindow);
	});

	completedTasksWindow.on("close", () => {
		onClose?.();
	});

	return completedTasksWindow;
};
