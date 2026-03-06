import { BrowserWindow, screen, ipcMain } from "electron";

const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 320;

export function createCompletionConfirmWindow({
	task,
	allTags = [],
	onClose,
	listsController,
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

	let shown = false;

	const showWindow = () => {
		if (shown || win.isDestroyed()) return;
		shown = true;
		win.show();
		win.focus();
	};

	const handleResizeRequest = (event, payload) => {
		if (event.sender !== win.webContents) return;
		if (!payload?.height) return;
		const targetHeight = Math.min(Math.max(Math.ceil(payload.height), 240), 640);
		win.setContentSize(WINDOW_WIDTH, targetHeight);
	};

	const handleReady = (event) => {
		if (event.sender !== win.webContents) return;
		showWindow();
	};

	ipcMain.on("confirm-dialog-resize", handleResizeRequest);
	ipcMain.on("confirm-dialog-ready", handleReady);

	const sendTask = () => {
		if (!task) return;
		win.webContents.send("confirm-dialog-data", {
			config: {
				title: "Complete task?",
				summary: "Are you sure you're done with this task? Make sure you didn't forget anything.",
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

		// Fetch lists for the task so the dialog can show list status
		if (listsController && task?.id) {
			const windowRef = {
				_id: win.webContents.id,
				_pushFn: (channel, payload) => {
					if (!win.isDestroyed()) {
						win.webContents.send("confirm-dialog-lists-data", payload);
					}
				},
			};
			listsController.fetchForTarget(
				{ kind: "task", id: task.id },
				windowRef,
			);
			win._listsWindowRef = windowRef;
		}
	});

	// Fallback: show after 500ms if renderer never signals ready
	setTimeout(showWindow, 500);

	win.on("closed", () => {
		ipcMain.removeListener("confirm-dialog-resize", handleResizeRequest);
		ipcMain.removeListener("confirm-dialog-ready", handleReady);
		if (listsController && win._listsWindowRef) {
			listsController.unsubscribe(win._listsWindowRef);
		}
		onClose?.();
	});

	return win;
}
