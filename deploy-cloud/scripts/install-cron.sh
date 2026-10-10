#!/usr/bin/env bash
# 一键安装运维 cron（证书续期 + 异地备份）
#
# 为什么要有这个脚本而不是让文档里写一句「记得配 crontab」：
#   IP 证书只有 6 天有效期，cron 漏配或配错 = 6 天后必然断服，
#   而这是路线 B 最主要的风险。把它做成幂等脚本，比靠人记靠谱。
#
# 幂等：重复执行只会覆盖自己那两条（靠行尾标记识别），不会产生重复条目。
#
# 用法：
#   sudo bash scripts/install-cron.sh
#   sudo bash scripts/install-cron.sh --dry-run
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/scienceing}"
MARK="# scienceing-managed"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

cd "$DEPLOY_ROOT"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[警告] %s\033[0m\n' "$*"; }
die() { printf '\033[31m[失败] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 或 sudo 执行（cron 需要写入 root 的 crontab）"

# ── 前置检查：脚本必须存在且可执行 ──
for s in renew-cert.sh backup-offsite.sh; do
  [[ -f "scripts/$s" ]] || die "缺少 scripts/$s"
  chmod +x "scripts/$s"
done

# ── 形态判定：决定提示语气 ──
MODE_NOTE=""
if [[ -f .env ]]; then
  HOST="$(sed -n 's/^DASHBOARD_HOST=//p' .env | head -1 | tr -d '\r')"
  if [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    MODE_NOTE="当前为 IP 证书形态（6 天有效期），续期 cron 是硬性依赖。"
  elif [[ -n "$HOST" ]]; then
    MODE_NOTE="当前为域名证书形态（90 天有效期）。"
  fi
fi

CRON_RENEW="17 3 * * * ${DEPLOY_ROOT}/scripts/renew-cert.sh >> /var/log/scienceing-cert.log 2>&1 ${MARK}"
CRON_BACKUP="30 3 * * * ${DEPLOY_ROOT}/scripts/backup-offsite.sh >> /var/log/scienceing-backup.log 2>&1 ${MARK}"

log "将要安装的条目"
echo "  $CRON_RENEW"
echo "  $CRON_BACKUP"
[[ -n "$MODE_NOTE" ]] && echo "  （$MODE_NOTE）"

if [[ $DRY_RUN -eq 1 ]]; then
  log "--dry-run，未做任何修改"
  exit 0
fi

# ── 幂等写入 ──
log "写入 crontab"
CURRENT="$(crontab -l 2>/dev/null || true)"
KEPT="$(printf '%s\n' "$CURRENT" | grep -vF "$MARK" | sed '/^[[:space:]]*$/d' || true)"

TMP="$(mktemp)"
{
  [[ -n "$KEPT" ]] && printf '%s\n' "$KEPT"
  printf '%s\n' "$CRON_RENEW"
  printf '%s\n' "$CRON_BACKUP"
} > "$TMP"

crontab "$TMP"
rm -f "$TMP"

# ── 回显验证 ──
log "当前 crontab"
crontab -l | grep -v '^[[:space:]]*$'

COUNT="$(crontab -l | grep -cF "$MARK" || true)"
if [[ "$COUNT" -ne 2 ]]; then
  die "预期 2 条 scienceing 条目，实际 $COUNT 条，请检查 crontab"
fi
echo "已确认 2 条条目写入。"

# ── 立刻验证续期链路（不实际续期，只验证脚本能跑起来） ──
log "验证续期脚本可执行"
if bash scripts/renew-cert.sh; then
  echo "续期脚本执行成功（未到阈值时会直接跳过，属正常）。"
else
  warn "续期脚本返回非零，请查看输出。若因未到续期阈值而返回 0 属正常，返回 2 表示需要人工介入。"
fi

log "完成"
cat <<EOF

日志位置：
  证书续期  /var/log/scienceing-cert.log
  异地备份  /var/log/scienceing-backup.log

建议确认 cron 服务在运行：
  systemctl status cron

${MODE_NOTE}
EOF
