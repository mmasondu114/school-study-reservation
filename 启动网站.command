#!/bin/zsh
cd -- "$(dirname -- "$0")"
if curl --silent --fail --max-time 2 http://127.0.0.1:5173/api/study 2>/dev/null | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const d=JSON.parse(s);process.exit(d.ready&&d.mode==="local"?0:1)}catch{process.exit(1)}})'; then
  echo '网站已在运行，正在打开：http://127.0.0.1:5173/'
  open 'http://127.0.0.1:5173/'
  exit 0
fi
if [[ ! -f website/local-dist/index.html ]]; then
  npm run build:local || exit 1
fi
node local/server.js --open
