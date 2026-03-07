#!/usr/bin/env bash
# Build & package My Last Feedback for macOS (arm64/universal)
# Run on a Mac from project root: bash scripts/package-mac.sh

set -e

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$PROJ_ROOT/dist/mac-arm64/my-last-feedback"
APP_DIR="$PROJ_ROOT/app"

echo "=== My Last Feedback — macOS Package Builder ==="

# Check we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: This script must be run on macOS."
  echo "       Cross-compilation from Windows/Linux is not supported by Tauri."
  exit 1
fi

# 1. Build Tauri app
echo "[1/5] Building Tauri app (release)..."
cd "$APP_DIR"
npx tauri build --no-bundle

BINARY="$APP_DIR/src-tauri/target/release/app"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: app binary not found at $BINARY"
  exit 1
fi
echo "      Binary: $BINARY ($(du -h "$BINARY" | cut -f1))"

# 2. Prepare dist directory
echo "[2/5] Preparing dist directory..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/mcp_prompts"

# 3. Copy files
echo "[3/5] Copying files..."
cp "$BINARY"                         "$DIST_DIR/app"
chmod +x                             "$DIST_DIR/app"
cp "$PROJ_ROOT/server.mjs"           "$DIST_DIR/server.mjs"
cp "$PROJ_ROOT/package.json"         "$DIST_DIR/package.json"
cp "$PROJ_ROOT/mcp.json.template"    "$DIST_DIR/mcp.json.template"
cp "$PROJ_ROOT/dist/SETUP.md"        "$DIST_DIR/SETUP.md"
cp "$PROJ_ROOT/dist/prompt.instructions.md" "$DIST_DIR/prompt.instructions.md"

# Copy example prompts
cp "$PROJ_ROOT/mcp_prompts/"*.prompt.md "$DIST_DIR/mcp_prompts/" 2>/dev/null || true

# 4. Install production dependencies
echo "[4/5] Installing Node.js dependencies..."
cd "$DIST_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 5. Summary
echo "[5/5] Package complete!"
echo ""
echo "  Output: $DIST_DIR"
echo "  Contents:"
ls -lh "$DIST_DIR"
echo ""
echo "  Total size: $(du -sh "$DIST_DIR" | cut -f1)"
echo ""
echo "To create a tar.gz archive:"
echo "  cd $PROJ_ROOT/dist/mac-arm64 && tar -czf my-last-feedback-mac-arm64.tar.gz my-last-feedback/"
