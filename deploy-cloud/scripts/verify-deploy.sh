#!/usr/bin/env bash
# 部署验收自检 —— 把设计文档「阶段 4 验证」的检查项自动化
#
# 输出 PASS / FAIL / SKIP 汇总，退出码 0 表示全部通过。
# 用途：发布后自检、接入监控、排查故障时快速定位。
#
# 用法：
#   bash scripts/verify-deploy.sh
#   bash scripts/verify-deploy.sh --verbose
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/operations.sh"

if [[ "${1:-}" == --release-check ]]; then
  set -e
  HOST="$(env_get DASHBOARD_HOST)"
  [[ "$HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || die 'DASHBOARD_HOST 无效'
  CHECK_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$CHECK_DIR"' EXIT
  fetch_200() {
    local code
    code="$(curl --silent --show-error --fail --max-time 15 -o "$2" -w '%{http_code}' "https://${HOST}$1")"
    [[ "$code" == 200 ]] || die "HTTPS $1 返回 $code，期望 200"
  }
  fetch_200 /api/extension/config "$CHECK_DIR/config.json"
  fetch_200 /downloads/extension.json "$CHECK_DIR/extension.json"
  fetch_200 /downloads/scienceing-extension.zip "$CHECK_DIR/extension.zip"
  python3 - "$CHECK_DIR" "$DEPLOY_ROOT/release/apps/web/dist/downloads/extension.json" <<'PY'
import hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); expected=json.load(open(sys.argv[2]))
api=json.loads((root/'config.json').read_text()); served=json.loads((root/'extension.json').read_text())
assert isinstance(api.get('latestVersion'),str) and isinstance(api.get('minimumVersion'),str),'API 响应不是扩展配置'
assert served==expected,'Nginx 扩展元信息与当前制品不一致'
package=api['package']; assert package['available'] is True,'后端没有读取到扩展包'
for key in ('version','fileName','size','downloadPath','dashboardOrigin','extensionId','sha256'):
    assert package.get(key)==expected[key], '后端扩展元信息与制品不一致: '+key
data=root/'extension.zip'; assert hashlib.sha256(data.read_bytes()).hexdigest()==expected['sha256'],'实际下载 ZIP 与制品不一致'
with zipfile.ZipFile(data) as archive:
    assert archive.testzip() is None,'ZIP 损坏'
    manifest=json.loads(archive.read('manifest.json'))
    assert manifest['version']==expected['version'] and manifest.get('key'),'ZIP 缺少正确 manifest 或固定公钥'
PY
  log 'HTTPS API、后端包信息及 Nginx 实际 ZIP 验收通过'
  exit 0
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/scienceing}"
VERBOSE=0
[[ "${1:-}" == "--verbose" ]] && VERBOSE=1

cd "$DEPLOY_ROOT" || { echo "目录不存在：$DEPLOY_ROOT" >&2; exit 1; }

PASS=0; FAIL=0; SKIP=0
declare -a FAILED_ITEMS=()

ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED_ITEMS+=("$1"); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [[ -n "${2:-}" ]] && printf '        %s\n' "$2"; }
skip() { SKIP=$((SKIP+1)); printf '  \033[33mSKIP\033[0m  %s\n' "$1"; }
sect() { printf '\n\033[1m%s\033[0m\n' "$1"; }

[[ -f .env ]] || { echo "缺少 .env" >&2; exit 1; }

HOST="$(env_get DASHBOARD_HOST)"
[[ -n "$HOST" ]] || { echo ".env 缺少 DASHBOARD_HOST" >&2; exit 1; }

printf '\n\033[1m科应看板部署自检 —— https://%s\033[0m\n' "$HOST"

# ══════════════════════════════════════════════════════════════
sect "1. HTTP 强制跳转 HTTPS"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://${HOST}/" || echo 000)"
LOCATION="$(curl -sI -m 10 "http://${HOST}/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | head -1)"
if [[ "$CODE" == "301" && "$LOCATION" == https://* ]]; then
  ok "http → https 301 跳转正常（Location: $LOCATION）"
else
  bad "http → https 跳转异常" "状态码=$CODE Location=${LOCATION:-无}"
fi

# ACME 校验路径不能被跳转，否则证书续期会失败
ACME_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://${HOST}/.well-known/acme-challenge/probe" || echo 000)"
if [[ "$ACME_CODE" == "404" ]]; then
  ok "ACME 校验路径未被跳转（返回 404，属正常）"
else
  bad "ACME 校验路径可能被 301 拦截，续期会失败" "状态码=$ACME_CODE（期望 404）"
fi

# ══════════════════════════════════════════════════════════════
sect "2. 安全响应头"
HEADERS="$(curl -sI -m 10 "https://${HOST}/" | tr -d '\r' || true)"
check_header() {
  local key="$1" label="$2"
  if printf '%s\n' "$HEADERS" | grep -qi "^${key}:"; then
    ok "$label 已下发"
  else
    bad "$label 缺失" "curl -sI https://${HOST}/ | grep -i '${key}'"
  fi
}
check_header "Content-Security-Policy" "CSP"
check_header "X-Content-Type-Options" "X-Content-Type-Options"
check_header "X-Frame-Options" "X-Frame-Options"
check_header "Referrer-Policy" "Referrer-Policy"
check_header "Strict-Transport-Security" "HSTS（IP 形态下浏览器会忽略，仅确认配置）"

# ══════════════════════════════════════════════════════════════
sect "3. 证书"
SERVED_END="$(echo | timeout 15 openssl s_client -connect "${HOST}:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
if [[ -n "$SERVED_END" ]]; then
  ok "443 端口返回有效证书（到期：$SERVED_END）"
  SERVED_TS="$(date -d "$SERVED_END" +%s 2>/dev/null || echo 0)"
  NOW_TS="$(date +%s)"
  if [[ "$SERVED_TS" -gt 0 ]]; then
    DAYS_LEFT=$(( (SERVED_TS - NOW_TS) / 86400 ))
    HOURS_LEFT=$(( (SERVED_TS - NOW_TS) / 3600 ))
    if [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
      echo "        剩余 ${HOURS_LEFT} 小时（IP 证书上限约 160 小时）"
      if [[ "$DAYS_LEFT" -ge 3 ]]; then
        ok "证书剩余有效期充足（${DAYS_LEFT} 天）"
      elif [[ "$DAYS_LEFT" -ge 1 ]]; then
        bad "证书剩余不足 3 天，续期可能已失败" "剩余 ${HOURS_LEFT} 小时，请立即检查 renew-cert.sh 与 cron"
      else
        bad "证书即将过期" "剩余仅 ${HOURS_LEFT} 小时"
      fi
    else
      if [[ "$DAYS_LEFT" -ge 20 ]]; then
        ok "证书剩余有效期充足（${DAYS_LEFT} 天）"
      else
        bad "证书剩余不足 20 天" "剩余 ${DAYS_LEFT} 天，请检查续期"
      fi
    fi
  fi
else
  bad "无法从 443 端口取得证书" "检查 gateway 容器与 certs/ 挂载"
fi

CERT_FILE="certs/live/${HOST}/fullchain.pem"
if [[ -f "$CERT_FILE" ]]; then
  ok "证书文件存在：$CERT_FILE"
else
  bad "证书文件缺失：$CERT_FILE"
fi

# ══════════════════════════════════════════════════════════════
sect "4. 后端端口隔离"
if curl -s -o /dev/null -m 3 "http://127.0.0.1:3000/api/extension/config" 2>/dev/null; then
  bad "本机 3000 端口可直连，说明容器发布了端口" "检查 docker-compose.yml 的 app 服务是否误加 ports"
else
  ok "本机 3000 端口不可达（app 未发布端口）"
fi

# ══════════════════════════════════════════════════════════════
sect "5. 接口可用性"
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://${HOST}/api/extension/config" || echo 000)"
if [[ "$API_CODE" == "200" ]]; then
  ok "GET /api/extension/config 返回 200"
  API_BODY="$(curl -s -m 10 "https://${HOST}/api/extension/config" || true)"
  if printf '%s' "$API_BODY" | grep -q 'latestVersion'; then
    ok "扩展配置返回 latestVersion 字段"
  else
    bad "扩展配置响应缺少 latestVersion" "响应：${API_BODY:0:200}"
  fi
else
  bad "GET /api/extension/config 异常" "状态码=$API_CODE"
fi

SPA_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://${HOST}/admin" || echo 000)"
if [[ "$SPA_CODE" == "200" ]]; then
  ok "SPA 路由回退正常（/admin 返回 200）"
else
  bad "SPA 路由回退异常（/admin）" "状态码=$SPA_CODE"
fi

# ══════════════════════════════════════════════════════════════
sect "6. 扩展分发包"
ZIP_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://${HOST}/downloads/scienceing-extension.zip" || echo 000)"
if [[ "$ZIP_CODE" == "200" ]]; then
  ok "扩展包可下载"
  CT="$(curl -sI -m 15 "https://${HOST}/downloads/scienceing-extension.zip" | tr -d '\r' | awk 'tolower($1)=="content-type:"{print $2}' | head -1)"
  if [[ "$CT" == *"zip"* ]]; then
    ok "扩展包 Content-Type 正确（$CT）"
  else
    bad "扩展包 Content-Type 异常" "实际=$CT（期望 application/zip）"
  fi
else
  bad "扩展包不可下载" "状态码=$ZIP_CODE，检查 release/apps/web/dist/downloads/"
fi

# ══════════════════════════════════════════════════════════════
sect "7. 会话 Cookie 安全属性"
# 需要一组可登录的凭据；从 .env 读，读不到就跳过（首登后 ADMIN_INITIAL_PASSWORD 会失效）
LOGIN_USER="$(env_get VERIFY_USERNAME)"
[[ -n "$LOGIN_USER" ]] || LOGIN_USER="admin"
LOGIN_PASS="$(env_get VERIFY_PASSWORD)"
[[ -n "$LOGIN_PASS" ]] || LOGIN_PASS="$(env_get ADMIN_INITIAL_PASSWORD)"
if [[ -z "$LOGIN_PASS" ]]; then
  skip "未提供可登录凭据，跳过 Cookie Secure 检查（可在 .env 设 VERIFY_PASSWORD 后重跑）"
else
  SETCOOKIE="$(curl -s -D - -o /dev/null -m 15 -X POST "https://${HOST}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${LOGIN_USER}\",\"password\":\"${LOGIN_PASS}\"}" \
    | tr -d '\r' | grep -i '^set-cookie:' | head -1 || true)"
  if [[ -z "$SETCOOKIE" ]]; then
    skip "登录未返回 Set-Cookie（可能凭据已失效），无法判定"
  elif printf '%s' "$SETCOOKIE" | grep -qi 'secure'; then
    ok "会话 Cookie 带 Secure 属性"
  else
    bad "会话 Cookie 缺少 Secure 属性" "检查 nginx 的 proxy_set_header X-Forwarded-Proto \$scheme"
  fi
fi

# ══════════════════════════════════════════════════════════════
sect "8. 容器状态"
if command -v docker >/dev/null 2>&1; then
  export RELEASE_TAG="$(current_tag)"
  if [[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ -n "$(compose ps --status running -q app)" && -n "$(compose ps --status running -q gateway)" ]]; then
    ok "当前 Tag 的 app 与 gateway 正在运行"
    [[ $VERBOSE -eq 1 ]] && compose ps
    if compose run --rm --no-deps -T app node /app/apps/server/dist/db/verify.js; then ok "迁移、完整性、外键与密码密钥校验"; else bad "数据库校验失败"; fi
  else
    bad "当前版本指针无效或 app/gateway 未运行"
  fi
else
  skip "未安装 docker CLI，跳过容器状态检查"
fi
if bash "$DEPLOY_ROOT/scripts/verify-deploy.sh" --release-check; then ok "HTTPS 配置和扩展实际内容"; else bad "HTTPS 配置或扩展实际内容不匹配"; fi

# ══════════════════════════════════════════════════════════════
sect "9. 证书续期 cron"
if crontab -l 2>/dev/null | grep -q 'renew-cert.sh'; then
  ok "证书续期 cron 已配置"
else
  bad "未找到证书续期 cron" "执行 bash scripts/install-cron.sh"
fi
if crontab -l 2>/dev/null | grep -q 'backup-offsite.sh'; then
  ok "异地备份 cron 已配置"
else
  bad "未找到异地备份 cron" "执行 bash scripts/install-cron.sh"
fi

# ══════════════════════════════════════════════════════════════
printf '\n\033[1m═══ 汇总 ═══\033[0m\n'
printf '  通过 %d　失败 %d　跳过 %d\n' "$PASS" "$FAIL" "$SKIP"
if [[ "$FAIL" -gt 0 ]]; then
  printf '\n\033[31m失败项：\033[0m\n'
  for item in "${FAILED_ITEMS[@]}"; do printf '  - %s\n' "$item"; done
  exit 1
fi
printf '\n\033[32m全部检查通过。\033[0m\n'
exit 0
