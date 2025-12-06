import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { config } from "./src/main/config.js";

// Load build-time environment variables
let buildEnv = {};
try {
  const { buildEnv: env } = await import('./src/main/build-env.js');
  buildEnv = env;
} catch (e) {
  // Build env not available, will use process.env
  console.log('Build environment not available, using process.env');
}

const userInfo = {};

const getSecretGoogleCreds = () => {
    const {
        GOOGLE_CLIENT_ID = buildEnv.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET = buildEnv.GOOGLE_CLIENT_SECRET,
    } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error(
            "Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment."
        );
    }

    return {
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
    };
};

const GOOGLE_REDIRECT_URI = "http://localhost:3123";
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getSecretGoogleCreds();
const tokensFilePath = config.tokensFilePath;

const ensureTokensDir = () => {
	const dir = path.dirname(tokensFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
};

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
});
console.log("auth url: ", authUrl);

const login = async () => {
    try {
        ensureTokensDir();
        const savedTokens = JSON.parse(
            fs.readFileSync(tokensFilePath, "utf-8"));
        if (savedTokens) {
            oauth2Client.setCredentials(savedTokens);
            await getUserDetails();
        }
    } catch (error) {
        console.log(error.message);
    }
}

function getUserDetails() {
    return new Promise(async (resolve) => {
        const oauth2 = google.oauth2({
            auth: oauth2Client,
            version: "v2",
        });

        await oauth2.userinfo.get((err, res) => {
            if (err) {
                console.log(err);
                return;
            }
            Object.assign(userInfo, res.data);
            console.log("userInfo", userInfo);
            resolve(res.data);
            console.log("from googleapis.js", +new Date());
        });
    })
}

async function getAuthTokens(code) {
    try {
        // Exchange the authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        ensureTokensDir();
        fs.writeFileSync(tokensFilePath, JSON.stringify(tokens));
        await getUserDetails();
    } catch (error) {
        console.log("error occured");
        console.log(error);
    }
}


export { oauth2Client,login, authUrl, getAuthTokens, userInfo };
