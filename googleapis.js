import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
const userInfo = {};

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = "http://localhost:3123";

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

const login = async () => {
    try {
        const savedTokens = JSON.parse(fs.readFileSync('tokens.json'));
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
        fs.writeFileSync('tokens.json', JSON.stringify(tokens));
        await getUserDetails();
    } catch (error) {
        console.log("error occured");
        console.log(error);
    }
}


export { oauth2Client,login, authUrl, getAuthTokens, userInfo };

