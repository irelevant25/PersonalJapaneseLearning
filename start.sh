#!/usr/bin/env bash

set -u

# ============================================================
# Personal Japanese Learning - Project Launcher
# Linux / macOS
# ============================================================

PROJECT_NAME="PersonalJapaneseLearning"
NVM_INSTALL_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh"

SERVER_STARTUP_TIMEOUT=30

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

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

clear 2>/dev/null || true

echo ""
echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  $PROJECT_NAME${NC}"
echo -e "${BOLD}  Project Launcher${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""

# ------------------------------------------------------------
# 1. Check project directory
# ------------------------------------------------------------

info "Checking project directory..."

if [ ! -f ".nvmrc" ]; then
    die "Could not find .nvmrc.

Please run this script from the root of the $PROJECT_NAME project."
fi

if [ ! -f "package.json" ]; then
    die "Could not find package.json.

Please run this script from the root of the $PROJECT_NAME project."
fi

success "Project directory OK."
echo ""

# ------------------------------------------------------------
# 2. Read package.json
# ------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
    # Node may not exist yet, which is fine.
    PACKAGE_JSON_NODE=""
else
    PACKAGE_JSON_NODE="$(node -e '
        try {
            const p = require("./package.json");
            process.stdout.write(
                p.engines && p.engines.node
                    ? String(p.engines.node)
                    : ""
            );
        } catch {
            process.exit(1);
        }
    ' 2>/dev/null || true)"
fi

# ------------------------------------------------------------
# 3. Determine required Node version
# ------------------------------------------------------------

if [ -n "$PACKAGE_JSON_NODE" ]; then
    REQUIRED_NODE_VERSION="$PACKAGE_JSON_NODE"
else
    REQUIRED_NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
fi

REQUIRED_NODE_VERSION="${REQUIRED_NODE_VERSION#v}"

if [ -z "$REQUIRED_NODE_VERSION" ]; then
    die "Could not determine the required Node.js version."
fi

if [[ ! "$REQUIRED_NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "The project specifies an unsupported Node.js version:

$REQUIRED_NODE_VERSION

This launcher expects an exact version such as:

22.15.0"
fi

success "Required Node.js version: v$REQUIRED_NODE_VERSION"
echo ""

# ------------------------------------------------------------
# 4. Determine application host and port
# ------------------------------------------------------------

HOST="$(node -e '
try {
    const p = require("./package.json");
    process.stdout.write(
        p.config && p.config.host
            ? String(p.config.host)
            : "127.0.0.1"
    );
} catch {
    process.stdout.write("127.0.0.1");
}
' 2>/dev/null)"

PORT="$(node -e '
try {
    const p = require("./package.json");
    process.stdout.write(
        p.config && p.config.port
            ? String(p.config.port)
            : "3000"
    );
} catch {
    process.stdout.write("3000");
}
' 2>/dev/null)"

# Node may not be installed yet (step 7 installs it), so node -e printed
# nothing: show the defaults for now. Step 9 reads package.json again.
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

if [ -z "$HOST" ]; then
    die "The host in package.json is empty."
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    die "Invalid application port: $PORT"
fi

APP_URL="http://${HOST}:${PORT}"

success "Application host: $HOST"
success "Application port: $PORT"
success "Application URL:  $APP_URL"
echo ""

# ------------------------------------------------------------
# 5. Load NVM
# ------------------------------------------------------------

load_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # shellcheck disable=SC1090
        . "$NVM_DIR/nvm.sh"
    fi
}

load_nvm

# ------------------------------------------------------------
# 6. Check NVM
# ------------------------------------------------------------

info "Checking NVM..."

if ! command -v nvm >/dev/null 2>&1; then

    warning "NVM was not found."

    echo ""
    echo "NVM is required to manage the Node.js version used by"
    echo "this project."
    echo ""

    if ! ask_yes_no "Install NVM now?"; then
        die "NVM is required."
    fi

    echo ""
    info "Installing NVM..."
    echo ""

    if command -v curl >/dev/null 2>&1; then
        curl -o- "$NVM_INSTALL_URL" | bash
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$NVM_INSTALL_URL" | bash
    else
        die "Neither curl nor wget is installed.

Please install curl or wget and run this script again."
    fi

    load_nvm

    if ! command -v nvm >/dev/null 2>&1; then

        for profile in \
            "$HOME/.bashrc" \
            "$HOME/.bash_profile" \
            "$HOME/.profile" \
            "$HOME/.zshrc"
        do
            if [ -f "$profile" ]; then
                # shellcheck disable=SC1090
                . "$profile" 2>/dev/null || true
            fi

            if command -v nvm >/dev/null 2>&1; then
                break
            fi
        done
    fi

    if ! command -v nvm >/dev/null 2>&1; then
        die "NVM was installed but could not be loaded.

Please open a new terminal and run the launcher again."
    fi

    success "NVM installed successfully."

else
    success "NVM found."
fi

echo ""

# ------------------------------------------------------------
# 7. Check Node version
# ------------------------------------------------------------

info "Checking Node.js v$REQUIRED_NODE_VERSION..."

if nvm ls "$REQUIRED_NODE_VERSION" 2>/dev/null | grep -Eq "v?$REQUIRED_NODE_VERSION"; then
    success "Node.js v$REQUIRED_NODE_VERSION is installed."
else

    warning "Node.js v$REQUIRED_NODE_VERSION is not installed."

    echo ""

    if ! ask_yes_no "Install Node.js v$REQUIRED_NODE_VERSION now?"; then
        die "The required Node.js version is not installed."
    fi

    echo ""
    info "Installing Node.js v$REQUIRED_NODE_VERSION..."
    echo ""

    if ! nvm install "$REQUIRED_NODE_VERSION"; then
        die "Failed to install Node.js v$REQUIRED_NODE_VERSION."
    fi

    success "Node.js v$REQUIRED_NODE_VERSION installed."
fi

echo ""

# ------------------------------------------------------------
# 8. Activate Node
# ------------------------------------------------------------

info "Activating Node.js v$REQUIRED_NODE_VERSION..."

if ! nvm use "$REQUIRED_NODE_VERSION"; then
    die "Could not activate Node.js v$REQUIRED_NODE_VERSION."
fi

CURRENT_NODE_VERSION="$(node --version)"
EXPECTED_NODE_VERSION="v$REQUIRED_NODE_VERSION"

if [ "$CURRENT_NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then
    die "Wrong Node.js version is active.

Expected: $EXPECTED_NODE_VERSION
Found:    $CURRENT_NODE_VERSION"
fi

success "Node.js $CURRENT_NODE_VERSION is active."
echo ""

# ------------------------------------------------------------
# 9. Determine application host and port
# ------------------------------------------------------------

APP_HOST="$(node -e '
try {
    const p = require("./package.json");
    process.stdout.write(
        p.config && p.config.host
            ? String(p.config.host)
            : "127.0.0.1"
    );
} catch {
    process.exit(1);
}
' 2>/dev/null)" || die "Could not read application host from package.json."

APP_PORT="$(node -e '
try {
    const p = require("./package.json");
    process.stdout.write(
        p.config && p.config.port
            ? String(p.config.port)
            : "3000"
    );
} catch {
    process.exit(1);
}
' 2>/dev/null)" || die "Could not read application port from package.json."

if [ -z "$APP_HOST" ]; then
    die "The host in package.json is empty."
fi

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || \
   [ "$APP_PORT" -lt 1 ] || \
   [ "$APP_PORT" -gt 65535 ]; then
    die "Invalid application port: $APP_PORT"
fi

APP_URL="http://${APP_HOST}:${APP_PORT}"

success "Application host: $APP_HOST"
success "Application port: $APP_PORT"
success "Application URL:  $APP_URL"
echo ""


# ------------------------------------------------------------
# 10. Check npm
# ------------------------------------------------------------

info "Checking npm..."

if ! command -v npm >/dev/null 2>&1; then
    die "npm was not found."
fi

NPM_VERSION="$(npm --version)"

success "npm v$NPM_VERSION found."
echo ""

# ------------------------------------------------------------
# 11. Install dependencies
# ------------------------------------------------------------

info "Checking project dependencies..."

if [ -f "package-lock.json" ]; then

    if [ ! -d "node_modules" ]; then

        echo ""
        info "Installing project dependencies with npm ci..."
        echo ""

        if ! npm ci; then
            die "npm ci failed."
        fi

        success "Dependencies installed."

    else

        success "Dependencies already installed."

    fi

else

    warning "package-lock.json was not found."

    echo ""
    echo "A package-lock.json is recommended for reproducible installs."
    echo "Running npm install instead."
    echo ""

    if ! npm install; then
        die "npm install failed."
    fi

    success "Dependencies installed."
fi

echo ""

# ------------------------------------------------------------
# 12. Check start script
# ------------------------------------------------------------

info "Checking project start command..."

HAS_START_SCRIPT="$(node -e '
const p = require("./package.json");
process.stdout.write(
    p.scripts && p.scripts.start
        ? "yes"
        : "no"
);
' 2>/dev/null)"

if [ "$HAS_START_SCRIPT" != "yes" ]; then
    die 'package.json does not contain a "start" script.

Expected something like:

    "scripts": {
        "start": "node server/index.js"
    }'
fi

success "Start command found."
echo ""

# ------------------------------------------------------------
# 13. Environment ready
# ------------------------------------------------------------

echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  Environment ready${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""

echo "Node.js: $CURRENT_NODE_VERSION"
echo "npm:     v$NPM_VERSION"
echo "URL:     $APP_URL"
echo ""

# ------------------------------------------------------------
# 14. Ask whether to start
# ------------------------------------------------------------

if ! ask_yes_no "Start $PROJECT_NAME now?"; then

    echo ""
    success "Setup complete."
    echo ""

    exit 0
fi

echo ""
info "Starting $PROJECT_NAME..."
echo ""

# ------------------------------------------------------------
# 15. Start server in background
# ------------------------------------------------------------

npm start &
SERVER_PID=$!

info "Waiting for server at $APP_URL..."

SERVER_READY=false
START_TIME=$(date +%s)

while true; do

    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [ "$ELAPSED" -ge "$SERVER_STARTUP_TIMEOUT" ]; then
        break
    fi

    # Check whether the server process is still alive.
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi

    sleep 0.5

    if command -v curl >/dev/null 2>&1; then

        if curl \
            --silent \
            --output /dev/null \
            --max-time 2 \
            "$APP_URL"; then

            SERVER_READY=true
            break
        fi

    elif command -v wget >/dev/null 2>&1; then

        if wget \
            --quiet \
            --spider \
            --timeout=2 \
            "$APP_URL"; then

            SERVER_READY=true
            break
        fi
    fi

done

# ------------------------------------------------------------
# 16. Open browser
# ------------------------------------------------------------

if [ "$SERVER_READY" = true ]; then

    success "Server is ready."
    echo ""

    info "Opening $APP_URL..."

    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$APP_URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$APP_URL"
    else
        warning "Could not automatically open a browser."
        echo ""
        echo "Open this address manually:"
        echo ""
        echo "    $APP_URL"
    fi

    echo ""
    success "Application is running."
    echo ""
    echo "URL: $APP_URL"
    echo ""
    echo "Press Ctrl+C to stop the application."
    echo ""

    wait "$SERVER_PID"

else

    if ! kill -0 "$SERVER_PID" 2>/dev/null; then

        error "The server stopped before becoming ready."
        echo ""
        echo "Check the output above for the error."
        echo ""

        wait "$SERVER_PID"
        exit $?

    else

        warning "The server did not respond within ${SERVER_STARTUP_TIMEOUT}s."

        echo ""
        echo "The server is still running."
        echo "Opening $APP_URL anyway..."
        echo ""

        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$APP_URL" >/dev/null 2>&1 &
        elif command -v open >/dev/null 2>&1; then
            open "$APP_URL"
        fi

        wait "$SERVER_PID"
    fi
fi
