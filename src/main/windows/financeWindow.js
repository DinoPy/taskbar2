import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export function createFinanceWindow({ screenIndex, onClose } = {}) {
	const allDisplays = screen.getAllDisplays();
	const normalizedIndex = Number.isInteger(screenIndex)
		? Math.min(Math.max(screenIndex, 0), allDisplays.length - 1)
		: 0;
	const targetDisplay = allDisplays[normalizedIndex] || screen.getPrimaryDisplay();
	const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - DEFAULT_WIDTH) / 2);
	const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - DEFAULT_HEIGHT) / 3);

	const win = new BrowserWindow({
		x: initialX,
		y: initialY,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		minWidth: 900,
		minHeight: 550,
		movable: true,
		show: true,
		frame: false,
		resizable: true,
		title: "Finance",
		backgroundColor: "#121B22",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile("src/html/finance.html");
	win.setMenuBarVisibility(false);
	win.on("closed", () => {
		onClose?.();
	});

	return win;
}
