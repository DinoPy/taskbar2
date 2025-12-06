import { BrowserWindow, screen } from "electron";

export const createKenbanWindow = ({ onClose } = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const kenbanWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width * 0.1),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.1),
		height: Math.floor(activeDisplay.bounds.height * 0.8),
		width: Math.floor(activeDisplay.bounds.width * 0.8),
		minimizable: true,
		resizable: true,
		show: true,
		frame: false,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	kenbanWindow.loadURL("https://dinodev-kenban.vercel.app");

	if (onClose) {
		kenbanWindow.on("close", onClose);
	}

	return kenbanWindow;
};
