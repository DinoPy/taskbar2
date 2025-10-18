## Environment Variables

Set the following variables before running the Electron app so Google OAuth can initialize without exposing secrets in source control:

- `GOOGLE_CLIENT_ID` – OAuth client id from Google Cloud Console.
- `GOOGLE_CLIENT_SECRET` – Matching client secret.

During development you can copy `.env.example` to `.env`, fill in the values, and the app will load them automatically via `dotenv`. In production, export the variables through your process manager or hosting environment. The app throws a descriptive error at launch if either variable is missing.

Optional:

- `APP_STAGE` – Defaults to `development`. Set to `production` to point the app at the production WebSocket endpoint defined in `src/main/config.js`.
