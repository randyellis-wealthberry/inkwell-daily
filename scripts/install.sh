#!/bin/sh
# Inkwell Daily installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.sh | sh
#
# Options (when piped, pass them to sh):
#   sh -s -- --hour 7 --no-open
#
#   --hour H       morning hour, 0-23 (default 5)
#   --no-open      don't open the first edition when the install finishes
#   --no-schedule  install the command but don't set the morning run
#   --version V    install tag vV (default: the latest release, else main)
#   --uninstall    remove the command and the morning run
#
# Environment: INKWELL_VERSION, INKWELL_HOUR, INKWELL_REPO
set -eu

REPO="${INKWELL_REPO:-randyellis-wealthberry/inkwell-daily}"
VERSION="${INKWELL_VERSION:-}"
HOUR="${INKWELL_HOUR:-5}"
OPEN=1
SCHEDULE=1
UNINSTALL=0

say()  { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die()  { warn "inkwell-daily: $*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --hour)        [ $# -ge 2 ] || die "--hour needs a number"; HOUR="$2"; shift 2 ;;
    --hour=*)      HOUR="${1#*=}"; shift ;;
    --version)     [ $# -ge 2 ] || die "--version needs a value"; VERSION="$2"; shift 2 ;;
    --version=*)   VERSION="${1#*=}"; shift ;;
    --no-open)     OPEN=0; shift ;;
    --no-schedule) SCHEDULE=0; shift ;;
    --uninstall)   UNINSTALL=1; shift ;;
    -h|--help)
      cat <<'EOF'
Inkwell Daily installer for macOS and Linux.

  curl -fsSL https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.sh | sh -s -- [options]

Options:
  --hour H       morning hour, 0-23 (default 5)
  --no-open      don't open the first edition when the install finishes
  --no-schedule  install the command but don't set the morning run
  --version V    install tag vV (default: main)
  --uninstall    remove the command and the morning run
  -h, --help     this text
EOF
      exit 0 ;;
    *)             die "unknown option: $1" ;;
  esac
done

case "$HOUR" in
  ''|*[!0-9]*) die "--hour must be a number from 0 to 23" ;;
esac
[ "$HOUR" -ge 0 ] && [ "$HOUR" -le 23 ] || die "--hour must be a number from 0 to 23"

# ---- uninstall -------------------------------------------------------------------------

if [ "$UNINSTALL" = "1" ]; then
  if command -v inkwell-daily >/dev/null 2>&1; then
    inkwell-daily uninstall || true
  fi
  if command -v npm >/dev/null 2>&1; then
    npm uninstall -g inkwell-daily >/dev/null 2>&1 || true
  fi
  say "Inkwell Daily is off. Your editions were left in place."
  exit 0
fi

# ---- Node 20 or later ------------------------------------------------------------------

node_major() {
  [ -n "${1:-}" ] || return 1
  "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || return 1
}

NODE=""
if command -v node >/dev/null 2>&1; then
  v="$(node_major node)" || v=0
  [ "$v" -ge 20 ] && NODE="$(command -v node)"
fi

if [ -z "$NODE" ]; then
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    say "Node.js 20 or later is needed; installing it with Homebrew..."
    brew install node
    v="$(node_major node)" || v=0
    [ "$v" -ge 20 ] && NODE="$(command -v node)"
  fi
fi

if [ -z "$NODE" ]; then
  die "Node.js 20 or later is required. Install it from https://nodejs.org (or with 'brew install node'), then run this again."
fi

if ! command -v npm >/dev/null 2>&1; then
  die "npm was not found beside $NODE. Install the full Node.js distribution, then run this again."
fi

# ---- install the package ---------------------------------------------------------------

if [ -n "$VERSION" ]; then
  case "$VERSION" in v*) TAG="$VERSION" ;; *) TAG="v$VERSION" ;; esac
  SOURCE="https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz"
  say "Installing Inkwell Daily $TAG..."
else
  # Prefer the newest release tag so an install is reproducible; fall back to
  # main when there is no release yet or GitHub's API is rate-limited.
  VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
    | sed -n 's/.*"tag_name":[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1 || true)"
  if [ -n "$VERSION" ]; then
    SOURCE="https://github.com/$REPO/archive/refs/tags/v$VERSION.tar.gz"
    say "Installing Inkwell Daily v$VERSION..."
  else
    SOURCE="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
    say "Installing Inkwell Daily from main..."
  fi
fi

# A global npm prefix under nvm or Homebrew is writable without sudo. If it
# isn't, fall back to a per-user prefix rather than asking for a password.
PREFIX="$(npm config get prefix 2>/dev/null || true)"
if [ -n "$PREFIX" ] && [ ! -w "$PREFIX/lib/node_modules" ] 2>/dev/null; then
  ALT="${XDG_DATA_HOME:-$HOME/.local/share}/inkwell-daily"
  say "The global npm folder isn't writable; installing under $ALT instead."
  npm install -g --prefix "$ALT" "$SOURCE"
  BIN_DIR="$ALT/bin"
else
  npm install -g "$SOURCE"
  BIN_DIR="$(npm prefix -g 2>/dev/null)/bin"
fi

# Make sure the command is reachable from a plain shell.
if ! command -v inkwell-daily >/dev/null 2>&1; then
  if [ -x "$BIN_DIR/inkwell-daily" ]; then
    if [ -d "$HOME/.local/bin" ] && case ":$PATH:" in *":$HOME/.local/bin:"*) true ;; *) false ;; esac; then
      ln -sf "$BIN_DIR/inkwell-daily" "$HOME/.local/bin/inkwell-daily"
      say "Linked inkwell-daily into $HOME/.local/bin."
    elif [ -w /usr/local/bin ]; then
      ln -sf "$BIN_DIR/inkwell-daily" /usr/local/bin/inkwell-daily
      say "Linked inkwell-daily into /usr/local/bin."
    else
      warn "Add this to your PATH: $BIN_DIR"
    fi
  fi
fi

# ---- first edition and the morning run -------------------------------------------------

INKWELL="$(command -v inkwell-daily 2>/dev/null || printf '%s' "$BIN_DIR/inkwell-daily")"

if [ "$SCHEDULE" = "1" ]; then
  "$INKWELL" install --hour "$HOUR"
fi

say "Setting yesterday's edition..."
if "$INKWELL" build; then
  if [ "$OPEN" = "1" ]; then
    "$INKWELL" open || true
  fi
else
  warn "The first edition could not be set (are you offline?). Try: inkwell-daily build"
fi

say ""
say "Inkwell Daily is installed. Read it with: inkwell-daily open"
say "Change the morning hour with: inkwell-daily install --hour 7"
