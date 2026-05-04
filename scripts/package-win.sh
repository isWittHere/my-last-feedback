#!/usr/bin/env bash
# Build & package My Last Feedback for Windows (x64)
# Run from project root: bash scripts/package-win.sh

set -e

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$PROJ_ROOT/app"

# Read version from package.json (requires node)
VERSION="$(node -e "console.log(require('$PROJ_ROOT/package.json').version)")"
DIST_DIR="$PROJ_ROOT/dist/win-x64/my-last-feedback"
ZIP_NAME="my-last-feedback-v${VERSION}-win-x64.zip"
ZIP_PATH="$PROJ_ROOT/dist/win-x64/$ZIP_NAME"

echo "=== My Last Feedback — Windows x64 Package Builder ==="
echo "    Version : $VERSION"
echo "    Output  : $DIST_DIR"

# 1. Build Tauri app
echo "[1/6] Building Tauri app (release)..."
cd "$APP_DIR"
npx tauri build --no-bundle

BINARY="$APP_DIR/src-tauri/target/release/app.exe"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: app.exe not found at $BINARY"
  exit 1
fi
echo "      Binary: $BINARY ($(du -h "$BINARY" | cut -f1))"

# 2. Prepare dist directory
echo "[2/6] Preparing dist directory..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/mcp_prompts"

# 3. Copy files
echo "[3/6] Copying files..."
cp "$BINARY"                         "$DIST_DIR/app.exe"
cp -R "$PROJ_ROOT/mcp"               "$DIST_DIR/mcp"
cp "$PROJ_ROOT/package.json"         "$DIST_DIR/package.json"
cp "$PROJ_ROOT/mcp.json.template"    "$DIST_DIR/mcp.json.template"
cp "$PROJ_ROOT/dist/SETUP.md"        "$DIST_DIR/SETUP.md"
cp "$PROJ_ROOT/dist/prompt.instructions.md" "$DIST_DIR/prompt.instructions.md"

# Copy example prompts
cp "$PROJ_ROOT/mcp_prompts/"*.prompt.md "$DIST_DIR/mcp_prompts/" 2>/dev/null || true

# 4. Install MCP Server production dependencies
echo "[4/6] Installing MCP Server Node.js dependencies..."
cd "$DIST_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 5. Create zip archive
echo "[5/6] Creating zip archive..."
cd "$PROJ_ROOT/dist/win-x64"
rm -f "$ZIP_PATH"
zip -r "$ZIP_NAME" my-last-feedback/
echo "      Archive: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"

# 6. Summary
echo ""
echo "[6/6] Package complete!"
echo ""
echo "  Version : v${VERSION}"
echo "  Output  : $DIST_DIR"
echo "  Archive : $ZIP_PATH"
echo ""
echo "  Contents:"
ls -lh "$DIST_DIR"
echo ""
echo "  Total size: $(du -sh "$DIST_DIR" | cut -f1)"
