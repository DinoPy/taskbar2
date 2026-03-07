import { BrowserWindow, screen } from "electron";

export const createTaskSplitWindow = ({
	props,
	onReadyToShow,
	onClose,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const splitWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 700 / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.1),
		width: 800,
		minHeight: 600,
		minimizable: false,
		resizable: true,
		modal: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		transparent: true,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});
	splitWindow.setBackgroundColor("#faf9f7");
	splitWindow.loadFile("src/html/taskSplit.html");

	splitWindow.webContents.once("dom-ready", async () => {
		const height = await splitWindow.webContents.executeJavaScript(
			"document.body.offsetHeight"
		);

		splitWindow.setSize(700, Math.max(height + 27, 500));
		splitWindow.show();
	});

	splitWindow.webContents.once("did-finish-load", () => {
		splitWindow.webContents.send("data-from-parent", props);
	});

	if (onReadyToShow) {
		splitWindow.on("ready-to-show", onReadyToShow);
	} else {
		splitWindow.on("ready-to-show", () => splitWindow.focus());
	}

	if (onClose) {
		splitWindow.on("close", onClose);
	}

	return splitWindow;
};
