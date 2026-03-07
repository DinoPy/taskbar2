import { BrowserWindow, screen } from "electron";

export const createEditWindow = ({
	props,
	onReadyToShow,
	onClose,
	onDataPrepared,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const windowWidth = 520;
	const minWindowHeight = 360;
	const editWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - windowWidth / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2),
		width: windowWidth,
		minHeight: minWindowHeight,
		minimizable: false,
		resizable: true,
		modal: true,
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

	editWindow.setBackgroundColor("#faf9f7");
	editWindow.loadFile("src/html/child.html");

	editWindow.webContents.once("dom-ready", async () => {
		const height = await editWindow.webContents.executeJavaScript("document.body.offsetHeight");
		editWindow.setSize(windowWidth, Math.max(minWindowHeight, height + 27));
		editWindow.center();
		editWindow.show();
	});

	editWindow.webContents.once("did-finish-load", () => {
		editWindow.webContents.send("data-from-parent", props);
		onDataPrepared?.(props);
	});

	if (onReadyToShow) {
		editWindow.on("ready-to-show", onReadyToShow);
	} else {
		editWindow.on("ready-to-show", () => editWindow.focus());
	}

	if (onClose) {
		editWindow.on("close", onClose);
	}

	return editWindow;
};
