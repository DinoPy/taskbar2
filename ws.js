import { io } from "socket.io-client";  // Use socket.io-client instead of ws
import { handleSocketConnect, handleSocketDisconnect, setUpTasks } from "./main.js";

let socket = null;
let reconnectInterval = 1000;
let timeout = null;

function socketConnect(userInfo) {
    if (socket) {
        if (!socket.connected)
            socket.connect();
        return socket;
    }

    socket = io("http://127.0.0.1:8000", {
        path: "/ws/taskbar",
        transports: ['websocket'],  // Make sure it's using WebSocket
        reconnectionAttempts: Infinity,   // Retry forever
        query: {
            id: userInfo.id,
            email: userInfo.email,
            first_name: userInfo.given_name,
            last_name: userInfo.family_name
        }
    });


    // Event: Connection opened
    socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        handleSocketConnect();
        clearTimeout(timeout);
    });

    socket.on("socket-connected", (data) => {
        setUpTasks(data.tasks);
        console.log(data);
    });

    socket.on("message", data => {
        console.log(data)
    })

    socket.on("error", (error) => {
        console.log(error);
        handleSocketDisconnect();
    });

    socket.on('disconnect', () => {
        console.log('WebSocket connection closed');
        handleSocketDisconnect();
    });

    socket.on("reconnect", () => {
        handleSocketConnect();
    })

    // Initial connection error
    socket.on('connect_error', (error) => {
        console.error('Initial connection failed:', error.message);
        reconnectInterval *= 2
        let delay = Math.min(reconnectInterval, 8000); // Cap delay at 8s
        console.log(`Retrying in ${delay / 1000} seconds...`);
        timeout = setTimeout(() => socketConnect(userInfo), delay);
    });

    return socket;
}

export { socketConnect };

