#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# gridcalc: single entry point for local development.
#
#   ./run.sh            Prepare everything (deps, .env, database, migrations,
#                       demo seed) and start the API (4107) and web UI (5107).
#   ./run.sh help       List all commands.
#
# Requirements: Node.js >= 22, npm, a running native PostgreSQL >= 15 server.
# -----------------------------------------------------------------------------
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ENV_FILE="${ROOT_DIR}/.env"
readonly ENV_EXAMPLE="${ROOT_DIR}/.env.example"
readonly REQUIRED_NODE_MAJOR=22
readonly SECRET_PLACEHOLDER="replace-me-with-a-long-random-local-only-value"

cd "${ROOT_DIR}"

if [[ -t 1 ]]; then
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
info() { printf '%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*"; }
ok()   { printf '%sok%s  %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '%s!%s   %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die()  { printf '%sxx%s  %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }
trap 'die "Command failed at line ${LINENO}: ${BASH_COMMAND}"' ERR

check_prereqs() {
  command -v node >/dev/null 2>&1 || die "Node.js ${REQUIRED_NODE_MAJOR}+ is required."
  command -v npm  >/dev/null 2>&1 || die "npm is required."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  (( major >= REQUIRED_NODE_MAJOR )) || die "Node.js ${REQUIRED_NODE_MAJOR}+ required, found $(node -v)."
  command -v psql >/dev/null 2>&1 || die "psql not found. Install PostgreSQL (e.g. 'brew install postgresql@17' or 'apt install postgresql') and start it."
  ok "Prerequisites: node $(node -v), npm $(npm -v), $(psql --version | head -n1)"
}

random_secret() {
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
}

ensure_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    [[ -f "${ENV_EXAMPLE}" ]] || die ".env.example is missing."
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    ok "Created .env from .env.example"
  fi
  if grep -q "${SECRET_PLACEHOLDER}" "${ENV_FILE}"; then
    local tmp
    tmp="$(mktemp)"
    sed "s/${SECRET_PLACEHOLDER}/$(random_secret)/" "${ENV_FILE}" > "${tmp}" && mv "${tmp}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    ok "Created a random SESSION_SECRET"
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  : "${DATABASE_URL:?DATABASE_URL must be set in .env}"
}

ensure_deps() {
  local stamp="node_modules/.install-stamp"
  if [[ ! -f "${stamp}" || package-lock.json -nt "${stamp}" || package.json -nt "${stamp}" ]]; then
    info "Installing dependencies"
    if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
    touch "${stamp}"
  fi
  ok "Dependencies installed"
}

# Prints "<maintenance-url> <database-name>" for a postgres URL.
split_db_url() {
  node -e '
    const u = new URL(process.argv[1]);
    const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!/^[A-Za-z0-9_]+$/.test(name)) { console.error("Unsafe database name: " + name); process.exit(1); }
    u.pathname = "/postgres";
    process.stdout.write(u.toString() + " " + name + "\n");
  ' "$1"
}

ensure_database() {
  local url="$1" admin_url name
  read -r admin_url name < <(split_db_url "${url}")
  psql "${admin_url}" -Atqc 'SELECT 1' >/dev/null 2>&1 \
    || die "Cannot reach PostgreSQL via ${admin_url%%\?*}. Start it ('brew services start postgresql@17' or 'sudo systemctl start postgresql')."
  if [[ "$(psql "${admin_url}" -Atqc "SELECT 1 FROM pg_database WHERE datname = '${name}'")" != "1" ]]; then
    psql "${admin_url}" -qc "CREATE DATABASE \"${name}\"" >/dev/null
    ok "Created database ${name}"
  fi
}

cmd_setup() {
  check_prereqs
  ensure_env
  ensure_deps
  ensure_database "${DATABASE_URL}"
  info "Applying migrations"
  npm run --silent db:migrate
  info "Seeding demo data (skipped if present)"
  npm run --silent db:seed
  ok "Setup complete. Demo login: owner@gridcalc.test / gridcalc-demo-pass"
}

cmd_dev() {
  cmd_setup
  info "Starting API on http://${API_HOST:-127.0.0.1}:${API_PORT:-4107} and web on ${APP_ORIGIN:-http://localhost:5107}"
  exec npm run dev
}

cmd_migrate() { ensure_env; ensure_deps; ensure_database "${DATABASE_URL}"; npm run --silent db:migrate; }
cmd_seed()    { ensure_env; ensure_deps; npm run --silent db:seed; }

cmd_reset() {
  ensure_env
  [[ "${NODE_ENV:-development}" != "production" ]] || die "Refusing to reset when NODE_ENV=production."
  if [[ "${1:-}" != "--yes" ]]; then
    read -r -p "This DROPS all data in ${DATABASE_URL%%\?*}. Continue? [y/N] " answer
    [[ "${answer}" =~ ^[Yy]$ ]] || die "Aborted."
  fi
  ensure_deps
  ensure_database "${DATABASE_URL}"
  npm run --silent db:reset
  ok "Database reset and reseeded"
}

cmd_test() {
  ensure_env
  ensure_deps
  export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres:///gridcalc_test?host=/tmp}"
  ensure_database "${TEST_DATABASE_URL}"
  npm run lint
  npm run format:check
  npm run typecheck
  npm test
}

cmd_help() {
  cat <<USAGE
Usage: ./run.sh [command]

  (none) | dev   setup, then start API (:${API_PORT:-4107}) and web (:${WEB_PORT:-5107})
  setup          check prerequisites, create .env, install deps, create DB, migrate, seed
  migrate        apply pending SQL migrations
  seed           insert demo data (idempotent)
  reset [--yes]  drop and recreate the dev schema, migrate and seed
  test           lint, format check, typecheck and all tests (uses TEST_DATABASE_URL)
  help           show this message
USAGE
}

main() {
  local command="${1:-dev}"
  shift || true
  case "${command}" in
    dev|start) cmd_dev ;;
    setup) cmd_setup ;;
    migrate) cmd_migrate ;;
    seed) cmd_seed ;;
    reset) cmd_reset "$@" ;;
    test) cmd_test ;;
    help|-h|--help) cmd_help ;;
    *) warn "Unknown command: ${command}"; cmd_help; exit 1 ;;
  esac
}

main "$@"
