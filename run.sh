#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY="$ROOT/gateway"
ADMIN="$ROOT/admin"

# ─── colors ───────────────────────────────────
CR='\033[0;31m'   # red
CG='\033[0;32m'   # green
CY='\033[1;33m'   # yellow
CC='\033[0;36m'   # cyan
CB='\033[1m'      # bold
CD='\033[2m'      # dim
CV='\033[7m'      # reverse
RS='\033[0m'      # reset

log_info() { printf "${CC}${CB}[fireroute]${RS} %s\n" "$*"; }
log_ok()   { printf "${CG}${CB}[ok]${RS} %s\n" "$*"; }
log_warn() { printf "${CY}${CB}[warn]${RS} %s\n" "$*"; }
log_err()  { printf "${CR}${CB}[error]${RS} %s\n" "$*" >&2; }

# ─── utilities ────────────────────────────────
_dc() { docker compose -f "$ROOT/docker-compose.yml" "$@"; }

ensure_env() {
    if [[ ! -f "$ROOT/.env" ]]; then
        log_warn ".env not found — copying from .env.example"
        cp "$ROOT/.env.example" "$ROOT/.env"
        log_warn "Review $ROOT/.env and set secrets before continuing"
        pause
    fi
}

ensure_deps() {
    command -v node >/dev/null 2>&1 || { log_err "node is not installed"; return 1; }
    command -v npm  >/dev/null 2>&1 || { log_err "npm is not installed";  return 1; }
}

install_if_needed() {
    local dir="$1"
    if [[ ! -d "$dir/node_modules" ]]; then
        log_info "Installing deps in $(basename "$dir")..."
        npm install --prefix "$dir"
    fi
}

pause() {
    printf "\n  ${CD}Press any key to return to menu...${RS} "
    IFS= read -rsn1
    printf "\n"
}

confirm() {
    printf "  ${CY}${CB}%s${RS} [y/N] " "$1"
    IFS= read -r _ans
    [[ "$_ans" =~ ^[Yy]$ ]]
}

# ─── menu engine ──────────────────────────────
# menu_select "Title" item1 item2 ...
# Result index in $MENU_RESULT; -1 on ESC / q
MENU_RESULT=0
KEY=""

# bash 4+ supports fractional seconds in 'read -t'; bash 3.x (macOS system) needs integers
if (( ${BASH_VERSINFO[0]:-3} >= 4 )); then
    _ESC_T="0.1"
else
    _ESC_T="1"
fi

# Reads one logical keypress into $KEY.
# Arrow keys become the full sequence: $'\x1b[A', $'\x1b[B', etc.
_read_key() {
    local a="" b=""
    IFS= read -rsn1 KEY

    [[ "$KEY" != $'\x1b' ]] && return

    # read second byte (should be '[' or 'O' for arrow/function keys)
    IFS= read -rsn1 -t "$_ESC_T" a 2>/dev/null || true
    if [[ -z "$a" ]]; then
        return                              # bare ESC
    fi

    KEY="${KEY}${a}"
    [[ "$a" != '[' && "$a" != 'O' ]] && return  # ESC + other

    # read third byte (A/B/C/D/etc.)
    IFS= read -rsn1 -t "$_ESC_T" b 2>/dev/null || true
    [[ -n "$b" ]] && KEY="${KEY}${b}"
}

_menu_draw() {
    local cur="$1"; shift
    local items=("$@")
    for i in "${!items[@]}"; do
        if [[ $i -eq $cur ]]; then
            printf "  ${CV}${CB}  %-46s  ${RS}\n" "${items[$i]}"
        else
            printf "  ${CD}  %-46s  ${RS}\n" "${items[$i]}"
        fi
    done
}

_menu_close() {
    local n="$1" result="$2"
    tput cnorm 2>/dev/null || true
    tput cuu $((n + 3)) 2>/dev/null || true
    tput ed  2>/dev/null || true
    MENU_RESULT=$result
}

menu_select() {
    local title="$1"; shift
    local items=("$@")
    local n=${#items[@]}
    local cur=0

    printf "\n  ${CC}${CB}%s${RS}\n\n" "$title"
    _menu_draw "$cur" "${items[@]}"
    tput civis 2>/dev/null || true

    while true; do
        _read_key
        case "$KEY" in
            $'\x1b[A'|$'\x1bOA') # up
                [[ $cur -gt 0 ]]        && cur=$((cur - 1))
                ;;
            $'\x1b[B'|$'\x1bOB') # down
                [[ $cur -lt $((n-1)) ]] && cur=$((cur + 1))
                ;;
            $'\x1b')             # plain ESC
                _menu_close "$n" -1; return ;;
            '')                  # Enter
                _menu_close "$n" "$cur"; return ;;
            q|Q)
                _menu_close "$n" -1; return ;;
        esac
        tput cuu "$n" 2>/dev/null || true
        _menu_draw "$cur" "${items[@]}"
    done
}

# ─── header ───────────────────────────────────
header() {
    clear
    printf "\n"
    printf "  ${CC}${CB}┌─────────────────────────────────────────────┐${RS}\n"
    printf "  ${CC}${CB}│          FireRoute  —  Dev CLI               │${RS}\n"
    printf "  ${CC}${CB}└─────────────────────────────────────────────┘${RS}\n"
    printf "  ${CD}  ↑↓ navigate  ·  Enter select  ·  q/ESC back${RS}\n"
}

# ─── submenus ─────────────────────────────────

menu_dev() {
    local items=(
        "gateway + admin   (concurrent watch)"
        "gateway only      (tsx watch)"
        "admin only        (vite dev)"
        "← Back"
    )
    while true; do
        header
        menu_select "Local Dev" "${items[@]}"
        case $MENU_RESULT in
            0)
                ensure_deps || { pause; continue; }
                ensure_env
                install_if_needed "$GATEWAY"
                install_if_needed "$ADMIN"
                log_info "Starting gateway + admin (Ctrl-C to stop)..."
                trap 'kill $(jobs -p) 2>/dev/null || true; trap - INT TERM' INT TERM
                (cd "$GATEWAY" && npm run dev) &
                (cd "$ADMIN"   && npm run dev) &
                wait
                trap - INT TERM
                pause
                ;;
            1)
                ensure_deps || { pause; continue; }
                ensure_env
                install_if_needed "$GATEWAY"
                log_info "Starting gateway (Ctrl-C to stop)..."
                (cd "$GATEWAY" && npm run dev) || true
                pause
                ;;
            2)
                ensure_deps || { pause; continue; }
                install_if_needed "$ADMIN"
                log_info "Starting admin (Ctrl-C to stop)..."
                (cd "$ADMIN" && npm run dev) || true
                pause
                ;;
            3|-1) return ;;
        esac
    done
}

menu_build() {
    local items=(
        "Build all         (gateway + admin)"
        "Build gateway only"
        "Build admin only"
        "← Back"
    )
    while true; do
        header
        menu_select "Build" "${items[@]}"
        case $MENU_RESULT in
            0)
                ensure_deps || { pause; continue; }
                install_if_needed "$GATEWAY"
                install_if_needed "$ADMIN"
                log_info "Building gateway..."
                (cd "$GATEWAY" && npm run build) || { log_err "Gateway build failed"; pause; continue; }
                log_info "Building admin..."
                (cd "$ADMIN"   && npm run build) || { log_err "Admin build failed";   pause; continue; }
                log_ok "Build complete."
                pause
                ;;
            1)
                ensure_deps || { pause; continue; }
                install_if_needed "$GATEWAY"
                log_info "Building gateway..."
                (cd "$GATEWAY" && npm run build) || { log_err "Build failed"; pause; continue; }
                log_ok "Done."
                pause
                ;;
            2)
                ensure_deps || { pause; continue; }
                install_if_needed "$ADMIN"
                log_info "Building admin..."
                (cd "$ADMIN" && npm run build) || { log_err "Build failed"; pause; continue; }
                log_ok "Done."
                pause
                ;;
            3|-1) return ;;
        esac
    done
}

menu_db() {
    local items=(
        "migrate dev       (prisma migrate dev)"
        "generate          (prisma generate)"
        "seed              (npm run db:seed)"
        "reset             (drop & re-seed — destructive!)"
        "← Back"
    )
    while true; do
        header
        menu_select "Database" "${items[@]}"
        case $MENU_RESULT in
            0)
                ensure_deps || { pause; continue; }
                ensure_env
                install_if_needed "$GATEWAY"
                log_info "Running prisma migrate dev..."
                (cd "$GATEWAY" && npx prisma migrate dev) || true
                pause
                ;;
            1)
                ensure_deps || { pause; continue; }
                install_if_needed "$GATEWAY"
                log_info "Running prisma generate..."
                (cd "$GATEWAY" && npx prisma generate) || true
                log_ok "Done."
                pause
                ;;
            2)
                ensure_deps || { pause; continue; }
                ensure_env
                install_if_needed "$GATEWAY"
                log_info "Seeding database..."
                (cd "$GATEWAY" && npm run db:seed) || true
                pause
                ;;
            3)
                header
                if confirm "This will DROP the database and re-seed. Continue?"; then
                    ensure_deps || { pause; continue; }
                    ensure_env
                    install_if_needed "$GATEWAY"
                    (cd "$GATEWAY" && npx prisma migrate reset) || true
                    log_ok "Done."
                else
                    log_info "Aborted."
                fi
                pause
                ;;
            4|-1) return ;;
        esac
    done
}

menu_docker() {
    local items=(
        "up                start stack (build if needed)"
        "build             build images & start"
        "rebuild           full rebuild --no-cache"
        "down              stop & remove containers"
        "restart           restart all services"
        "logs              follow all logs"
        "ps                container status"
        "db only           start only postgres"
        "← Back"
    )
    while true; do
        header
        menu_select "Docker" "${items[@]}"
        case $MENU_RESULT in
            0)
                ensure_env
                log_info "docker compose up -d ..."
                _dc up -d || true
                log_ok "Stack is up.  Gateway → :3000   Admin → :3001"
                pause
                ;;
            1)
                ensure_env
                log_info "Building images and starting stack..."
                _dc up -d --build || true
                log_ok "Stack is up."
                pause
                ;;
            2)
                ensure_env
                log_info "Full rebuild (--no-cache)..."
                _dc build --no-cache || true
                _dc up -d --force-recreate || true
                log_ok "Stack rebuilt and running."
                pause
                ;;
            3)
                log_info "Stopping containers..."
                _dc down || true
                log_ok "Done."
                pause
                ;;
            4)
                log_info "Restarting all services..."
                _dc restart || true
                log_ok "Done."
                pause
                ;;
            5)
                log_info "Following logs (Ctrl-C to stop)..."
                _dc logs -f --tail=100 || true
                pause
                ;;
            6)
                _dc ps || true
                pause
                ;;
            7)
                ensure_env
                log_info "Starting postgres..."
                _dc up -d postgres || true
                log_ok "Postgres up on :5432"
                pause
                ;;
            8|-1) return ;;
        esac
    done
}

menu_misc() {
    local items=(
        "install           npm install in gateway + admin"
        "clean             remove dist/ and node_modules"
        "← Back"
    )
    while true; do
        header
        menu_select "Misc" "${items[@]}"
        case $MENU_RESULT in
            0)
                log_info "Installing gateway deps..."
                npm install --prefix "$GATEWAY" || true
                log_info "Installing admin deps..."
                npm install --prefix "$ADMIN" || true
                log_ok "Done."
                pause
                ;;
            1)
                header
                if confirm "Remove dist/ and node_modules in both packages?"; then
                    rm -rf "$GATEWAY/dist" "$GATEWAY/node_modules"
                    rm -rf "$ADMIN/dist"   "$ADMIN/node_modules"
                    log_ok "Cleaned."
                else
                    log_info "Aborted."
                fi
                pause
                ;;
            2|-1) return ;;
        esac
    done
}

# ─── main loop ────────────────────────────────
main() {
    local items=(
        "Dev       run locally in watch mode"
        "Build     compile for production"
        "Database  prisma operations"
        "Docker    container management"
        "Misc      install, clean"
        "Exit"
    )
    while true; do
        header
        menu_select "Main Menu" "${items[@]}"
        case $MENU_RESULT in
            0) menu_dev    ;;
            1) menu_build  ;;
            2) menu_db     ;;
            3) menu_docker ;;
            4) menu_misc   ;;
            5|-1)
                tput cnorm 2>/dev/null || true
                printf "\n  ${CD}Bye.${RS}\n\n"
                exit 0
                ;;
        esac
    done
}

main
