#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/operations.sh"
for command in docker python3 curl unzip flock; do command -v "$command" >/dev/null || die "缺少命令：$command"; done
ZIP_PATH="${1:-}"
[[ -n "$ZIP_PATH" && -f "$ZIP_PATH" ]] || die '用法：deploy.sh <Release.zip> [--initialize] [--baseline N]'
ZIP_PATH="$(realpath "$ZIP_PATH")"
shift
INITIALIZE=0
BASELINE=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --initialize) INITIALIZE=1; shift ;;
    --baseline) [[ "${2:-}" =~ ^[0-9]+$ ]] || die '--baseline 需要显式版本'; BASELINE="$2"; shift 2 ;;
    *) die "不支持参数 $1；已有数据库必须备份，不能跳过" ;;
  esac
done
[[ -f .env ]] || die '缺少部署目录中的 .env'
operation_lock
[[ ! -f deployment.pending.json ]] || die '上次部署未完成，请按 deployment.pending.json 检查/恢复后再发布'
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
CANDIDATE="$DEPLOY_ROOT/release.candidate-$STAMP"
PREVIOUS="$DEPLOY_ROOT/release.previous-$STAMP"
OPS_PREVIOUS="$DEPLOY_ROOT/ops.previous-$STAMP"
SNAPSHOT=''
PREV_TAG=''
if [[ -f current.json ]]; then PREV_TAG="$(current_tag)" || die 'current.json 无效'; fi
[[ -z "$PREV_TAG" || -d release ]] || die '当前版本缺少 release 目录'
STOP_ATTEMPTED=0
DATA_TOUCHED=0
WRITE_ENABLED=0
SWITCHED=0
declare -a INSTALLED_OPS=()

pending() {
  python3 - "$TAG" "$PREV_TAG" "$SNAPSHOT" "$PREVIOUS" "$OPS_PREVIOUS" "$1" <<'PY'
import json, os, sys
keys=('tag','previousTag','snapshot','previousRelease','previousOps','stage')
with open('deployment.pending.json.tmp','w') as f: json.dump(dict(zip(keys,sys.argv[1:])),f)
os.replace('deployment.pending.json.tmp','deployment.pending.json')
PY
}

recover() {
  local status="$1"
  trap - EXIT INT TERM
  set +e
  if [[ "$STOP_ATTEMPTED" == 0 ]]; then
    log '发布预检失败，原服务及数据库未切换'
    exit "$status"
  fi
  log '发布失败，停止候选应用'
  compose stop gateway app && assert_app_stopped || { log '不能确认应用已停止，禁止恢复数据库或启动旧版'; exit "$status"; }
  if [[ "$WRITE_ENABLED" == 1 ]]; then
    log '业务写入已启用；保留当前库和 deployment.pending.json，禁止自动覆盖为旧快照'
    exit "$status"
  fi
  if [[ "$DATA_TOUCHED" == 1 && -n "$SNAPSHOT" ]]; then
    compose run --rm --no-deps -T app node /app/apps/server/dist/db/maintenance.js restore --source "$SNAPSHOT" \
      || { log '快照恢复失败，保持停机'; exit "$status"; }
  fi
  if [[ "$SWITCHED" == 1 ]]; then
    [[ ! -d release ]] || mv release "release.failed-$STAMP" || exit "$status"
    if [[ -d "$PREVIOUS" ]]; then mv "$PREVIOUS" release || exit "$status"; fi
  fi
  for entry in "${INSTALLED_OPS[@]}"; do
    [[ ! -e "$entry" ]] || mv "$entry" "$entry.failed-$STAMP" || exit "$status"
    [[ ! -e "$OPS_PREVIOUS/$entry" ]] || mv "$OPS_PREVIOUS/$entry" "$entry" || exit "$status"
  done
  COMPOSE_FILE="$DEPLOY_ROOT/docker-compose.yml"
  if [[ -f "$OPS_PREVIOUS/.env" ]]; then cp -p "$OPS_PREVIOUS/.env" .env || exit "$status"; fi
  RELEASE_TAG="$PREV_TAG"
  SCIENCEING_DEPLOY_VERIFY_ONLY=0
  if [[ -n "$PREV_TAG" ]]; then
    compose run --rm --no-deps -T app node /app/apps/server/dist/db/verify.js \
      && compose up -d --no-build app gateway && wait_for_https_config \
      || { log '旧版校验/启动/HTTPS 验证失败，保持停机'; compose stop app gateway; exit "$status"; }
    rm -f deployment.pending.json
    log "数据库与程序已恢复到 $PREV_TAG"
  else
    log '没有已知旧版本；保留数据库和失败记录，保持停机，禁止自动重新初始化'
  fi
  exit "$status"
}
# EXIT 覆盖 set -e、显式失败及信号退出，不能只捕获健康检查分支。
trap 'status=$?; if [[ "$status" != 0 ]]; then recover "$status"; fi' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

python3 - "$ZIP_PATH" "$CANDIDATE" <<'PY'
import hashlib, pathlib, re, stat, sys, zipfile
source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
expected=pathlib.Path(str(source)+'.sha256').read_text().split()[0].lower()
assert re.fullmatch('[0-9a-f]{64}',expected) and hashlib.sha256(source.read_bytes()).hexdigest()==expected,'Release SHA256 不匹配'
target.mkdir()
with zipfile.ZipFile(source) as archive:
    for item in archive.infolist():
        destination=(target/item.filename).resolve()
        assert destination.is_relative_to(target.resolve()) and not stat.S_ISLNK(item.external_attr>>16),'拒绝越界路径或符号链接'
    archive.extractall(target)
PY
TAG="$(json_get "$CANDIDATE/release.json" version)"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die '制品版本无效'
[[ "$TAG" != "$PREV_TAG" ]] || die '当前版本已经部署，正式版本不允许覆盖；请使用新 Tag'
HOST="$(env_get DASHBOARD_HOST)"
[[ "$HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || die 'DASHBOARD_HOST 无效'
python3 - "$CANDIDATE" "$HOST" "$(env_get SCIENCEING_EXTENSION_IDS)" "$(env_get CORS_ORIGINS)" <<'PY'
import hashlib,json,pathlib,re,sys,zipfile
root=pathlib.Path(sys.argv[1]); release=json.loads((root/'release.json').read_text())
assert re.fullmatch('[0-9a-f]{40}',release['commit']) and isinstance(release['schemaVersion'],int),'制品元信息不完整'
meta=json.loads((root/'apps/web/dist/downloads/extension.json').read_text())
assert release['cloudHost']==sys.argv[2] and meta['dashboardOrigin']=='https://'+sys.argv[2],'扩展站点与部署配置不一致'
identity=meta['extensionId']; assert re.fullmatch('[a-p]{32}',identity) and release['extensionId']==identity,'扩展 ID 无效'
assert identity in sys.argv[3].split(',') and 'chrome-extension://'+identity in sys.argv[4].split(',') and meta['dashboardOrigin'] in sys.argv[4].split(','),'扩展白名单与制品不一致'
data=root/'apps/web/dist/downloads/scienceing-extension.zip'
assert hashlib.sha256(data.read_bytes()).hexdigest()==meta['sha256'],'扩展摘要不匹配'
with zipfile.ZipFile(data) as z:
    assert z.testzip() is None and 'manifest.json' in z.namelist(),'扩展 ZIP 损坏'
assert (root/'deploy-cloud/Dockerfile').is_file() and (root/'apps/server/dist/main.js').is_file(),'制品缺少运行文件'
PY
log "构建并验证候选镜像 $TAG"
docker build -f "$CANDIDATE/deploy-cloud/Dockerfile" -t "scienceing/app:$TAG" "$CANDIDATE"
if [[ -n "$PREV_TAG" ]]; then docker image inspect "scienceing/app:$PREV_TAG" >/dev/null; fi
export RELEASE_TAG="$TAG"
export SCIENCEING_DEPLOY_VERIFY_ONLY=1
COMPOSE_FILE="$CANDIDATE/deploy-cloud/docker-compose.yml"
DATABASE_STATE="$(compose run --rm --no-deps -T app node -e 'const fs=require("node:fs");const p="/data/scienceing.prod.db";if(fs.existsSync(p))console.log("existing");else if(fs.readdirSync("/data").length===0)console.log("empty");else{console.error("目标库缺失但数据卷非空，禁止猜测/初始化");process.exit(1)}')"
if [[ "$INITIALIZE" == 1 ]]; then
  [[ "$DATABASE_STATE" == empty && -z "$BASELINE" && -z "$PREV_TAG" ]] || die '初始化只允许首次空数据卷，不能覆盖已有库'
else
  [[ "$DATABASE_STATE" == existing ]] || die '数据库不存在；真正首次部署请显式使用 --initialize'
fi

pending stopping
STOP_ATTEMPTED=1
compose stop gateway app
assert_app_stopped
if [[ "$DATABASE_STATE" == existing ]]; then
  log 'SQLite Backup API 发布前备份'
  result="$(compose run --rm --no-deps -T app node /app/apps/server/dist/db/maintenance.js backup --directory "/backups/deployments/$STAMP" --reason predeploy)"
  SNAPSHOT="$(printf '%s' "$result" | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["ok"] is True; print(r["path"])')"
  [[ "$SNAPSHOT" == /backups/deployments/"$STAMP"/* ]] || die '备份结果路径无效'
fi
pending backed-up
mkdir "$OPS_PREVIOUS"
if [[ -f current.env ]]; then cp -p current.env "$OPS_PREVIOUS/.env"; else cp -p .env "$OPS_PREVIOUS/.env"; fi
chmod 600 "$OPS_PREVIOUS/.env"
for entry in docker-compose.yml nginx scripts; do
  [[ ! -e "$entry" ]] || mv "$entry" "$OPS_PREVIOUS/$entry"
  INSTALLED_OPS+=("$entry")
  cp -a "$CANDIDATE/deploy-cloud/$entry" "$entry"
done
COMPOSE_FILE="$DEPLOY_ROOT/docker-compose.yml"
SWITCHED=1
[[ ! -d release ]] || mv release "$PREVIOUS"
mv "$CANDIDATE" release
pending migrating
declare -a MIGRATE_ARGS=()
[[ "$INITIALIZE" == 0 ]] || MIGRATE_ARGS+=(--initialize)
[[ -z "$BASELINE" ]] || MIGRATE_ARGS+=(--baseline "$BASELINE")
DATA_TOUCHED=1
compose run --rm --no-deps -T app node /app/apps/server/dist/db/migrate.js "${MIGRATE_ARGS[@]}"
if [[ "$INITIALIZE" == 1 ]]; then compose run --rm --no-deps -T app node /app/apps/server/dist/db/seed.js; fi
compose run --rm --no-deps -T app node /app/apps/server/dist/db/verify.js
pending verifying
compose up -d --no-build app gateway
READY=0
for _ in {1..30}; do
  if bash scripts/verify-deploy.sh --release-check; then READY=1; break; fi
  sleep 2
done
[[ "$READY" == 1 ]] || { log 'HTTPS 验收失败'; false; }

# 启用写入是提交点；之后异常保留新库，不自动倒回旧快照。
pending activating
WRITE_ENABLED=1
SCIENCEING_DEPLOY_VERIFY_ONLY=0 compose up -d --no-build --no-deps app
READY=0
for _ in {1..30}; do
  if compose exec -T app node -e 'fetch("http://127.0.0.1:3000/api/extension/config").then(r=>{if(r.status!==200)throw Error("status");return r.json()}).then(j=>process.exit(typeof j.latestVersion==="string"?0:1)).catch(()=>process.exit(1))'; then READY=1; break; fi
  sleep 2
done
[[ "$READY" == 1 ]] || false
SCIENCEING_DEPLOY_VERIFY_ONLY=0 compose up -d --no-build --no-deps gateway
SCIENCEING_DEPLOY_VERIFY_ONLY=0
bash scripts/verify-deploy.sh --release-check
pending activated
cp -p .env current.env
chmod 600 current.env
python3 - "$TAG" "$PREV_TAG" "$SNAPSHOT" "$PREVIOUS" "$OPS_PREVIOUS" <<'PY'
import datetime,json,os,sys
release=json.load(open('release/release.json'))
release.update(tag=sys.argv[1],deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
with open('current.json.tmp','w') as f: json.dump(release,f)
os.replace('current.json.tmp','current.json')
rollback=dict(tag=sys.argv[2],snapshot=sys.argv[3],release=sys.argv[4],ops=sys.argv[5])
with open('rollback.json.tmp','w') as f: json.dump(rollback,f)
os.replace('rollback.json.tmp','rollback.json')
PY
rm -f deployment.pending.json
trap - EXIT INT TERM
log "发布成功：$TAG；旧制品和配对快照已保留"
compose ps || log '容器状态查询失败，请另行检查'
