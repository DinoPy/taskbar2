import { BrowserWindow, screen } from "electron";

const WINDOW_WIDTH = 440;
const WINDOW_HEIGHT = 320;

export function createVariablePromptWindow({ template, mode, onClose } = {}) {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);

	const win = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor((activeDisplay.bounds.width - WINDOW_WIDTH) / 2),
		y: activeDisplay.bounds.y + Math.floor((activeDisplay.bounds.height - WINDOW_HEIGHT) / 2),
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		minimizable: false,
		resizable: true,
		minWidth: 360,
		minHeight: 200,
		modal: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		hasShadow: false,
		transparent: true,
		skipTaskbar: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	win.loadFile("src/html/variablePrompt.html");
	win.setMenuBarVisibility(false);

	win.webContents.once("did-finish-load", () => {
		win.webContents.send("variable-prompt-data", { template, mode: mode ?? "create_task" });
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
