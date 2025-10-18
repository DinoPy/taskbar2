import WebSocket from "ws";
import { config } from "./src/main/config.js";

const DEFAULT_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;

const defaultLogger = {
	log: (...args) => console.log(...args),
	error: (...args) => console.error(...args),
};

export function createSocketClient({
	onConnected,
	onDisconnected,
	eventHandlers = {},
	logger = defaultLogger,
} = {}) {
	let socket = null;
	let manuallyClosed = false;
	let reconnectDelay = DEFAULT_RECONNECT_DELAY;
	let reconnectTimer = null;
	let currentUser = null;

	const log = (...args) => {
		try {
			logger?.log?.(...args);
		} catch {
			console.log(...args);
		}
	};

	const logError = (...args) => {
		try {
			logger?.error?.(...args);
		} catch {
			console.error(...args);
		}
	};

	const clearReconnectTimer = () => {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	};

	const cleanupSocket = () => {
		if (!socket) return;
		socket.removeAllListeners?.();
		socket = null;
	};

	const scheduleReconnect = () => {
		if (!currentUser) {
			return;
		}
		clearReconnectTimer();
		reconnectTimer = setTimeout(() => {
			connect(currentUser);
		}, reconnectDelay);
		reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
		log(`Socket reconnect scheduled in ${reconnectDelay}ms`);
	};

	const dispatchEvent = (eventName, data) => {
		const handler = eventHandlers[eventName];
		if (!handler) {
			log(`Unknown event received: ${eventName}`);
			return;
		}

		try {
			handler({ data, event: eventName, send });
		} catch (error) {
			logError(`Error handling socket event "${eventName}"`, error);
		}
	};

	const send = (eventName, data) => {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			log(`Skipping send; socket not open for event "${eventName}"`);
			return false;
		}

		try {
			socket.send(JSON.stringify({ event: eventName, data }));
			return true;
		} catch (error) {
			logError("Failed to send socket message", error);
			return false;
		}
	};

	const connect = (userInfo) => {
		currentUser = userInfo;
		manuallyClosed = false;
		clearReconnectTimer();

		if (socket) {
			manuallyClosed = true;
			socket.close();
			cleanupSocket();
			manuallyClosed = false;
		}

		const socketUrl = config.getWsUrl();
		socket = new WebSocket(socketUrl);

		socket.onopen = () => {
			reconnectDelay = DEFAULT_RECONNECT_DELAY;
			onConnected?.();
			send("connect", {
				email: userInfo.email,
				first_name: userInfo.given_name,
				last_name: userInfo.family_name,
				google_uid: userInfo.id,
			});
		};

		socket.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				if (message.event !== "ping") {
					log(message.data);
				}
				dispatchEvent(message.event, message.data);
			} catch (error) {
				logError("Failed to parse socket message", error);
			}
		};

		socket.onclose = (event) => {
			cleanupSocket();
			onDisconnected?.(event);
			if (!manuallyClosed) {
				scheduleReconnect();
			}
		};

		socket.onerror = (error) => {
			logError("Socket error:", error);
		};

		return socket;
	};

	const close = () => {
		manuallyClosed = true;
		clearReconnectTimer();
		if (socket) {
			socket.close();
			cleanupSocket();
		}
	};

	const markManuallyClosed = () => {
		manuallyClosed = true;
	};

	const isManuallyClosed = () => manuallyClosed;

	return {
		connect,
		send,
		close,
		markManuallyClosed,
		isManuallyClosed,
	};
}
