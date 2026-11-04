#!/usr/bin/env bash
# CloudBase 云托管启动入口：持久化自检 → 备份 → 迁移 → 校验 → 启动。
#
# 为什么要在这里做迁移，而不是让进程启动时自动建表：
#   本项目的 DatabaseService 在 NODE_ENV=production 下**只校验、不改结构**，
#   库不存在直接拒绝启动。容器化环境里没有部署机的 db:migrate 步骤，
#   所以把「停服→备份→迁移→校验」搬进入口脚本，且全部失败即退出（不带着半迁移的库跑）。
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${SCIENCEING_BACKUP_DIR:-/backup}"
STATE_DIR="${STATE_DIR:-/data/state}"
DB_PATH="${DATABASE_PATH:-${DATA_DIR}/scienceing.prod.db}"
SERVER_MAIN="${APP_DIR}/apps/server/dist/main.js"

export NODE_ENV="${NODE_ENV:-production}"
export DATABASE_PATH="${DB_PATH}"
export SCIENCEING_BACKUP_DIR="${BACKUP_DIR}"
export SCIENCEING_STORAGE_STATE="${SCIENCING_STORAGE_STATE:-${STATE_DIR}/admin.json}"
export WEB_DIST_DIR="${WEB_DIST_DIR:-${APP_DIR}/apps/web/dist}"
export EXTENSION_DOWNLOAD_DIR="${EXTENSION_DOWNLOAD_DIR:-${WEB_DIST_DIR}/downloads}"

log() { printf '[entrypoint %s] %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "错误：$*"; exit 1; }

cd "${APP_DIR}"

# ── 1. 目录与写权限自检 ──────────────────────────────────────────────
# CFS 挂载点权限由平台决定；不可写时必须立刻失败，否则会退化成「写到容器临时盘，
# 重启后全部丢失」——这是本项目最危险的一种静默故障。
mkdir -p "${DATA_DIR}" "${BACKUP_DIR}" "${STATE_DIR}" "${APP_DIR}/playwright/.worker-logs"

if [ ! -w "${DATA_DIR}" ]; then
  fail "数据目录不可写：${DATA_DIR}。请确认云托管已挂载 CFS 到该路径，且权限允许容器写入。"
fi

PROBE="${DATA_DIR}/.write-probe.$$"
if ! ( : > "${PROBE}" ) 2>/dev/null; then
  fail "数据目录写入探测失败：${DATA_DIR}（挂载点只读或存储不可用）"
fi
rm -f "${PROBE}"

# ── 2. 扩展下载包覆盖（可选） ────────────────────────────────────────
# 平台分配的 HTTPS 域名只有在部署后才知道，扩展包必须在拿到域名后重新打包。
# 运维把新的 zip + extension.json 放到 ${DATA_DIR}/extension，这里覆盖进静态目录，
# 使「看板下载入口」与 /downloads/* 静态文件保持一致。
if [ -f "${DATA_DIR}/extension/extension.json" ]; then
  log "检测到 ${DATA_DIR}/extension，覆盖前端下载包"
  mkdir -p "${EXTENSION_DOWNLOAD_DIR}"
  cp -f "${DATA_DIR}"/extension/* "${EXTENSION_DOWNLOAD_DIR}/"
fi

# ── 3. 一次性维护模式：从快照恢复数据库 ─────────────────────────────
# 背景：迁移一旦前进，旧版本镜像会因「迁移数不等于程序迁移数」拒绝启动，
# 所以「新增了迁移的发布」无法只靠切换版本回滚，必须先恢复数据库快照。
# 这个模式让当前（新）镜像在启动前把快照写回去，且不启动应用、不接流量。
# 用法：创建一个**不分配流量**的版本，设置
#   MAINTENANCE_MODE=restore  RESTORE_FROM=/backup/scienceing.prod.<ts>.predeploy.db
# 确认日志出现「恢复完成」后，把流量切回旧版本并删除该维护版本。
# 健康检查对维护版本必然失败（没有 HTTP 服务），这是预期行为，不要给它流量。
RESTORE_MARKER="${DATA_DIR}/.maintenance-restore.done"
if [ "${MAINTENANCE_MODE:-}" = "restore" ]; then
  if [ -f "${RESTORE_MARKER}" ]; then
    log "维护恢复已在本卷执行过（${RESTORE_MARKER}），跳过"
  else
    [ -n "${RESTORE_FROM:-}" ] || fail "MAINTENANCE_MODE=restore 必须同时设置 RESTORE_FROM"
    [ -f "${RESTORE_FROM}" ] || fail "快照不存在：${RESTORE_FROM}"
    log "维护模式：恢复快照 ${RESTORE_FROM} → ${DB_PATH}"
    node apps/server/dist/db/maintenance.js restore --source "${RESTORE_FROM}" --target "${DB_PATH}"
    printf 'source=%s\nat=%s\n' "${RESTORE_FROM}" "$(date -Iseconds)" > "${RESTORE_MARKER}"
    log "恢复完成（旧主库与 WAL 已改名留存，未删除）"
  fi
  log "维护容器进入等待，不监听端口；请在控制台把流量切回旧版本后删除本版本"
  # 恢复出来的文件属 root：降权部署前必须交还给 node，否则下一次正常启动写不进去。
  if [ "${RUN_AS_NONROOT:-0}" = "1" ] && [ "$(id -u)" = "0" ]; then
    chown -R node:node "${DATA_DIR}" "${BACKUP_DIR}" 2>/dev/null || true
  fi
  exec sleep infinity
fi

# ── 4. 降权（可选） ─────────────────────────────────────────────────
if [ "${RUN_AS_NONROOT:-0}" = "1" ] && [ "$(id -u)" = "0" ]; then
  command -v setpriv >/dev/null 2>&1 || fail "RUN_AS_NONROOT=1 需要 setpriv（util-linux），当前镜像缺少该命令"
  chown -R node:node "${DATA_DIR}" "${BACKUP_DIR}" "${APP_DIR}/playwright/.worker-logs" \
    && chown -R node:node "${EXTENSION_DOWNLOAD_DIR}" 2>/dev/null || true
  AS_NONROOT="setpriv --reuid=node --regid=node --init-groups"
else
  AS_NONROOT=""
fi

# ── 5. 迁移（串行化，避免同一挂载点上并发迁移） ──────────────────────
migrate_under_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${DATA_DIR}/.deploy.lock"
    flock -w 120 9 || fail "等待迁移锁超时（另一个实例正在迁移？云托管请把最小/最大实例数都设为 1）"
  else
    log "警告：镜像内没有 flock，跳过迁移互斥（请务必保证单实例发布）"
  fi

  if [ ! -f "${DB_PATH}" ]; then
    if [ "${ALLOW_DB_INIT:-0}" != "1" ]; then
      fail "生产数据库不存在：${DB_PATH}。首次部署请显式设置 ALLOW_DB_INIT=1 初始化（或从备份恢复后再发布）。"
    fi
    log "初始化全新数据库：${DB_PATH}"
    node apps/server/dist/db/migrate.js --initialize

    if [ "${SEED_ON_INIT:-1}" = "1" ]; then
      [ -n "${ADMIN_INITIAL_PASSWORD:-}" ] || fail "首次初始化必须设置 ADMIN_INITIAL_PASSWORD（否则随机口令会写进平台日志）"
      log "写入初始数据（管理员/账号池/系统设置/手册）"
      node apps/server/dist/db/seed.js
    fi
  else
    # 发布前快照：迁移失败或新版本有缺陷时，这是唯一可靠的数据库回滚点。
    if [ "${BACKUP_BEFORE_MIGRATE:-1}" = "1" ]; then
      log "迁移前快照 → ${BACKUP_DIR}"
      node apps/server/dist/db/maintenance.js backup --reason "predeploy" || fail "迁移前备份失败，已中止发布（不允许无回滚点迁移）"
    fi
    log "应用增量迁移"
    node apps/server/dist/db/migrate.js
  fi

  # verify 同时校验：迁移连续性与校验值、结构一致、外键完整性、主密钥可解密存量密文。
  log "生产库校验"
  node apps/server/dist/db/verify.js

  if command -v flock >/dev/null 2>&1; then
    flock -u 9
    exec 9>&-
  fi
}

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  migrate_under_lock
else
  log "RUN_MIGRATIONS=0：跳过迁移（仅在明确知道库已是目标版本时使用）"
fi

# ── 6. 启动并转发信号 ───────────────────────────────────────────────
log "启动后端：PORT=${PORT:-8080} DB=${DB_PATH} journal=${SCIENCEING_SQLITE_JOURNAL:-wal}"

if [ -n "${AS_NONROOT}" ]; then
  ${AS_NONROOT} "$@" &
else
  "$@" &
fi
CHILD=$!

shutdown() {
  log "收到停止信号，转发给应用（pid ${CHILD}）"
  kill -TERM "${CHILD}" 2>/dev/null || true
  wait "${CHILD}" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

set +e
wait "${CHILD}"
STATUS=$?
set -e
log "应用退出，状态码 ${STATUS}"
exit "${STATUS}"
