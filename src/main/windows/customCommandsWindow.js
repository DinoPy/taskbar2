import { BrowserWindow, screen } from "electron";

export const createCustomCommandsWindow = ({
	commands = {},
	reservedKeys,
	onClose,
} = {}) => {
	const cursorPosition = screen.getCursorScreenPoint();
	const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
	const customWindow = new BrowserWindow({
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

	customWindow.setBackgroundColor("#121B22");
	customWindow.loadFile("./src/html/customCommands.html");

	customWindow.webContents.once("did-finish-load", () => {
		const keyAndCommands = {};
		for (let key in commands) {
			keyAndCommands[key] = {
				key,
				url: commands[key].url,
			};
		}
		customWindow.webContents.send("data-from-parent", {
			commands: keyAndCommands,
			reserved_keys: reservedKeys,
		});
	});

	if (onClose) {
		customWindow.on("close", onClose);
	}

	return customWindow;
};
