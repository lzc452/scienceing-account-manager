#!/usr/bin/env bash
# 证书续期
#
# 自动适配两种形态（与 issue-cert.sh 同一套判定）：
#   - 公网 IP → IP 证书，6 天有效期，阈值 3 天
#   - 域名    → 90 天证书，阈值 30 天
#
# 为什么用 standalone 而不是 webroot：
#   首次签发走的是 standalone，certbot 的续期配置里记录的 authenticator 就是 standalone。
#   standalone 需要占用 80 端口，所以要短暂停一下 gateway。对 10 人规模的内部工具，
#   凌晨停 5~10 秒是可接受的代价；换成 webroot 需要依赖 certbot 在 renew 时接受
#   authenticator 覆盖，行为不够确定，对 6 天的短期证书来说风险太高 —— 一旦续期静默失败，
#   6 天内服务就会断。
#
# 建议 crontab（每天一次，凌晨执行）：
#   17 3 * * * /opt/scienceing/scripts/renew-cert.sh >> /var/log/scienceing-cert.log 2>&1
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/operations.sh"
operation_lock
export RELEASE_TAG="$(current_tag)"
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'current.json 缺失或无效；禁止猜测应用版本'

[[ -f .env ]] || die "缺少 .env"

HOST="$(env_get DASHBOARD_HOST)"
[[ -n "$HOST" ]] || die ".env 缺少 DASHBOARD_HOST"

if [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  MODE=ip
  THRESHOLD_DAYS=3      # 6 天证书，留 3 天余量给重试
  HARD_ALERT_DAYS=1
else
  MODE=domain
  THRESHOLD_DAYS=30     # 90 天证书，与 certbot 默认的 1/3 生命周期阈值对齐
  HARD_ALERT_DAYS=7
fi

CERT="certs/live/${HOST}/fullchain.pem"
log "=== 证书续期检查（形态：$MODE，阈值：${THRESHOLD_DAYS} 天）==="

[[ -f "$CERT" ]] || die "证书不存在：$CERT，请先执行 scripts/issue-cert.sh"

log "当前证书到期时间：$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)"

# ── 未到阈值直接退出：避免每天都白停一次 gateway ──
if openssl x509 -in "$CERT" -noout -checkend $((THRESHOLD_DAYS * 86400)) >/dev/null 2>&1; then
  log "剩余有效期超过 ${THRESHOLD_DAYS} 天，无需续期"
  exit 0
fi

log "剩余不足 ${THRESHOLD_DAYS} 天，开始续期"

# ── standalone 需要 80 端口，短暂停网关 ──
log "停 gateway 让出 80 端口"
compose stop gateway

RENEW_OK=0
if compose --profile tools run --rm -p 80:80 certbot renew --standalone --quiet; then
  RENEW_OK=1
  log "certbot renew 执行成功"
else
  log "certbot renew 返回非零"
fi

log "拉起 gateway"
compose up -d --no-build --no-deps gateway
wait_for_https_config || die '续期后 HTTPS 配置验证失败，请检查 gateway；app 版本未改变'

# ── 复核结果：不看退出码，看证书实际到期时间 ──
if ! openssl x509 -in "$CERT" -noout -checkend $((THRESHOLD_DAYS * 86400)) >/dev/null 2>&1; then
  # 仍未更新：区分「certbot 认为还没到续期点」与「真的失败了」
  if openssl x509 -in "$CERT" -noout -checkend $((HARD_ALERT_DAYS * 86400)) >/dev/null 2>&1; then
    log "certbot 判定尚未到续期点（剩余仍超过 ${HARD_ALERT_DAYS} 天），本次跳过，属正常"
    exit 0
  fi
  printf '[ALERT] 证书剩余有效期已不足 %s 天且续期未成功，请立即人工排查！\n' "$HARD_ALERT_DAYS" >&2
  [[ $RENEW_OK -eq 1 ]] && printf '[ALERT] certbot 报告成功但证书未更新，请检查 certs/ 挂载与权限。\n' >&2
  exit 2
fi

log "续期成功，新到期时间：$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)"
log "=== 完成 ==="
