export function createCommandsController({
	globalShortcut,
	windowManager,
	reservedKeys = [],
}) {
	const commands = new Map();

	const registerShortcut = (key, url) => {
		const accelerator = `CommandOrControl+Shift+${key}`;
		globalShortcut.register(accelerator, () => {
			windowManager.openCommandWindow({ key, url });
		});
	};

	const unregisterShortcut = (key) => {
		const accelerator = `CommandOrControl+Shift+${key}`;
		globalShortcut.unregister(accelerator);
	};

	const isReserved = (key) => reservedKeys.includes(key);

	const addCommand = ({ key, url }) => {
		if (isReserved(key)) return false;
		if (commands.has(key)) {
			removeCommand(key);
		}
		registerShortcut(key, url);
		commands.set(key, { key, url });
		return true;
	};

	const removeCommand = (key) => {
		if (!commands.has(key)) return false;
		unregisterShortcut(key);
		windowManager.closeCommandWindow(key);
		commands.delete(key);
		return true;
	};

	const syncCommands = (entries) => {
		Object.keys(entries).forEach((key) => {
			if (isReserved(key)) return;
			addCommand({ key, url: entries[key].url });
		});
	};

	const replaceCommands = (entries) => {
		[...commands.keys()].forEach((key) => removeCommand(key));
		syncCommands(entries);
	};

	const removeMissingCommands = (entries) => {
		const keys = Object.keys(entries);
		[...commands.keys()].forEach((key) => {
			if (!keys.includes(key)) {
				removeCommand(key);
			}
		});
	};

	const getCommandsSnapshot = () => {
		const snapshot = {};
		for (const [key, value] of commands.entries()) {
			snapshot[key] = { key: value.key, url: value.url };
		}
		return snapshot;
	};

	return {
		addCommand,
		removeCommand,
		syncCommands,
		replaceCommands,
		removeMissingCommands,
		getCommandsSnapshot,
		isReserved,
	};
}
