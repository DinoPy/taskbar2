import { BrowserWindow, screen } from "electron";

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 820;
const DEFAULT_WIDTH = Math.round(BASE_WIDTH * 1.5);
const DEFAULT_HEIGHT = Math.round(BASE_HEIGHT * 1.3);

export function createCalendarWindow({ onClose } = {}) {
	const cursorPoint = screen.getCursorScreenPoint();
	const targetDisplay = screen.getDisplayNearestPoint(cursorPoint);
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 900,
		minHeight: 550,
		show: true,
		frame: false,
		resizable: true,
		title: "Scheduler Calendar",
		backgroundColor: "#10121a",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/calendar.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
