import { BrowserWindow, screen, ipcMain } from "electron";

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

	const sendData = () => {
		win.webContents.send("confirm-dialog-data", {
			config: {
				title: "Delete task?",
				summary: tasks.length === 1
					? `You're about to delete "${tasks[0].title || "Untitled task"}".`
					: `You're about to delete ${tasks.length} tasks.`,
				confirmLabel: "Delete",
				cancelLabel: "Cancel",
				confirmEvent: "delete-confirmation-confirmed",
				cancelEvent: "delete-confirmation-cancelled",
			},
			tasks,
		});
	};

	ipcMain.on("confirm-dialog-resize", handleResizeRequest);

	win.webContents.once("did-finish-load", () => {
		sendData();
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		ipcMain.removeListener("delete-confirm-resize", handleResizeRequest);
 		onClose?.();
	});

	return win;
}
