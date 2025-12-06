import path from "path";
import { app } from "electron";

// Load build-time environment variables
let buildEnv = {};
try {
  const { buildEnv: env } = await import('./build-env.js');
  buildEnv = env;
} catch (e) {
  // Build env not available, will use process.env
  console.log('Build environment not available, using process.env');
}

const stage = process.env.APP_STAGE ?? buildEnv.APP_STAGE ?? "development";

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
	prod: "wss://pythonws.dinodev.dev/ws/taskbar",
};

const getWsUrl = () => {
	const url = isDev ? wsUrls.dev : wsUrls.prod;
	console.log(`[config] Stage: ${stage}, isDev: ${isDev}, WebSocket URL: ${url}`);
	return url;
};

export const config = Object.freeze({
	stage,
	isDev,
	logFilePath,
	tokensFilePath,
	getWsUrl,
});
