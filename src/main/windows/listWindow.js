import { BrowserWindow, screen } from "electron";

export const createListWindow = ({ props, onClose } = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const windowWidth = 680;
	const windowHeight = 520;
	const listWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - windowWidth / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.15),
		width: windowWidth,
		height: windowHeight,
		minWidth: 500,
		minHeight: 400,
		minimizable: false,
		resizable: true,
		alwaysOnTop: true,
		show: false,
		frame: false,
		transparent: true,
		webPreferences: {
			webgl: true,
			nodeIntegration: true,
			contextIsolation: false,
			devTools: true,
		},
	});
	listWindow.setBackgroundColor("#faf9f7");
	listWindow.loadFile("src/html/list.html");
	listWindow.webContents.once("dom-ready", () => {
		listWindow.show();
	});
	listWindow.webContents.once("did-finish-load", () => {
		listWindow.webContents.send("data-from-parent", props);
	});
	listWindow.on("ready-to-show", () => listWindow.focus());
	if (onClose) listWindow.on("close", onClose);
	return listWindow;
};
