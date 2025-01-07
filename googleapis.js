import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
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

const SCOPES = ['https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
});

try {
    const savedTokens = JSON.parse(fs.readFileSync('tokens.json'));
    if (savedTokens) {
        oauth2Client.setCredentials(savedTokens);
        getUserDetails();
    }
} catch (error) {
    console.log(error.message);
}

async function getUserDetails() {
    const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: "v2",
    });

    oauth2.userinfo.get((err, res) => {
        if (err) {
            console.log(err);
            return;
        }
        Object.assign(userInfo, res.data);
    });
}

async function getAuthTokens(code) {
    try {
        // Exchange the authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync('tokens.json', JSON.stringify(tokens));
        getUserDetails();
    } catch (error) {
        console.log(error);
    }
}


export { oauth2Client, authUrl, getAuthTokens, userInfo };

