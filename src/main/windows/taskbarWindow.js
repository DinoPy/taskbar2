import {
    BrowserWindow,
    Notification,
    screen,
} from "electron";
import electronLocalshortcut from "electron-localshortcut";

const DEFAULT_MIN_HEIGHT = 40;
const DEFAULT_MAX_HEIGHT = 80;
const DEFAULT_MIN_WIDTH = 1280;
const DEFAULT_ICON = "src/images/dino.ico";

export const createTaskbarWindow = ({
    ipcMain,
    taskbarHeight,
    currentlySelectedScreenIndex,
    getIsTimerRunning,
    onCloseApp,
    onShowTaskContextMenu,
    onShowGeneralContextMenu,
    onShowLoginContextMenu,
}) => {
    const displays = screen.getAllDisplays();
    const targetDisplay =
        displays[currentlySelectedScreenIndex] ?? displays[0] ?? screen.getPrimaryDisplay();

    const win = new BrowserWindow({
        x: targetDisplay.workArea.x,
        y: targetDisplay.workArea.y,
        width: targetDisplay.workAreaSize.width,
        height: taskbarHeight,
        minHeight: DEFAULT_MIN_HEIGHT,
        maxHeight: DEFAULT_MAX_HEIGHT,
        minWidth: DEFAULT_MIN_WIDTH,
        frame: false,
        alwaysOnTop: true,
        enableLargerThanScreen: false,
        title: "Taskbar",
        maximizable: false,
        movable: false,
        minimizable: false,
        icon: DEFAULT_ICON,
        webPreferences: {
            webgl: true,
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
        },
    });

    const { webContents } = win;

    win.loadFile("src/index.html");
    win.title = "Task bar";

    const handleCloseApp = (_, args) => {
        onCloseApp?.(args);
    };

    const handleIntervalEnd = (_, args) => {
        new Notification({
            title: "Interval Ended",
            body: args,
            silent: false,
            icon: DEFAULT_ICON,
            timeoutType: "never",
        }).show();
    };

    const handleShowTaskContextMenu = (_, args) => {
        onShowTaskContextMenu?.(args);
    };

    const handleShowGeneralContextMenu = () => {
        onShowGeneralContextMenu?.();
    };

    const handleShowLoginContextMenu = () => {
        onShowLoginContextMenu?.();
    };

    const handleDidFinishLoad = () => {
        const isTimerRunning = getIsTimerRunning ? getIsTimerRunning() : true;
        win.webContents.send("data-from-main", {
            isTimerRunning,
        });
    };

    const handleBeforeInputEvent = (event, input) => {
        if (input.key === "r" && (input.ctrlOrCommand || input.meta)) {
            event.preventDefault();
        }
        if (input.key === "w" && (input.ctrlOrCommand || input.meta)) {
            event.preventDefault();
        }
    };

    let shortcutsRegistered = false;

    const registerLocalShortcuts = () => {
        if (shortcutsRegistered) return;
        shortcutsRegistered = true;
        electronLocalshortcut.register(
            win,
            ["CommandOrControl+R", "CommandOrControl+Shift+R", "F5"],
            () => {}
        );
    };

    const unregisterLocalShortcuts = () => {
        if (!shortcutsRegistered) return;
        shortcutsRegistered = false;
        electronLocalshortcut.unregisterAll(win);
    };

    ipcMain.on("close_app", handleCloseApp);
    ipcMain.on("interval_end", handleIntervalEnd);
    ipcMain.on("show-task-context-menu", handleShowTaskContextMenu);
    ipcMain.on("show-general-context-menu", handleShowGeneralContextMenu);
    ipcMain.on("show-login-context-menu", handleShowLoginContextMenu);

    webContents.once("did-finish-load", handleDidFinishLoad);
    webContents.on("before-input-event", handleBeforeInputEvent);

    win.on("focus", registerLocalShortcuts);
    win.on("blur", unregisterLocalShortcuts);

    win.on("closed", () => {
        ipcMain.removeListener("close_app", handleCloseApp);
        ipcMain.removeListener("interval_end", handleIntervalEnd);
        ipcMain.removeListener("show-task-context-menu", handleShowTaskContextMenu);
        ipcMain.removeListener("show-general-context-menu", handleShowGeneralContextMenu);
        ipcMain.removeListener("show-login-context-menu", handleShowLoginContextMenu);
        if (!webContents.isDestroyed()) {
            webContents.removeListener("before-input-event", handleBeforeInputEvent);
        }
        unregisterLocalShortcuts();
    });

    return win;
};
