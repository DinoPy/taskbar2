const {ipcRenderer} = require('electron/renderer');
ipc = ipcRenderer;

const commandsContainer = document.querySelector(".commands-container");
const inputsFormContainer = document.querySelector(".inputs-container");
const keyInput = document.querySelector(".key-input");
const urlInput = document.querySelector(".url-input");
const errorMessageP = document.querySelector(".error-message");

let commands = {};
let reserved = [];

ipc.on("data-from-parent", (e, data) => {
    console.log(data)
    commands = data.commands;
    reserved = data.reserved_keys;

    Object.keys(commands).forEach(c => {
        createUi(commands[c]);
    })
})

const createUi = (obj) => {
    const tr = document.createElement("tr");
    tr.classList.add("command-item");

    const keyTd = document.createElement("td");
    keyTd.textContent = obj.key;
    const urlTd = document.createElement("td");
    urlTd.textContent = obj.url;

    const removeTd = document.createElement("td");
    removeTd.classList.add("action-item");
    removeTd.textContent = "Remove";
    removeTd.addEventListener("click", (e) => {
        ipc.send("command_removed", commands[obj.key])
        tr.remove()
        delete commands[obj.key]
    })

    tr.append(keyTd, urlTd, removeTd);
    commandsContainer.append(tr);
}

let errorTimeout = null;
const handleErrorMessage = (message, input) => {
    if (errorMessageP.textContent)
        return;
    clearTimeout(errorTimeout);
    input.value = "";
    errorMessageP.textContent = message;
    errorTimeout = setTimeout(() => { errorMessageP.textContent = "" }, 2500);
    throw new Error(message)
}

inputsFormContainer.addEventListener("submit", (e) => {
    const key = keyInput.value;
    const url = urlInput.value;
    e.preventDefault();
    console.log("event submitted", e);

    try {
        if (key.length < 1)
            handleErrorMessage("Please type a key", keyInput);

        if (reserved.includes(key))
            handleErrorMessage("Restricted key used", keyInput);

        if (commands.hasOwnProperty(key))
            handleErrorMessage("Restricted key already in use", keyInput);

        try {
            new URL(url);
        } catch (e) {
            handleErrorMessage("Invalid URL", urlInput)
            return
        }
    } catch (e) {
        return;
    }

    commands[key] = {
        key: key,
        url: url
    }
    keyInput.value = "";
    urlInput.value = "";
    createUi(commands[key]);
    ipc.send("new_command_added", commands[key]);
})
