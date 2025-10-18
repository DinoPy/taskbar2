## Urgent Improvements

- Externalize Google OAuth credentials  
  Swap the hardcoded `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `googleapis_nothidden_credentials.js` for environment- or keychain-backed configuration, update packaging instructions, and add friendly errors when env vars are missing.

- Refactor `main.js` into focused modules  
  Break the 1.2K-line main process file into window-factory, IPC routing, and socket-handling modules; keep behavior identical while improving readability, testability, and maintainability.

- Remove `main.js` ↔ `ws.js` circular dependency  
  Introduce an event bus or dependency injection layer so socket code no longer imports `main.js` directly; ensures predictable startup order and simplifies mocking.

- Introduce centralized environment/config management  
  Read WebSocket endpoints, stage flags, and redirect URIs from a shared config (env/.env) instead of hardcoding them inside `ws.js` or other files; eases deployment across environments.

- Harden token/log storage  
  Replace writes to `~/app.log` and `~/.tokens.json` with OS-appropriate app data locations, add error handling and optional encryption/permissions checks, and define lifecycle management.

- Normalize renderer module system  
  Migrate renderer scripts away from the CommonJS/ESM mix (e.g., `require('electron')` alongside `import`) by leveraging preload scripts or bundlers; improves compatibility with future tooling.

- Fix listener leak and resume positioning TODOs  
  Audit event registration/unregistration to eliminate the `MaxListenersExceededWarning` and ensure the taskbar returns to its preferred display after OS resume.

- Improve WebSocket reconnect strategy  
  Implement exponential backoff, guard against duplicate connections, and handle auth/token invalidation gracefully to avoid hammering the backend during outages.

- Centralize runtime constants  
  Consolidate duplicated constants (URLs, redirect URI, stage toggles) into a single config module to keep desktop, backend, and mobile clients aligned.
