import { BrowserWindow, screen } from "electron";

export const createHelpWindow = ({ onClose } = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const helpWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 800 / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2),
		width: 800,
		minHeight: 1000,
		minimizable: false,
		resizable: false,
		modal: true,
		frame: false,
		alwaysOnTop: true,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});

	helpWindow.setBackgroundColor("#121B22");
	helpWindow.loadFile("./src/html/help.html");

	if (onClose) {
		helpWindow.on("close", onClose);
	}

	return helpWindow;
};
