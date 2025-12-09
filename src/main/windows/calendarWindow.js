import { BrowserWindow, screen } from "electron";

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 820;

export function createCalendarWindow({ screenIndex, onClose } = {}) {
	const allDisplays = screen.getAllDisplays();
	const normalizedIndex = Number.isInteger(screenIndex)
		? Math.min(Math.max(screenIndex, 0), allDisplays.length - 1)
		: undefined;
	const targetDisplay = allDisplays.length
		? allDisplays[normalizedIndex ?? 0]
		: screen.getPrimaryDisplay();
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: BASE_WIDTH,
		height: BASE_HEIGHT,
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
