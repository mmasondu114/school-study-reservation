#!/usr/bin/env bash
set -euo pipefail
umask 077
root="${STUDY_DEPLOY_ROOT:-$HOME/study-room}"
repo="$root/repository"
mkdir -p "$root/releases" "$root/backups"
exec 9>"$root/update.lock"
flock -n 9 || { echo '已有更新正在进行，请稍后再试。'; exit 1; }
test -f "$root/shared/runtime.json" || { echo '缺少 shared/runtime.json 配置。'; exit 1; }
cd "$repo"
test -z "$(git status --porcelain)" || { echo '服务器代码有未提交修改，停止更新。'; exit 1; }
git fetch origin main
git merge --ff-only origin/main
revision="$(git rev-parse HEAD)"
release="$(mktemp -d "$root/releases/${revision:0:12}.XXXXXX")"
git archive "$revision" | tar -x -C "$release"
printf '%s\n' "$revision" > "$release/REVISION"
# Dependency cache is keyed by the exact lockfile and Node major version.
lock="$(sha256sum "$release/website/package-lock.json" | cut -d ' ' -f 1)"
major="$(node -p 'process.versions.node.split(".")[0]')"
deps="$root/dependencies/$major-$lock"
if [[ ! -f "$deps/.ready" ]]; then
  mkdir -p "$deps"
  cp "$release/website/package.json" "$release/website/package-lock.json" "$deps/"
  npm ci --prefix "$deps" --include=dev --include=optional --no-audit --no-fund
  touch "$deps/.ready"
fi
ln -s "$deps/node_modules" "$release/website/node_modules"
# The retained cloud adapter has dependency-level regression tests as well.
backend_lock="$(cat "$release/cloudfunctions/study/package-lock.json" "$release/cloudfunctions/study/vendor/lodash-set/index.js" "$release/cloudfunctions/study/vendor/lodash-set/package.json" | sha256sum | cut -d ' ' -f 1)"
backend_deps="$root/dependencies/backend-$major-$backend_lock"
if [[ ! -f "$backend_deps/.ready" ]]; then
  mkdir -p "$backend_deps"
  cp "$release/cloudfunctions/study/package.json" "$release/cloudfunctions/study/package-lock.json" "$release/cloudfunctions/study/.npmrc" "$backend_deps/"
  cp -a "$release/cloudfunctions/study/vendor" "$backend_deps/"
  npm ci --prefix "$backend_deps" --ignore-scripts --no-audit --no-fund
  touch "$backend_deps/.ready"
fi
ln -s "$backend_deps/node_modules" "$release/cloudfunctions/study/node_modules"
cd "$release"
npm test
npm run check
base="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).STUDY_BASE_PATH||"/"' "$root/shared/runtime.json")"
STUDY_BASE_PATH="$base" npm run build:local
previous="$(readlink "$root/current" || true)"
# Keep older hashed assets available for browsers opened before this update.
if [[ -n "$previous" && -d "$previous/website/local-dist/assets" ]]; then
  cp -an "$previous/website/local-dist/assets/." "$release/website/local-dist/assets/"
fi
had_service=false
if pm2 describe study-reservation >/dev/null 2>&1; then had_service=true; fi
switched=false
recover(){
  code=$?
  if [[ "$code" -ne 0 && "$switched" == true ]]; then
    echo '更新失败，正在恢复先前版本。'
    if [[ -n "$previous" ]]; then
      ln -s "$previous" "$root/current.rollback"
      mv -Tf "$root/current.rollback" "$root/current"
      STUDY_DEPLOY_ROOT="$root" pm2 startOrRestart "$previous/deploy/ecosystem.config.cjs" --update-env || true
    elif [[ "$had_service" == true ]]; then
      pm2 restart study-reservation || true
    else
      pm2 stop study-reservation >/dev/null 2>&1 || true
    fi
  fi
  exit "$code"
}
trap recover EXIT
switched=true
if [[ "$had_service" == true ]]; then pm2 stop study-reservation; fi
# Snapshot after graceful shutdown; keep all application data outside release directories.
if [[ -f "$root/shared/data/records.json" ]]; then
  backup="$root/backups/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}"
  mkdir -p "$backup"
  cp -a "$root/shared/data/." "$backup/"
fi
ln -s "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
STUDY_DEPLOY_ROOT="$root" pm2 startOrRestart "$release/deploy/ecosystem.config.cjs" --update-env
node - "$root/shared/runtime.json" <<'JS'
const fs=require('node:fs');
(async()=>{
 const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(let i=0;i<20;i++){
  try{const r=await fetch('http://127.0.0.1:'+c.STUDY_PORT+'/api/study',{headers:{Host:new URL(c.STUDY_ORIGIN).host},signal:AbortSignal.timeout(1500)});const data=await r.json();if(r.ok&&data.ready){console.log('健康检查通过。');return;}}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw new Error('新版本未通过健康检查');
})().catch(e=>{console.error(e.message);process.exitCode=1});
JS
switched=false
pm2 save
printf '更新完成：%s\n' "$revision"
