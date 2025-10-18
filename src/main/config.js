import path from "path";
import { app } from "electron";

const stage = process.env.APP_STAGE ?? "development";

const isDev = stage === "development";

let appDataDir;
try {
	appDataDir = app.getPath("userData");
} catch (error) {
	appDataDir = path.join(process.cwd(), ".taskbar");
}

const logFilePath = path.join(appDataDir, "app.log");
const tokensFilePath = path.join(appDataDir, "tokens.json");

const wsUrls = {
	dev: "ws://localhost:8080/ws/taskbar",
	prod: "https://pythonws.dinodev.dev/ws/taskbar",
};

const getWsUrl = () => (isDev ? wsUrls.dev : wsUrls.prod);

export const config = Object.freeze({
	stage,
	isDev,
	logFilePath,
	tokensFilePath,
	getWsUrl,
});
