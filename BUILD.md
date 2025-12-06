# Build Scripts

This project includes convenient build scripts that handle environment variable bundling automatically.

## Production Build

For production builds with Google OAuth credentials:

```bash
GOOGLE_CLIENT_ID=your_client_id GOOGLE_CLIENT_SECRET=your_client_secret ./build.sh
```

Or with a specific environment:

```bash
GOOGLE_CLIENT_ID=your_client_id GOOGLE_CLIENT_SECRET=your_client_secret ./build.sh production
```

## Development Build

For development builds (uses .env file if available):

```bash
./build-dev.sh
```

## What the scripts do:

1. **Create build environment file** - Captures environment variables and writes them to `src/main/build-env.js`
2. **Build the application** - Runs `bun run build` to create the packaged app
3. **Clean up** - Removes temporary files automatically
4. **Open dist folder** - Opens the output directory (production script only)

## Output files:

- `dist/mac-arm64/taskbar2.app` - The macOS application
- `dist/taskbar2-0.8.3-arm64.dmg` - DMG installer
- `dist/taskbar2-0.8.3-arm64-mac.zip` - ZIP archive

## Environment Variables

Required for production builds:
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

Optional:
- `APP_STAGE` - Environment stage (defaults to "production" or "development")

