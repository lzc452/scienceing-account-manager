#!/usr/bin/env bash
# 首次签发 Let's Encrypt 证书（解决「证书没签 → nginx 起不来 → 签证书要 80 端口」的引导死锁）
#
# 自动适配两种形态，由 DASHBOARD_HOST 的取值决定：
#   - 公网 IP → 走 IP 地址证书（shortlived profile，6 天有效期），无需域名、无需 ICP 备案
#   - 域名    → 走常规 90 天证书（前提：已完成 ICP 备案）
#
# 为什么首次用 standalone 而不是 webroot：
#   webroot 需要 nginx 已经在跑并把 ACME 挑战文件托管出来，而 443 站点又引用证书文件，
#   证书不存在 nginx 就起不来 —— 死锁。standalone 让 certbot 自己起一个临时 web server
#   监听 80 端口，因此需要先把 gateway 停掉让出端口。首次签发时服务本就还没上线，
#   这个「停机」不产生实际影响。
#   续期不走这条路，见 renew-cert.sh。
#
# 用法：
#   bash scripts/issue-cert.sh
#   bash scripts/issue-cert.sh --staging     # 先用测试环境演练，避免触发速率限制
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/scienceing}"
cd "$DEPLOY_ROOT"

STAGING=""
[[ "${1:-}" == "--staging" ]] && STAGING="--staging"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m[失败] %s\033[0m\n' "$*" >&2; exit 1; }

# 版本比较：ver_ge A B 表示 A >= B
ver_ge() {
  local IFS=. x y i
  local -a a=($1) b=($2)
  for i in 0 1 2; do
    x=${a[i]:-0}; y=${b[i]:-0}
    (( x > y )) && return 0
    (( x < y )) && return 1
  done
  return 0
}

[[ -f .env ]] || die "缺少 .env"

# 只按需提取单个键，绝不 `source .env`。
# 生产 .env 含管理员口令等任意字符，source 会做变量展开与命令替换：
# 实测 `PASSWORD=abc$def`whoami`` 会把口令改写成 `abc<当前用户名>`，
# 反引号内容还会被真实执行。用 sed 提取则原样读取，不解析。
env_get() { sed -n "s/^$1=//p" .env | head -1 | tr -d '\r'; }

HOST="$(env_get DASHBOARD_HOST)"
[[ -n "$HOST" ]] || die ".env 缺少 DASHBOARD_HOST"
EMAIL="$(env_get CERTBOT_EMAIL)"
[[ -n "$EMAIL" ]] || die ".env 缺少 CERTBOT_EMAIL（证书到期提醒邮箱）"

# ── 形态判定 ──
if [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  MODE=ip
else
  MODE=domain
fi

# ── Certbot 版本守卫 ──
# 版本不够时宁可报错，也不能让它签出一张浏览器不认的证书。
CB_VERSION="$(docker compose --profile tools run --rm certbot --version 2>/dev/null \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
[[ -n "$CB_VERSION" ]] || die "无法读取 certbot 版本，请确认镜像可拉取：docker compose --profile tools run --rm certbot --version"
echo "Certbot 版本：$CB_VERSION"

if [[ "$MODE" == "ip" ]]; then
  ver_ge "$CB_VERSION" "5.4.0" \
    || die "IP 地址证书需要 Certbot >= 5.4（当前 $CB_VERSION）。请把 docker-compose.yml 的 certbot 镜像升级到 v5.8.0 或更高。"
else
  ver_ge "$CB_VERSION" "4.0.0" \
    || die "证书 profile 功能需要 Certbot >= 4.0（当前 $CB_VERSION）。"
fi

if [[ "$MODE" == "ip" ]]; then
  log "形态：IP 地址证书（$HOST，6 天有效期）"
  CERT_ARGS=(--preferred-profile shortlived --ip-address "$HOST")
  printf '\033[33m提醒：IP 证书只有 6 天有效期，续期 cron 必须在签发后立刻配好，否则 6 天内服务会断。\033[0m\n'
else
  log "形态：域名证书（$HOST，90 天有效期）"
  CERT_ARGS=(-d "$HOST")
  printf '\033[33m提醒：境内服务器的域名访问需先完成 ICP 备案，否则 80/443 会被拦截。\033[0m\n'
fi
log "邮箱：$EMAIL"
[[ -n "$STAGING" ]] && printf '\033[33m使用 staging 环境，签出的证书不被浏览器信任，仅用于演练\033[0m\n'

log "停掉 gateway 让出 80 端口"
docker compose stop gateway || true

log "签发证书（standalone 模式）"
docker compose --profile tools run --rm -p 80:80 certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --no-eff-email \
  $STAGING \
  "${CERT_ARGS[@]}" \
  -m "$EMAIL"

CERT_DIR="certs/live/${HOST}"
[[ -f "${CERT_DIR}/fullchain.pem" ]] || die "证书未生成，请检查 80 端口是否可从公网访问，以及防火墙是否放行"
[[ -f "${CERT_DIR}/privkey.pem" ]] || die "私钥未生成：${CERT_DIR}/privkey.pem"

log "证书已就绪"
openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -subject -dates

log "拉起 gateway"
docker compose up -d gateway

log "等待网关就绪"
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null "https://${HOST}/api/extension/config" 2>/dev/null; then
    log "HTTPS 已可用：https://${HOST}"
    if [[ "$MODE" == "ip" ]]; then
      cat <<EOF

下一步（IP 证书必做，否则 6 天内会断）：
  crontab -e
  17 3,15 * * * ${DEPLOY_ROOT}/scripts/renew-cert.sh >> /var/log/scienceing-cert.log 2>&1
EOF
    fi
    exit 0
  fi
  sleep 2
done

printf '\033[33m网关未在 30 秒内响应，请检查：docker compose logs gateway\033[0m\n'
docker compose logs --tail 40 gateway
exit 1
