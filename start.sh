#!/usr/bin/env bash

set -u

# ============================================================
# Japanese Academy - Launcher
# Linux / macOS
#
# Finds PHP (8.1 or newer, with pdo_pgsql, mbstring and intl), runs
# setup.php (database settings the first time; then the database, its
# tables and the study content), starts the server and opens the browser.
# Ctrl+C stops it.
# ============================================================

PROJECT_NAME="Japanese Academy"

# The first start builds the study content in the database (a few seconds).
SERVER_STARTUP_TIMEOUT=60

# ------------------------------------------------------------
# Colors
# ------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

info() {
    echo -e "${CYAN}$1${NC}"
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warning() {
    echo -e "${YELLOW}$1${NC}"
}

error() {
    echo -e "${RED}$1${NC}"
}

die() {
    error ""
    error "ERROR: $1"
    echo ""
    exit 1
}

ask_yes_no() {
    local question="$1"
    local answer

    while true; do
        read -r -p "$question [Y/n]: " answer

        case "$answer" in
            [Yy]|[Yy][Ee][Ss]|"")
                return 0
                ;;
            [Nn]|[Nn][Oo])
                return 1
                ;;
            *)
                echo "Please answer Y or N."
                ;;
        esac
    done
}

# Prints nothing when this PHP can run the app, else the reason it can't.
php_problem() {
    local php="$1" version major minor modules missing=""

    version="$("$php" -v 2>/dev/null | sed -n 's/^PHP \([0-9][0-9]*\.[0-9][0-9]*\.[^ ]*\).*/\1/p' | head -n 1)"
    if [ -z "$version" ]; then
        echo "does not run"
        return
    fi
    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"
    if [ "$major" -lt 8 ] || { [ "$major" -eq 8 ] && [ "$minor" -lt 1 ]; }; then
        echo "PHP $version is too old"
        return
    fi

    modules="$("$php" -m 2>/dev/null)"
    for ext in pdo_pgsql mbstring intl; do
        if ! printf '%s\n' "$modules" | grep -qix "$ext"; then
            missing="$missing $ext"
        fi
    done
    if [ -n "$missing" ]; then
        echo "PHP $version lacks$missing"
    fi
}

# Every php worth trying: ACADEMY_PHP, PATH, the usual install folders.
php_candidates() {
    {
        [ -n "${ACADEMY_PHP:-}" ] && echo "$ACADEMY_PHP"
        type -ap php 2>/dev/null
        echo /opt/homebrew/bin/php
        echo /usr/local/bin/php
        echo /usr/bin/php
    } | awk '!seen[$0]++' | while read -r candidate; do
        [ -x "$candidate" ] && echo "$candidate"
    done
}

open_browser() {
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$1"
    else
        warning "Open $1 in your browser."
    fi
}

# 0 when the app answers at this address.
app_answers() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsS -m 2 "$1/api/health" >/dev/null 2>&1
    else
        "$PHP" -r 'exit(@file_get_contents($argv[1] . "/api/health") === false ? 1 : 0);' "$1"
    fi
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

clear 2>/dev/null || true

echo ""
echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  $PROJECT_NAME${NC}"
echo -e "${BOLD}  Launcher${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
cd "$(dirname "$0")" || die "Cannot enter the folder of this script."

if [ ! -f server.php ] || [ ! -f setup.php ]; then
    die "server.php or setup.php is missing. This script belongs in the $PROJECT_NAME folder."
fi

# ------------------------------------------------------------
# 2. PHP
# ------------------------------------------------------------

info "Looking for PHP 8.1+ with pdo_pgsql, mbstring and intl..."

PHP=""
TRIED=""

while read -r candidate; do
    problem="$(php_problem "$candidate")"
    if [ -z "$problem" ]; then
        PHP="$candidate"
        break
    fi
    TRIED="$TRIED
    $candidate  ($problem)"
done <<EOF
$(php_candidates)
EOF

if [ -z "$PHP" ]; then
    if [ -n "$TRIED" ]; then
        error "Tried:$TRIED"
    fi
    die "No PHP 8.1 or newer with the extensions pdo_pgsql, mbstring and intl was found.

To install it:
    macOS (Homebrew):   brew install php
    Debian / Ubuntu:    sudo apt install php-cli php-pgsql php-mbstring php-intl php-curl
    Fedora:             sudo dnf install php-cli php-pgsql php-mbstring php-intl

Or set ACADEMY_PHP to the php to use. Then run this launcher again."
fi

success "PHP: $PHP"
echo ""

# ------------------------------------------------------------
# 3. The database
# ------------------------------------------------------------

info "Checking the database..."
echo ""

# The first time, setup.php asks for the database settings. After that it
# only does what is still missing: the database, its tables, the study
# content, and the one-time import of your old progress files.
if ! "$PHP" setup.php; then
    die "Setup did not finish: the message above says why.

If it is about the database: PostgreSQL must be installed and running
(https://www.postgresql.org/download/), and its settings are in
src/config.local.php. To enter them again, delete that file and run this
launcher again."
fi

echo ""

APP_URL="$("$PHP" server.php --url)"
APP_PORT="${APP_URL##*:}"

case "$APP_PORT" in
    ''|*[!0-9]*) die "Could not read the server's address from src/config.php." ;;
esac

# ------------------------------------------------------------
# 4. Start
# ------------------------------------------------------------

if app_answers "$APP_URL"; then
    success "$PROJECT_NAME is already running."
    open_browser "$APP_URL"
    exit 0
fi

echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  Ready${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""
echo "PHP: $PHP"
echo "URL: $APP_URL"
echo ""

if ! ask_yes_no "Start $PROJECT_NAME now?"; then
    echo ""
    success "Setup complete."
    echo ""
    exit 0
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port $APP_PORT is taken:
$(lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN)

If that is an older copy of this app, stop it first."
fi

echo ""
info "Starting $PROJECT_NAME..."

TEMP_DIR="${TMPDIR:-/tmp}/JapaneseAcademy"
STDOUT_FILE="$TEMP_DIR/server.stdout.log"
STDERR_FILE="$TEMP_DIR/server.stderr.log"

mkdir -p "$TEMP_DIR"
rm -f "$STDOUT_FILE" "$STDERR_FILE"

"$PHP" server.php >"$STDOUT_FILE" 2>"$STDERR_FILE" &
SERVER_PID=$!

# Ctrl+C lands here too. server.php runs PHP's web server as a child
# process: stop both.
stop_server() {
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        pkill -P "$SERVER_PID" 2>/dev/null
        kill "$SERVER_PID" 2>/dev/null
    fi
    rm -f "$STDOUT_FILE" "$STDERR_FILE"
}
trap stop_server EXIT
trap 'exit 130' INT TERM

info "Waiting for $APP_URL..."

READY=0
for _ in $(seq 1 $((SERVER_STARTUP_TIMEOUT * 2))); do
    sleep 0.5
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi
    if app_answers "$APP_URL"; then
        READY=1
        break
    fi
done

if [ "$READY" -ne 1 ]; then
    error "The server did not start."
    echo ""
    cat "$STDOUT_FILE" 2>/dev/null
    tail -n 20 "$STDERR_FILE" 2>/dev/null
    exit 1
fi

success "Server is ready."
echo ""

# what the server says about itself: items, questions, the day's backup
cat "$STDOUT_FILE" 2>/dev/null

info "Opening $APP_URL..."
open_browser "$APP_URL"

echo ""
success "$PROJECT_NAME is running."
echo ""
echo "Press Ctrl+C to stop it."
echo ""

wait "$SERVER_PID"
