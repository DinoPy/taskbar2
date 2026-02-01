import { BrowserWindow, screen, ipcMain } from "electron";

const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 320;

export function createCompletionConfirmWindow({
	task,
	allTags = [],
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
		hasShadow: false,
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

	const handleResizeRequest = (_, payload) => {
		if (!payload?.height) return;
		const targetHeight = Math.min(Math.max(payload.height, 240), 640);
		win.setSize(WINDOW_WIDTH, targetHeight);
	};

	ipcMain.on("confirm-dialog-resize", handleResizeRequest);

	const sendTask = () => {
		if (!task) return;
		win.webContents.send("confirm-dialog-data", {
			config: {
				title: "Complete task?",
				summary: "Are you sure you're done with this task? Make sure you didn’t forget anything.",
				confirmLabel: "Yes, I'm done",
				cancelLabel: "Cancel",
				confirmEvent: "completion-confirmation-confirmed",
				cancelEvent: "completion-confirmation-cancelled",
			},
			tasks: [task],
			allTags,
		});
	};

	win.webContents.once("did-finish-load", () => {
		sendTask();
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		ipcMain.removeListener("confirm-dialog-resize", handleResizeRequest);
		onClose?.();
	});

	return win;
}
