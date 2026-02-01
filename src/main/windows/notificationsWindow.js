import { BrowserWindow } from "electron";

const DEFAULT_WIDTH = 420;

export function createNotificationsWindow({
	x = 0,
	y = 0,
	height = 0,
	onClose,
}) {
	const win = new BrowserWindow({
		x,
		y,
		width: DEFAULT_WIDTH,
		height,
		show: false,
		frame: false,
		resizable: false,
		movable: false,
		fullscreenable: false,
		focusable: true,
		skipTaskbar: true,
		minimizable: false,
		maximizable: false,
		alwaysOnTop: true,
		title: "Notifications",
		backgroundColor: "#1f1f1f",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/notifications.html");
	win.setMenuBarVisibility(false);

	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
