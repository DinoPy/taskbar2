import fs from "fs";
import os from "os";
import path from "path";

const logFile = fs.createWriteStream(path.join(os.homedir(), "app.log"), { flags: 'a' });
const logStdout = process.stdout;

console.log = function(...args) {
  logFile.write(new Date().toISOString() + ' ' + args.join(' ') + '\n');
  logStdout.write(new Date().toISOString() + ' ' + args.join(' ') + '\n');
};

console.error = console.log; // Redirect errors as well



import {
    app,
    BrowserWindow,
    ipcMain,
    screen,
    globalShortcut,
    powerMonitor,
    Notification,
    Menu,
    MenuItem,
} from "electron";
import dotenv from "dotenv";
dotenv.config();
import electronLocalshortcut from "electron-localshortcut";
import { socketConnect } from "./ws.js";
import { oauth2Client, login, authUrl, getAuthTokens, userInfo } from "./googleapis.js";


export const ipc = ipcMain;
const homeDir = os.homedir();
let socket = {
    isConnected: true,
    instance: null
};

let currentlySelectedScreenIndex = 0;
let currentlySelectedScreenSide = "top";

app.setName("Task yourself");
app.setAppUserModelId(app.name);

let SETTINGS;
let win = null;
let taskWindow = null;
let completedTasksWindow = null;
let kenbanWindow = null;
let helpWindow = null;
let openTaskProps = null;
let CATEGORIES = [];

loadSettings();

const createWindow = () => {
    const displays = screen.getAllDisplays()[currentlySelectedScreenIndex];
    win = new BrowserWindow({
        x: displays.workArea.x,
        y: displays.workArea.y,
        width: displays.workAreaSize.width,
        width: displays.workAreaSize.width,
        height: 40,
        minHeight: 40,
        maxHeight: 40,
        minWidth: 1280,
        frame: false,
        alwaysOnTop: true,
        enableLargerThanScreen: false,
        title: "Taskbar",
        maximizable: false,
        movable: false,
        // resizable: true,
        minimizable: false,
        icon: "src/images/dino.ico",
        webPreferences: {
            webgl: true,
            // preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
        },
    });

    win.loadFile("src/index.html");
    win.title = "Task bar";

    ipc.on("close_app", (_, args) => {
        // exportCsv(args);
        taskWindow?.close();
        completedTasksWindow?.close();
        win.close();
    });

    ipc.on("interval_end", (_, args) => {
        new Notification({
            title: "Interval Ended",
            body: args,
            silent: false,
            icon: "src/images/dino.ico",
            timeoutType: "never",
        }).show();
    });

    ipc.on("show-task-context-menu", (_, args) => {
        createTaskContextMenu(args);
    });

    ipc.on("show-general-context-menu", (_, args) => {
        createContextMenu(args);
    });

    ipc.on("show-login-context-menu", (_, args) => {
        createLoginContextMenu();
    })

    // once the page is loaded we send some variables sourcing from settings
    win.webContents.on("did-finish-load", () => {
        win.webContents.send("data-from-main", {
            isTimerRunning: SETTINGS.isTimerRunning,
            categories: CATEGORIES,
        });

    });

    win.on("focus", () => {
        electronLocalshortcut.register(
            win,
            ["CommandOrControl+R", "CommandOrControl+Shift+R", "F5"],
            () => { }
        );
    });

    win.on("blur", () => {
        electronLocalshortcut.unregisterAll(win);
    });


    win.webContents.on("before-input-event", (event, input) => {
        // Check if the Ctrl (or Command on Mac) key and R key are pressed simultaneously
        if ((input.key === "r") && (input.ctrlOrCommand || input.meta)) {
            event.preventDefault(); // Prevent the default reload action
        }
        if ((input.key === "w") && (input.ctrlOrCommand || input.meta)) {
            event.preventDefault(); // Prevent the default quit action
        }
    });
};

app
    .whenReady()
    .then(async () => {
        // setting up global shortcuts.
        // globalShortcut.register("CommandOrControl+R", (e) => {
        // 	console.log(e);
        // });
        // globalShortcut.register("CommandOrControl+Shift+R", () => {});
        globalShortcut.register("CommandOrControl+Shift+Space", () => {
            win.show();
            win.webContents.send("addTask");
        });
        globalShortcut.register("CommandOrControl+Shift+n", () => {
            win.webContents.send("addEmergencyTask");
        });
        globalShortcut.register("CommandOrControl+Shift+j", () => {
            win.webContents.openDevTools();
            taskWindow?.webContents.openDevTools();
            completedTasksWindow?.webContents.openDevTools();
            kenbanWindow?.webContents.openDevTools();
            helpWindow?.webContents.openDevTools();
        });
        globalShortcut.register("CommandOrControl+Shift+e", () => {
            win.webContents.send("request-current-task-data-for-edit")
        })
        globalShortcut.register("CommandOrControl+Shift+k", () => {
            createKenbanWindow();
        })
        globalShortcut.register("CommandOrControl+Shift+c", () => {
            createCompletedTasksPopUp();
        })
        globalShortcut.register("CommandOrControl+Shift+s", () => {
            win.focus();
            win.webContents.send("task_switch_trigger");
        })
    })
    .then(async () => {
        createWindow();

        try {
            await login()
            const token = await oauth2Client.getAccessToken()
            console.log(userInfo);

            if (userInfo.hasOwnProperty("id")) {
                win.webContents.send("user-logged-in", userInfo);
                socket.instance = socketConnect(userInfo);
                if (!socket.instance) socket.isConnected = false;

                socketHandlers(socket.instance)
            }

            console.log("token: ", token);
        } catch (e) {
            doAuthentication();
        }

        console.log("from main.js", +new Date());
        screen.on("display-added", (event, newDisplay) => {
            console.log("Display added");
            const displays = screen.getAllDisplays();
            while (currentlySelectedScreenIndex > displays.length - 1) {
                currentlySelectedScreenIndex -= 1;
            }

            const y = currentlySelectedScreenSide === "bottom" ?
                displays[currentlySelectedScreenIndex].bounds.y + displays[currentlySelectedScreenIndex].bounds.height - 40 :
                displays[currentlySelectedScreenIndex].bounds.y;

            win.setBounds({
                x: displays[currentlySelectedScreenIndex].bounds.x,
                y,
                height: 40,
                width: displays[currentlySelectedScreenIndex].bounds.width,
            })
        });

        // Listen for a display being removed
        screen.on("display-removed", (event, oldDisplay) => {
            console.log("Display removed");
            const displays = screen.getAllDisplays();
            const y = currentlySelectedScreenSide === "bottom" ?
                displays[0].bounds.y + displays[0].bounds.height - 40 :
                displays[0].bounds.y;

            win.setBounds({
                x: displays[0].bounds.x,
                y,
                height: 40,
                width: displays[0].bounds.width,
            })
        });

        // Listen for changes to metrics (like resolution or orientation)
        screen.on("display-metrics-changed", (event, changedDisplay, changedMetrics) => {
            console.log("Display metrics changed");
        });
    });

const doAuthentication = () => {
    const authWindow = new BrowserWindow({ width: 800, height: 600 });
    authWindow.loadURL(authUrl);

    authWindow.webContents.on("did-fail-load",
        async (event, errorCode, errorDescription, validatedUrl) => {
            const url = new URL(validatedUrl);
            const code = url.searchParams.get("code");
            authWindow.close(); // Close the window after getting the code

            if (!code) console.log("Authentication failed - no code");
            else user = await getAuthTokens(code);

            if (userInfo.hasOwnProperty("id")) {
                win.webContents.send("user-logged-in", userInfo);
                socket.instance = socketConnect(userInfo);
                if (!socket.instance) socket.isConnected = false;

                socketHandlers(socket.instance)
            }
        });
}


process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason, promise);
});

// if all windows are close then quit app.
app.on("window-all-closed", () => {
    app.quit();
});


powerMonitor.on("suspend", () => {
    console.log("system suspended");
})
powerMonitor.on("resume", () => {
    console.log("system resumed");
})

// app.on("activate", () => {
// 	// mac specific option that has no effect atm as the windows are closed fully on close.
// 	if (BrowserWindow.getAllwindows().length === 0) createWindow();
// });


// TODO: consider removing or replacing by export on demand
async function exportCsv(completedTasks) {
    // return if the list has no tasks
    if (completedTasks.length < 1) return;

    // if something else but the task object is received, return.
    completedTasks = completedTasks.filter((i) => typeof i === "object");

    // create current task
    let currentTask = "";
    let csvString = "";
    const headers = Object.keys(completedTasks[0]);

    // loop over each task
    for (let i = 0; i < completedTasks.length; i++) {
        // go over the index of each property in the object using the header which has each property listed
        for (let taskProperty in headers) {
            // get the current title
            const currentTitle = headers[taskProperty];

            // add to the current task the value at ith task and current title
            currentTask +=
                completedTasks[i][currentTitle] +
                (taskProperty < headers.length - 1 ? "," : "\n");
        }

        // add the final value to the current Task
        csvString += currentTask;

        // reset current task
        currentTask = "";
    }

    fs.access(
        path.join(homeDir, "Documents", "Tasks", "Logs", "Tasks Log.csv"),
        (e) => {
            if (e) {
                csvString = getCsvHeaders(completedTasks) + csvString;
                writeFile(csvString);
            } else writeFile(csvString);
        }
    );

    // save the CSV - to individual file
    // fs.writeFile(
    // 	`${homeDir}/Documents/Tasks/Logs/${getCurrentDayFormated()} tasks log.csv`,
    // 	csvString,
    // 	(e) => {
    // 		console.log(e);
    // 	}
    // );
}

function getCurrentDayFormated() {
    const today = new Date();

    todayString = `${today.getDate()}-${today.getMonth() + 1
        }-${today.getFullYear()} ${today.getHours()}-${today.getMinutes()}-${today.getSeconds()}`;

    return todayString;
}

function createContextMenu() {
    const menu = new Menu();

    const submenus = screen.getAllDisplays().map((d, i) => {
        return {
            label: `Screen ${i} - Top`,
            click: () => {
                currentlySelectedScreenIndex = i;
                currentlySelectedScreenSide = "top";
                win.setBounds({
                    x: d.bounds.x,
                    y: d.bounds.y,
                    height: 40,
                    width: d.bounds.width,
                });
            },
        };
    });

    submenus.push(
        ...screen.getAllDisplays().map((d, i) => {
            return {
                label: `Screen ${i} - Bottom`,
                click: () => {
                    currentlySelectedScreenIndex = i;
                    currentlySelectedScreenSide = "bottom";
                    win.setBounds({
                        x: d.bounds.x,
                        y: d.bounds.y + d.bounds.height - 40,
                        height: 40,
                        width: d.bounds.width,
                    });
                },
            };
        })
    );

    menu.append(
        new MenuItem({
            label: "Select screen",
            submenu: submenus,
        })
    );

    menu.append(
        new MenuItem({
            label: "Toggle timer",
            toolTip: `Timer is currently ${SETTINGS.isTimerRunning ? "running" : "deactivated"
                }`,
            click: () => {
                SETTINGS.isTimerRunning = !SETTINGS.isTimerRunning;
                updateSettings();
                win.webContents.send("toggle-countdown-timer", {
                    isTimerRunning: SETTINGS.isTimerRunning,
                });
            },
        })
    );

    menu.append(new MenuItem({
        label: "Completed tasks",
        toolTip: "Show tasks that were completed so far",
        click: () => !completedTasksWindow && createCompletedTasksPopUp()
    }))

    menu.append(new MenuItem({
        label: "Toggle always on top",
        toolTip: "When toggled the window will stay on top of all other tasks",
        click: () => win.setAlwaysOnTop(!win.isAlwaysOnTop())
    }))

    menu.append(new MenuItem({
        label: "Help",
        toolTip: "Opens the help window",
        click: () => !helpWindow && createHelpWindow()
    }))

    menu.popup(win, 0, 0);
}

function createTaskContextMenu(args) {
    const ctxMenu = new Menu();

    ctxMenu.append(
        new MenuItem({
            label: "Edit",
            click: () => {
                taskWindow?.close();
                createEditWindow({ ...args, categories: CATEGORIES });
            },
        })
    );

    ctxMenu.append(
        new MenuItem({
            label: "Delete",
            click: () => {
                if (taskWindow && openTaskProps.id === args.id) taskWindow.close();
                deleteTask(args);
            },
        })
    );

    ctxMenu.append(
        new MenuItem({
            label: "Complete",
            click: () => {
                console.log(args, openTaskProps);
                if (taskWindow && openTaskProps.id === args.id) taskWindow.close();
                completeTask(args);
            },
        })

    );
    ctxMenu.append(
        new MenuItem({
            label: "Category",
            submenu: CATEGORIES.map(
                (cat) =>
                    new MenuItem({
                        label: cat,
                        type: "radio",
                        checked: cat === args.category ? true : false,
                        click: () => {
                            win.webContents.send("update-task-category", {
                                id: args.id,
                                newCategory: cat,
                            });
                        },
                    })
            ),
        })
    );
    // loop through the list starting from the tail and loop towards the middle
    ctxMenu.popup(win, 0, 0);
}


function createLoginContextMenu(args) {
    const ctxMenu = new Menu();
    const isLoggedIn = userInfo.hasOwnProperty("id");

    ctxMenu.append(
        new MenuItem({
            label: isLoggedIn ? "Sign Out" : "Sign In",
            click: () => {
                if (isLoggedIn) {
                    socket.instance.disconnect();
                    socket.instance = null;
                    Object.keys(userInfo).forEach(key => delete userInfo[key]);
                    fs.unlink("tokens.json", (e) => {
                        console.log(e);
                    });
                    win.webContents.send("user-logged-out", userInfo);
                } else {
                    doAuthentication();
                }
            },
        })
    );

    ctxMenu.popup(win, 0, 0);
}

function createKenbanWindow(props) {
    // properties of the browser window.
    const cursorPosition = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
    kenbanWindow = new BrowserWindow({
        x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width * 0.1),
        y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.1),
        height: Math.floor(activeDisplay.bounds.height * 0.8),
        width: Math.floor(activeDisplay.bounds.width * 0.8),
        minimizable: true,
        resizable: true,
        show: true,
        frame: true,

        webPreferences: {
            webgl: true,
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
        },
    });

    kenbanWindow.loadURL("https://dinodev-kenban.vercel.app")

    kenbanWindow.on("close", () => {
        kenbanWindow = null;
    });

}

function createEditWindow(props) {
    // properties of the browser window.
    const cursorPosition = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
    taskWindow = new BrowserWindow({
        x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 400/2),
        y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2 ),
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
    taskWindow.setBackgroundColor = "#1b1d23";
    taskWindow.loadFile("src/html/child.html");

    taskWindow.webContents.on("dom-ready", async () => {
        const height = await taskWindow.webContents.executeJavaScript(
            "document.body.offsetHeight"
        );

        taskWindow.setSize(400, height + 27);
        taskWindow.show();
    });

    // when the window is loaded we send the data from the parent props received via the context menu
    // and populate the page with the intended values.
    taskWindow.webContents.on("did-finish-load", () => {
        taskWindow.webContents.send("data-from-parent", props);
        openTaskProps = props;
    });

    // shows the window when ready event is triggered.
    taskWindow.on("ready-to-show", () => { });

    // removes from memory the value of the taskWindow that was closed.
    taskWindow.on("close", () => {
        taskWindow = null;
    });
}

// ensures the communication between the children windows and the main task window.
ipc.on("edit-submission-event-from-edit-popup", (e, { categories, ...data }) => {
    console.log(data)
    win.webContents.send("msg-redirected-to-parent", data);
    CATEGORIES = categories;
    SETTINGS["categories"] = categories;

    updateSettings();

    if (taskWindow) taskWindow.close();
    openTaskProps = null;

});

function createCompletedTasksPopUp() {
    try {
        const cursorPosition = screen.getCursorScreenPoint();
        const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
        completedTasksWindow = new BrowserWindow({
            x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 1000/2),
            y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2 ),
            width: 1000,
            minHeight: 1000,
            minimizable: false,
            resizable: false,
            modal: true,
            show: false,
            frame: false,
            alwaysOnTop: true,
            transparent: true,

            webPreferences: {
                webgl: true,
                nodeIntegration: true,
                contextIsolation: false,
                devTools: true,
            },
        });
        completedTasksWindow.setBackgroundColor = "#1b1d23";
        completedTasksWindow.loadFile("./src/html/completedTasks.html");


        completedTasksWindow.webContents.on("did-finish-load", () => {
            socket.instance.emit("get_completed_tasks",
                JSON.stringify({start_date: "", end_date: ""}),
                (data) => {
                completedTasksWindow.webContents.send("completed-tasks-list", data);
            })
        });


        completedTasksWindow.webContents.on("dom-ready", async () => {
            completedTasksWindow.show();
            // completedTasksWindow.webContents.openDevTools();
        });

        // removes from memory the value of the taskWindow that was closed.
        completedTasksWindow.on("close", () => {
            completedTasksWindow = null;
        })
    }
    catch (e) {
        console.log(e)
    }
}

ipc.on("completed_task_date_updated", (e, data) => {
    socket.instance.emit("get_completed_tasks", JSON.stringify(data), (tasks) => {
        completedTasksWindow.webContents.send("completed-tasks-list", tasks);
    })
})


function createHelpWindow () {
    const cursorPosition = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPosition);
    try {
        helpWindow = new BrowserWindow({
            x: activeDisplay.bounds.x + Math.floor(activeDisplay.bounds.width / 2 - 800/2),
            y: activeDisplay.bounds.y + Math.floor(activeDisplay.bounds.height * 0.2 ),
            width: 800,
            minHeight: 1000,
            minimizable: false,
            resizable: false,
            modal: true,
            frame: true,
            alwaysOnTop: true,
            webPreferences: {
                webgl: true,
                nodeIntegration: true,
                contextIsolation: false,
                devTools: true,
            },
        });
        helpWindow.setBackgroundColor = "#1b1d23";
        helpWindow.loadFile("./src/html/help.html");
        console.log("creating help window");
    } catch (e) {
        console.error(e);
    }

    helpWindow.on("close", () => {
        helpWindow = null;
    })
}



function deleteTask(props) {
    console.log(props);
    win.webContents.send("deleteTask", props);
    if (openTaskProps && props.id === openTaskProps.id) openTaskProps = null;
}
function completeTask(props) {
    console.log(props);
    win.webContents.send("completeTask", props);
    if (openTaskProps && props.id === openTaskProps.id) openTaskProps = null;
}

function updateSettings() {
    fs.writeFile(
        path.join(homeDir, "Documents", "Tasks", "User-Prefferences.json"),
        JSON.stringify(SETTINGS, null, 2),
        (e) => {
            console.log(e);
        }
    );
}

function loadSettings() {
    const DEFAULT_SETTINGS = {
        isTimerRunning: true,
        startBreakSoundPath: "",
        endBreakSoundPath: "",
        theme: "?",
        categories: [],
    };
    try {
        SETTINGS = JSON.parse(
            fs.readFileSync(
                path.join(homeDir, "Documents", "Tasks", "User-Prefferences.json"),
                "utf-8"
            )
        );
    } catch (error) {
        fs.mkdir(path.join(homeDir, "Documents", "Tasks"), (e) => {
            console.log(e);
        });

        fs.writeFileSync(
            path.join(homeDir, "Documents", "Tasks", "User-Prefferences.json"),
            JSON.stringify(DEFAULT_SETTINGS, null, 2)
        );

        SETTINGS = DEFAULT_SETTINGS;
    }
    CATEGORIES = SETTINGS.categories;
}

function writeFile(file) {
    const tasksLogPath = path.join(
        homeDir,
        "Documents",
        "Tasks",
        "Logs",
        "Tasks Log.csv"
    );

    try {
        fs.appendFile(tasksLogPath, file, (e, data) => {
            console.log(e);
            if (e && e.code === "ENOENT") {
                fs.mkdirSync(
                    path.join(homeDir, "Documents", "Tasks", "Logs"),
                    { recursive: true },
                    (e) => {
                        console.log(e);
                    }
                );

                writeFile(file);
            }
        });
    } catch (e) {
        console.log(e);

    }
}

function getCsvHeaders(list) {
    // get the list of header items
    const headers = Object.keys(list[0]);

    // generate a string of header items that"s separated by , and \n at the end
    const rowHeader = headers.reduce(
        (acc, cv, ci) => acc + cv + (ci !== headers.length - 1 ? "," : "\n"),
        ""
    );

    return rowHeader;
}


ipc.on("task_complete", async (_, data) => {
    try {
        // TODO: Re enable posting to sheets.
        // await postTaskToSheets(data);
        console.log(`Task ${data.id} is completed`);
        console.log(`completed_at: ${data.completed_at}`)
        socket.instance.emit("task_completed",JSON.stringify({
            id: data.id,
            duration: data.duration,
            completed_at: data.completed_at,
            last_modified_at: +new Date()
        }), (response) => {
        console.log(response)
    })
    } catch (error) {
        win.webContents.send("post-task-error", JSON.stringify(error));
    }
});


ipc.on("task_create", async (_, data) => {
    // TODO: handle socket disconnect and retries
    console.log(`Task ${data.id} is being created`)
    socket.instance.emit("task_create", JSON.stringify(data), (response) => {
        console.log(response)
    });
})

ipc.on("task_toggle", (_, data) => {
    console.log(`Task ${data.uuid} is toggled ${data.is_active}`);
    socket.instance.emit("task_toggle", JSON.stringify(data), (response) => {
        console.log(response)
    });
})

ipc.on("task_edit", async(_, data) => {
    console.log(`Task ${data.id} is being edited`);
    socket.instance.emit("task_edit", JSON.stringify(data), (response) => {
        console.log(response)
    });
})

ipc.on("task_delete", (_, data) => {
    console.log(`Task ${data.id} id deleted`);
    socket.instance.emit("task_delete", JSON.stringify(data));
})

ipc.on("toggle_current_task_edit", (_, data) => {
    console.log(data)
    taskWindow?.close();
    createEditWindow({ ...data, categories: CATEGORIES });

})

ipc.on("close-children-window", () => {
    if (taskWindow) taskWindow.close();
    openTaskProps = null;
    taskWindow = null;
});


ipc.on("close-completed-list-window", () => {
    if (completedTasksWindow) completedTasksWindow.close();
    completedTasksWindow = null;
});

function socketHandlers(socket) {
    socket.on("new_task_created", data => {
        win.webContents.send("new_task_from_relative", JSON.parse(data));
    })

    socket.on("related_task_toggled", data => {
        win.webContents.send("related_task_toggled", JSON.parse(data));
    })

    socket.on("related_task_deleted", data => {
        console.log(data)
        win.webContents.send("related_task_deleted", JSON.parse(data));
    })

    socket.on("related_task_edited", data => {
        console.log(data)
        win.webContents.send("related_task_edited", JSON.parse(data));
    })

    socket.on("tasks_refresher", data => {
        if (win && win.webContents)
            win.webContents.send("refresh_tasks", data.tasks)
    })

}

function handleSocketConnect() {
    socket.isConnected = true;
    if (win && win.webContents)
        win.webContents.send("socket-connected");
    else
        setTimeout(handleSocketConnect, 1000);
}

function handleSocketDisconnect() {
    socket.isConnected = false;
    if (win && win.webContents)
        win.webContents.send("socket-disconnected");
    else
        setTimeout(handleSocketDisconnect, 1000);
}

function setUpTasks(tasks) {
    if (win && win.webContents) {
        win.webContents.send("resume-tasks", tasks)
    }
}

export { handleSocketConnect, handleSocketDisconnect, setUpTasks };
