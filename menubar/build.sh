#!/bin/sh
# Build the menu bar app bundle. Add --open to install it in /Applications
# (or ~/Applications when that isn't writable) and launch it.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MENUBAR="$ROOT/menubar"
APP_NAME="Inkwell Daily"
EXECUTABLE="InkwellDaily"
CONFIG="${CONFIGURATION:-release}"
VERSION="$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")"
BUILD="$(date +%Y%m%d%H%M)"

ICON="$MENUBAR/Icon/AppIcon.icon"
ICON_OUT="$MENUBAR/Resources/Assets.car"
# The compiled icon is committed so release machines need no Icon Composer.
# After editing the .icon, run menubar/tools/make_icon.sh by hand.
if [ ! -f "$ICON_OUT" ] || [ ! -f "$MENUBAR/Resources/AppIcon.icns" ]; then
  "$MENUBAR/tools/make_icon.sh"
fi

swift build -c "$CONFIG" --package-path "$MENUBAR"
BIN="$(swift build -c "$CONFIG" --package-path "$MENUBAR" --show-bin-path)/$EXECUTABLE"
APP="$ROOT/dist/macos/$APP_NAME.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$EXECUTABLE"
cp "$MENUBAR/Resources/Assets.car" "$MENUBAR/Resources/AppIcon.icns" "$APP/Contents/Resources/"
sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUILD__/$BUILD/g" "$MENUBAR/Info.plist.in" > "$APP/Contents/Info.plist"
plutil -lint "$APP/Contents/Info.plist" >/dev/null

SIGN_IDENTITY="${APP_SIGN_IDENTITY:--}"
codesign --force --sign "$SIGN_IDENTITY" "$APP"
echo "Built $APP"

if [ "${1:-}" = "--open" ]; then
  DEST="/Applications/$APP_NAME.app"
  if [ ! -w /Applications ]; then
    mkdir -p "$HOME/Applications"
    DEST="$HOME/Applications/$APP_NAME.app"
  fi
  rm -rf "$DEST"
  ditto "$APP" "$DEST"
  pkill -f "$APP_NAME.app/Contents/MacOS/$EXECUTABLE" 2>/dev/null || true
  open "$DEST"
  echo "Installed $DEST"
fi
