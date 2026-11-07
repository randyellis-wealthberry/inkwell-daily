#!/bin/sh
# Fill the Homebrew formula for a released tag and put it in a tap clone.
#
#   scripts/update-tap.sh 1.0.0
#   HOMEBREW_TAP_DIR=../homebrew-tap scripts/update-tap.sh 1.0.0
#
# The tap repository must be named `homebrew-<something>`; with the default
# name `homebrew-tap`, users install with:
#
#   brew install randyellis-wealthberry/tap/inkwell-daily
set -eu

VERSION="${1:-}"
[ -n "$VERSION" ] || { printf 'usage: %s VERSION (for example 1.0.0)\n' "$0" >&2; exit 2; }
case "$VERSION" in v*) VERSION="${VERSION#v}" ;; esac

REPO="${INKWELL_REPO:-randyellis-wealthberry/inkwell-daily}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/packaging/homebrew/inkwell-daily.rb.in"
OUT="${HOMEBREW_TAP_DIR:-$ROOT/dist/homebrew}/Formula/inkwell-daily.rb"
TARBALL="https://github.com/$REPO/archive/refs/tags/v$VERSION.tar.gz"

printf 'Checksumming %s\n' "$TARBALL"
SHA256="$(curl -fsSL "$TARBALL" | shasum -a 256 | awk '{print $1}')"

mkdir -p "$(dirname "$OUT")"
sed -e "s/__VERSION__/$VERSION/g" -e "s/__SHA256__/$SHA256/g" "$TEMPLATE" > "$OUT"
printf 'Wrote %s\n' "$OUT"

if [ -n "${HOMEBREW_TAP_DIR:-}" ]; then
  printf 'Commit and push it from %s:\n  git add Formula/inkwell-daily.rb && git commit -m "inkwell-daily %s" && git push\n' "$HOMEBREW_TAP_DIR" "$VERSION"
fi
