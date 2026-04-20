#!/usr/bin/env bash
# Build & package My Last Feedback for Windows (x64)
# Run from project root: bash scripts/package-win.sh

set -e

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$PROJ_ROOT/dist/win-x64/my-last-feedback"
APP_DIR="$PROJ_ROOT/app"

echo "=== My Last Feedback — Windows x64 Package Builder ==="

# 1. Build Tauri app
echo "[1/5] Building Tauri app (release)..."
cd "$APP_DIR"
npx tauri build --no-bundle

BINARY="$APP_DIR/src-tauri/target/release/app.exe"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: app.exe not found at $BINARY"
  exit 1
fi
echo "      Binary: $BINARY ($(du -h "$BINARY" | cut -f1))"

# 2. Prepare dist directory
echo "[2/7] Preparing dist directory..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/mcp_prompts"
mkdir -p "$DIST_DIR/mlra-server"
mkdir -p "$DIST_DIR/skills"

# 3. Copy files
echo "[3/7] Copying files..."
cp "$BINARY"                         "$DIST_DIR/app.exe"
cp "$PROJ_ROOT/server.mjs"           "$DIST_DIR/server.mjs"
cp "$PROJ_ROOT/package.json"         "$DIST_DIR/package.json"
cp "$PROJ_ROOT/mcp.json.template"    "$DIST_DIR/mcp.json.template"
cp "$PROJ_ROOT/dist/SETUP.md"        "$DIST_DIR/SETUP.md"
cp "$PROJ_ROOT/dist/prompt.instructions.md" "$DIST_DIR/prompt.instructions.md"

# Copy example prompts
cp "$PROJ_ROOT/mcp_prompts/"*.prompt.md "$DIST_DIR/mcp_prompts/" 2>/dev/null || true

# Copy mlra-server
cp "$PROJ_ROOT/mlra-server/"*.mjs    "$DIST_DIR/mlra-server/"
cp "$PROJ_ROOT/mlra-server/package.json" "$DIST_DIR/mlra-server/"

# Copy skills
cp "$PROJ_ROOT/skills/"*.md          "$DIST_DIR/skills/"

# 4. Install MCP Server production dependencies
echo "[4/7] Installing MCP Server Node.js dependencies..."
cd "$DIST_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 5. Install mlra-server production dependencies
echo "[5/7] Installing mlra-server Node.js dependencies..."
cd "$DIST_DIR/mlra-server"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 6. Summary
echo "[6/7] Verifying package contents..."
echo ""
echo "  Output: $DIST_DIR"
echo "  Contents:"
ls -lh "$DIST_DIR"
echo ""
echo "  Total size: $(du -sh "$DIST_DIR" | cut -f1)"

# 7. Summary
echo ""
echo "[7/7] Package complete!"
echo ""
echo "  Output: $DIST_DIR"
echo "  Contents:"
ls -lh "$DIST_DIR"
echo ""
echo "  Total size: $(du -sh "$DIST_DIR" | cut -f1)"
echo ""
echo "To create a zip archive:"
echo "  cd $PROJ_ROOT/dist/win-x64 && zip -r my-last-feedback-win-x64.zip my-last-feedback/"
