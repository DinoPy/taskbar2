import WebSocket from "ws";
import {
	handleSocketConnect,
	handleSocketDisconnect,
	setUpTasks,
	WSOnTaskRefresher,
	WSOnNewTaskCreated,
	WSOnRelatedTaskEdited,
	WSOnRelatedTaskDeleted,
	WSOnRelatedTaskToggled,
	WSOnRelatedAddedCommand,
	WSOnRelatedRemovedCommand,
	WSOnRelatedUpdatedCategories,
	WSOnGetCompletedTasks,
	WSOnRequestHardRefresh,
	socket
} from "./main.js"

let reconnectInterval = 3000;

let stage = "development";
let user = {};

const prodUrl = "https://pythonws.dinodev.dev/ws/taskbar"
const devUrl = "ws://localhost:8080/ws/taskbar"

function socketConnect(userInfo) {
	socket.instance = new WebSocket(stage == "development" ? devUrl : prodUrl);

	socket.instance.onopen = () => {
		socket.manuallyClosed = false;
		console.log('Connected');
		sendEvent("connect", {
			email: userInfo.email,
			first_name: userInfo.given_name,
			last_name: userInfo.family_name,
		})
	};

	socket.instance.onmessage = (event) => {
		const msg = JSON.parse(event.data);
		if (msg.event != "ping")
			console.log(msg);

		switch (msg.event) {
			case "ping":
				sendEvent("pong", "alive and well");
				break
			case "connected":
				const { tasks, ...data } = msg.data;
				user = data;
				setUpTasks(msg.data)
				break
			case "related_task_edited":
				WSOnRelatedTaskEdited(msg.data);
				break
			case "related_task_deleted":
				WSOnRelatedTaskDeleted(msg.data);
				break
			case "related_task_toggled":
				WSOnRelatedTaskToggled(msg.data);
				break
			case "related_added_command":
				WSOnRelatedAddedCommand(msg.data);
				break
			case "related_removed_command":
				WSOnRelatedRemovedCommand(msg.data);
				break
			case "related_updated_categories":
				WSOnRelatedUpdatedCategories(msg.data);
				break
			case "new_task_created":
				WSOnNewTaskCreated(msg.data);
				break
			case "tasks_refresher":
				WSOnTaskRefresher(msg.data);
				break
			case "get_completed_tasks":
				WSOnGetCompletedTasks(msg.data);
				break
			case "request_hard_refresh":
				WSOnRequestHardRefresh(msg.data);
				break
			default:
				console.log("Unknown event received:\n", msg)
		}

	};

	socket.instance.onclose = (e) => {
		handleSocketDisconnect();
		if (!socket.manuallyClosed) {
			console.log('Socket closed, retrying in 3s...', e.reason);
			setTimeout(() => socketConnect(userInfo), reconnectInterval); // auto-reconnect after 3s
		}
	};

	socket.instance.onerror = (err) => {
		console.error('Socket error:', err);
	};


	return socket.instance
}

function sendEvent(eventName, data) {
	socket.instance.send(JSON.stringify({ event: eventName, data: data }));
}

export { socketConnect, sendEvent };

