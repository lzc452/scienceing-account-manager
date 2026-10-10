#!/usr/bin/env bash
# 人工恢复将数据回退到选定快照；当前库和 WAL/SHM 会保留为 .failed 文件。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/operations.sh"
operation_lock
case "${1:-}" in
  --previous) RECORD=rollback.json; TAG_KEY=tag; RELEASE_KEY=release; OPS_KEY=ops; ACTIVE_TAG="$(current_tag)" ;;
  --pending) RECORD=deployment.pending.json; TAG_KEY=previousTag; RELEASE_KEY=previousRelease; OPS_KEY=previousOps; ACTIVE_TAG="$(json_get "$RECORD" tag)" ;;
  *) die '用法：restore.sh --previous（上次成功发布前）或 --pending（失败发布前）；先确认业务数据回退影响' ;;
esac
TARGET_TAG="$(json_get "$RECORD" "$TAG_KEY")"
SNAPSHOT="$(json_get "$RECORD" snapshot)"
OLD_RELEASE="$(json_get "$RECORD" "$RELEASE_KEY")"
OLD_OPS="$(json_get "$RECORD" "$OPS_KEY")"
[[ "$TARGET_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ && "$ACTIVE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die '恢复版本无效'
[[ "$SNAPSHOT" == /backups/deployments/* ]] || die '缺少配对发布前快照，禁止猜测或重新初始化'
python3 - "$DEPLOY_ROOT" "$OLD_RELEASE" "$OLD_OPS" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()
for raw in sys.argv[2:]:
    p=pathlib.Path(raw).resolve(); assert p!=root and p.is_relative_to(root),'恢复制品路径必须在部署目录内'
PY
export RELEASE_TAG="$ACTIVE_TAG"
export SCIENCEING_DEPLOY_VERIFY_ONLY=1
trap 'status=$?; if [[ "$status" != 0 ]]; then compose stop gateway app || log "停止失败，须人工确认进程退出；禁止再次替换数据库"; fi' EXIT
compose stop gateway app
assert_app_stopped
compose run --rm --no-deps -T app node /app/apps/server/dist/db/maintenance.js restore --source "$SNAPSHOT"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
if [[ -d "$OLD_RELEASE" ]]; then
  [[ ! -d release ]] || mv release "release.failed-$STAMP"
  mv "$OLD_RELEASE" release
else
  [[ "$(json_get release/release.json version)" == "$TARGET_TAG" ]] || die '缺少匹配旧版制品，保持停机'
fi
for entry in docker-compose.yml nginx scripts; do
  if [[ -e "$OLD_OPS/$entry" ]]; then
    [[ ! -e "$entry" ]] || mv "$entry" "$entry.failed-$STAMP"
    mv "$OLD_OPS/$entry" "$entry"
  fi
done
COMPOSE_FILE="$DEPLOY_ROOT/docker-compose.yml"
if [[ -f "$OLD_OPS/.env" ]]; then cp -p "$OLD_OPS/.env" .env; chmod 600 .env; fi
RELEASE_TAG="$TARGET_TAG"
SCIENCEING_DEPLOY_VERIFY_ONLY=0
compose run --rm --no-deps -T app node /app/apps/server/dist/db/verify.js
if ! compose up -d --no-build app gateway; then
  compose stop app gateway
  die '旧版启动失败，保持停机'
fi
wait_for_https_config || die '旧版 HTTPS 验证失败，保持停机'
cp -p .env current.env
chmod 600 current.env
python3 - "$TARGET_TAG" <<'PY'
import datetime,json,os,sys
r=json.load(open('release/release.json')); r.update(tag=sys.argv[1],deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
with open('current.json.tmp','w') as f: json.dump(r,f)
os.replace('current.json.tmp','current.json')
PY
rm -f deployment.pending.json
trap - EXIT
log "数据库、旧代码与旧镜像已恢复为 $TARGET_TAG；被替换的数据库已留存"
