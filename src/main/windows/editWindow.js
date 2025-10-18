import { BrowserWindow, screen } from "electron";

export const createEditWindow = ({
	props,
	onReadyToShow,
	onClose,
	onDataPrepared,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const editWindow = new BrowserWindow({
		x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 400 / 2),
		y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2),
		width: 400,
		minHeight: 200,
		minimizable: false,
		resizable: false,
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

	editWindow.setBackgroundColor = "#1b1d23";
	editWindow.loadFile("src/html/child.html");

	editWindow.webContents.once("dom-ready", async () => {
		const height = await editWindow.webContents.executeJavaScript(
			"document.body.offsetHeight"
		);
		editWindow.setSize(400, height + 27);
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
