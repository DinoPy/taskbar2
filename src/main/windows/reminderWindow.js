import { BrowserWindow, screen } from "electron";

const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 420;

const clampIndex = (index, max) => {
	if (!Number.isFinite(index)) return 0;
	if (index < 0) return 0;
	if (index >= max) return max - 1;
	return index;
};

export function createReminderWindow({
	screenIndex = 0,
	onClose,
} = {}) {
	const displays = screen.getAllDisplays();
	const safeIndex = clampIndex(screenIndex, displays.length || 1);
	const display = displays[safeIndex] ?? screen.getPrimaryDisplay();
	const frame = display.workArea ?? display.bounds;

	const x = Math.round(frame.x + (frame.width - WINDOW_WIDTH) / 2);
	const y = Math.round(frame.y + (frame.height - WINDOW_HEIGHT) / 2);

	const win = new BrowserWindow({
		x,
		y,
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		minWidth: 480,
		minHeight: 360,
		maximizable: false,
		minimizable: false,
		resizable: false,
		show: false,
		frame: false,
		transparent: true,
		skipTaskbar: true,
		alwaysOnTop: true,
		// vibrancy: process.platform === "darwin" ? "popover" : undefined,
		// visualEffectState: "followWindow",
		title: "Create Reminder",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
		// backgroundColor: "#00000000",
	});

	win.loadFile("src/html/reminder.html");
	win.setMenuBarVisibility(false);

	win.once("ready-to-show", () => {
		win.show();
		win.focus();
	});

	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
