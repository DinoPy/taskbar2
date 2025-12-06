#!/bin/bash

# Development build script for taskbar2
# Usage: ./build-dev.sh

set -e  # Exit on any error

echo "🚀 Building taskbar2 for development..."

# Set development environment variables
export APP_STAGE=development

# Check if Google credentials are available in .env or environment
if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo "⚠️  Warning: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set"
    echo "   Make sure you have a .env file or set them manually"
    echo "   The build will continue but Google OAuth may not work"
fi

echo "📝 Environment:"
echo "   APP_STAGE: $APP_STAGE"
echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:+SET}"
echo "   GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:+SET}"

# Step 1: Create build environment file
echo "📦 Creating build environment file..."
node scripts/build-env.js

# Step 2: Build the application
echo "🔨 Building application..."
bun run build

# Step 3: Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f src/main/build-env.js

echo "✅ Development build completed successfully!"
echo "📁 Output files:"
echo "   - dist/mac-arm64/taskbar2.app"
echo "   - dist/taskbar2-0.8.3-arm64.dmg"
echo "   - dist/taskbar2-0.8.3-arm64-mac.zip"

