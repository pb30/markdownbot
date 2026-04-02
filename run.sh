#!/bin/bash
set -e

cd "$(dirname "$0")"

APP_NAME="MarkdownBot"

ensure_deps() {
  if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    echo "📦 Installing dependencies..."
    rm -rf node_modules package-lock.json
    npm install
  fi
}

ensure_native() {
  echo "🔧 Rebuilding native modules for Electron..."
  npx electron-rebuild -f -w node-pty 2>/dev/null || true
  chmod +x node_modules/node-pty/build/Release/spawn-helper 2>/dev/null || true
}

cmd_dev() {
  ensure_deps
  ensure_native
  echo "🚀 Starting ${APP_NAME} in dev mode..."
  npm run dev
}

cmd_build() {
  ensure_deps
  ensure_native
  echo "🔨 Building ${APP_NAME}..."
  npm run build
  npm run package
  echo "✅ Build complete. Output in dist/"
}

cmd_release() {
  cmd_build

  # Find the .app bundle electron-builder produced
  APP_PATH=$(find dist -maxdepth 2 -name "*.app" -type d | head -1)
  if [ -z "$APP_PATH" ]; then
    echo "❌ No .app bundle found in dist/. Build may have failed."
    exit 1
  fi

  echo "📋 Copying to /Applications..."
  rm -rf "/Applications/${APP_NAME}.app"
  cp -R "$APP_PATH" "/Applications/${APP_NAME}.app"
  echo "✅ Installed to /Applications/${APP_NAME}.app"
}

case "${1:-dev}" in
  dev)     cmd_dev ;;
  build)   cmd_build ;;
  release) cmd_release ;;
  *)
    echo "Usage: ./run.sh [dev|build|release]"
    echo ""
    echo "  dev      Install deps and start in dev mode (default)"
    echo "  build    Build the app and package it"
    echo "  release  Build, package, and copy to /Applications"
    exit 1
    ;;
esac
