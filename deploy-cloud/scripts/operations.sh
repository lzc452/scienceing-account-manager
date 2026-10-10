#!/usr/bin/env bash
# 维护脚本共享一把锁，并显式指定镜像版本，避免 cron 与发布交叉执行。
DEPLOY_ROOT="$(realpath "${DEPLOY_ROOT:-/opt/scienceing}")"
cd "$DEPLOY_ROOT"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/docker-compose.yml}"
log() { printf '[scienceing] %s\n' "$*"; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }
env_get() { python3 -c 'import sys; lines=open(".env",encoding="utf-8-sig").read().splitlines(); print(next((x.split("=",1)[1].strip().strip("\"").strip("\047") for x in lines if x.startswith(sys.argv[1]+"=")), ""))' "$1"; }
json_get() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$1" "$2"; }
current_tag() {
  local value
  value="$(json_get current.json tag)" || return 1
  [[ "$value" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  printf '%s' "$value"
}
operation_lock() {
  exec 9>"$DEPLOY_ROOT/.operations.lock"
  flock -n 9 || die '另一项发布、备份或证书维护正在执行'
}
compose() {
  RELEASE_TAG="${RELEASE_TAG:?必须指定镜像版本}" SCIENCEING_DEPLOY_VERIFY_ONLY="${SCIENCEING_DEPLOY_VERIFY_ONLY:-0}" \
    docker compose --project-directory "$DEPLOY_ROOT" -f "$COMPOSE_FILE" "$@"
}
assert_app_stopped() {
  local running
  running="$(compose ps --status running -q app)" || return 1
  [[ -z "$running" ]] || { printf 'app 尚未完全停止\n' >&2; return 1; }
}
wait_for_https_config() {
  local host directory code ready=1
  host="$(env_get DASHBOARD_HOST)"
  [[ "$host" =~ ^[a-zA-Z0-9.-]+$ ]] || return 1
  directory="$(mktemp -d)" || return 1
  for _ in {1..30}; do
    code="$(curl --silent --show-error --fail --max-time 10 -o "$directory/config.json" -w '%{http_code}' "https://${host}/api/extension/config" || true)"
    if [[ "$code" == 200 ]] && python3 - "$directory/config.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1])); assert isinstance(r.get('latestVersion'),str) and isinstance(r.get('minimumVersion'),str)
PY
    then ready=0; break; fi
    sleep 2
  done
  rm -rf -- "$directory"
  return "$ready"
}
