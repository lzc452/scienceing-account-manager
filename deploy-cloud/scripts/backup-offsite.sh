#!/usr/bin/env bash
# SQLite Backup API 快照与异地同步；只在部署机执行，不向开发机传回数据库。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/operations.sh"
export RELEASE_TAG="$(current_tag)"
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'current.json 缺失或无效'
RCLONE_REMOTE="${RCLONE_REMOTE:-cos:scienceing-backups}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-7}"
[[ "$LOCAL_KEEP_DAYS" =~ ^[0-9]+$ ]] || die 'LOCAL_KEEP_DAYS 必须是天数'
if [[ "${DRY_RUN:-0}" == 1 ]]; then
  log "DRY-RUN: Backup API → $RCLONE_REMOTE/backups（不读写业务数据库）"
  exit 0
fi
operation_lock
command -v rclone >/dev/null || die '请先配置部署机上的 rclone 与异地存储'
result="$(compose exec -T app node /app/apps/server/dist/db/maintenance.js backup --directory /backups/offsite --reason offsite)"
SNAPSHOT="$(printf '%s' "$result" | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["ok"] is True; print(r["path"])')"
[[ "$SNAPSHOT" == /backups/offsite/scienceing.prod.*.db ]] || die '快照路径无效'
CONTAINER="$(compose ps -q app)"
[[ -n "$CONTAINER" ]] || die 'app 未运行'
TRANSFER_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TRANSFER_DIR"' EXIT
docker cp "$CONTAINER:$SNAPSHOT" "$TRANSFER_DIR/snapshot.db"
rclone copyto "$TRANSFER_DIR/snapshot.db" "${RCLONE_REMOTE}/backups/$(basename "$SNAPSHOT")"
rclone copyto "$TRANSFER_DIR/snapshot.db" "${RCLONE_REMOTE}/latest.db"
rclone delete "${RCLONE_REMOTE}/backups" --min-age 30d
compose exec -T app find /backups/offsite -maxdepth 1 -name 'scienceing.prod.*.db' -type f -mtime "+$LOCAL_KEEP_DAYS" -delete
log 'Backup API 校验快照已完成异地同步'
