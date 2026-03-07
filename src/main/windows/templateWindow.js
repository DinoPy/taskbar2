import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;

export function createTemplateWindow({ screenIndex, onClose } = {}) {
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
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 700,
		minHeight: 450,
		movable: true,
		show: true,
		frame: false,
		resizable: true,
		title: "Task Templates",
		backgroundColor: "#faf9f7",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/templates.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
