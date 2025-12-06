#!/bin/bash

# Build script for taskbar2 with environment variables
# Usage: ./build.sh [environment]
# Example: ./build.sh production

set -e  # Exit on any error

# Default environment
ENVIRONMENT=${1:-production}

echo "🚀 Building taskbar2 for $ENVIRONMENT environment..."

# Check if required environment variables are set
if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo "❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    echo "Usage: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy ./build.sh"
    exit 1
fi

# Set APP_STAGE if not already set
export APP_STAGE=${APP_STAGE:-$ENVIRONMENT}

echo "📝 Environment variables:"
echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "   GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:10}..."
echo "   APP_STAGE: $APP_STAGE"

# Step 1: Create build environment file
echo "📦 Creating build environment file..."
node scripts/build-env.js

# Step 2: Build the application
echo "🔨 Building application..."
bun run build

# Step 3: Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f src/main/build-env.js

echo "✅ Build completed successfully!"
echo "📁 Output files:"
echo "   - dist/mac-arm64/taskbar2.app"
echo "   - dist/taskbar2-0.8.3-arm64.dmg"
echo "   - dist/taskbar2-0.8.3-arm64-mac.zip"

# Optional: Open the dist folder
if command -v open >/dev/null 2>&1; then
    echo "📂 Opening dist folder..."
    open dist
fi

