import { BrowserWindow, screen } from "electron";

const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 320;

export function createDeleteConfirmWindow({
	tasks = [],
	onClose,
} = {}) {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);

	const win = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor((activeDisplay.bounds.width - WINDOW_WIDTH) / 2),
		y: activeDisplay.bounds.y + Math.floor((activeDisplay.bounds.height - WINDOW_HEIGHT) / 2),
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		minimizable: false,
		resizable: false,
		modal: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		transparent: true,
		skipTaskbar: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	win.loadFile("src/html/deleteConfirm.html");
	win.setMenuBarVisibility(false);

	const sendData = () => {
		win.webContents.send("delete-confirm-data", { tasks });
	};

	win.webContents.once("did-finish-load", () => {
		sendData();
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
