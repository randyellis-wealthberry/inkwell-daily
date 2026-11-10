#!/bin/sh
# Build a macOS installer for the standalone binary.
#
#   npm run bundle && npm run pkg
#   SIGN_IDENTITY="Developer ID Installer: Your Name (TEAMID)" npm run pkg
#
# Without SIGN_IDENTITY the .pkg is unsigned and Gatekeeper will warn when it
# is opened. Signing and notarizing need an Apple Developer account:
#
#   xcrun notarytool submit dist/macos/InkwellDaily-X.Y.Z.pkg \
#     --keychain-profile inkwell --wait
#   xcrun stapler staple dist/macos/InkwellDaily-X.Y.Z.pkg
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")"
BINARY="$ROOT/dist/standalone/inkwell-daily"
APP="$ROOT/dist/macos/Inkwell.app"
OUT="$ROOT/dist/macos"
WORK="$OUT/work"
PKG="$OUT/InkwellDaily-$VERSION.pkg"
DMG="$OUT/InkwellDaily-$VERSION.dmg"
case "$(uname -m)" in
  arm64)  MENUBAR_ARCH="macos-arm64" ;;
  x86_64) MENUBAR_ARCH="macos-x64" ;;
  *)      MENUBAR_ARCH="macos-$(uname -m)" ;;
esac
MENUBAR_ZIP="$OUT/InkwellDaily-menubar-$MENUBAR_ARCH.zip"

[ -x "$BINARY" ] || { printf 'Build the standalone binary first: npm run bundle\n' >&2; exit 1; }

"$ROOT/menubar/build.sh"
[ -d "$APP" ] || { printf 'The menu bar app was not built\n' >&2; exit 1; }
ditto -c -k --norsrc --noextattr --keepParent "$APP" "$MENUBAR_ZIP"

rm -rf "$WORK"
mkdir -p "$WORK/root/usr/local/bin" "$WORK/root/Applications" "$WORK/dmg"

install -m 0755 "$BINARY" "$WORK/root/usr/local/bin/inkwell-daily"
ditto "$APP" "$WORK/root/Applications/Inkwell.app"
# Without this, pkgbuild turns extended attributes into `._` payload files.
xattr -cr "$WORK/root" 2>/dev/null || true

pkgbuild \
  --root "$WORK/root" \
  --identifier com.wealthberrylabs.inkwell-daily \
  --version "$VERSION" \
  --scripts "$ROOT/packaging/macos/scripts" \
  --install-location / \
  "$WORK/component.pkg"

sed "s/__VERSION__/$VERSION/g" "$ROOT/packaging/macos/distribution.xml.in" > "$WORK/distribution.xml"
productbuild \
  --distribution "$WORK/distribution.xml" \
  --package-path "$WORK" \
  --resources "$ROOT/packaging/macos" \
  "$PKG"

if [ -n "${SIGN_IDENTITY:-}" ]; then
  productsign --sign "$SIGN_IDENTITY" "$PKG" "$WORK/signed.pkg"
  mv "$WORK/signed.pkg" "$PKG"
  printf 'Signed %s\n' "$PKG"
else
  printf 'Built %s (unsigned)\n' "$PKG"
fi

install -m 0644 "$PKG" "$WORK/dmg/Inkwell.pkg"
hdiutil create -volname "Inkwell" -srcfolder "$WORK/dmg" -ov -format UDZO "$DMG" >/dev/null

printf 'Built %s\n' "$DMG"
printf 'Built %s\n' "$MENUBAR_ZIP"
printf 'Install with: sudo installer -pkg "%s" -target /\n' "$PKG"
