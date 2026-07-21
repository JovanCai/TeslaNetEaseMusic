#!/usr/bin/env bash
# 扫码登录网易云,把 MUSIC_U 写入仓库根目录的 .env。
# 前提:ncm-api 已在 API 地址(默认 http://localhost:3000)监听。
# 用法:./scripts/login.sh
set -euo pipefail

API=${API:-http://localhost:3000}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

command -v python3 >/dev/null || { echo "需要 python3"; exit 1; }

TS=$(date +%s000)
KEY=$(curl -s "$API/login/qr/key?timestamp=$TS" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['unikey'])")
[ -n "$KEY" ] || { echo "拿不到 unikey,ncm-api 是否在 $API 运行?"; exit 1; }

curl -s "$API/login/qr/create?key=$KEY&qrimg=true&timestamp=$TS" \
  | python3 -c "import sys,json,base64,re; d=json.load(sys.stdin)['data']['qrimg']; b=re.sub(r'^data:image/\w+;base64,','',d); open('$ROOT/qrcode.png','wb').write(base64.b64decode(b))"
echo "二维码已保存到 $ROOT/qrcode.png —— 用手机网易云 App 扫描。"
echo "等待扫码确认(最长 ~2 分钟)..."

for _ in $(seq 1 60); do
  RESP=$(curl -s "$API/login/qr/check?key=$KEY&timestamp=$(date +%s000)")
  CODE=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('code'))")
  case "$CODE" in
    803)
      MU=$(echo "$RESP" | python3 -c "import sys,json,re; c=json.load(sys.stdin).get('cookie',''); m=re.search(r'MUSIC_U=([^;]+)',c); print(m.group(1) if m else '')")
      [ -n "$MU" ] || { echo "登录成功但未解析到 MUSIC_U"; exit 1; }
      [ -f "$ENV_FILE" ] || cp "$ROOT/.env.example" "$ENV_FILE"
      if grep -q '^NCM_MUSIC_U=' "$ENV_FILE"; then
        python3 - "$ENV_FILE" "$MU" <<'PY'
import sys,re
p,mu=sys.argv[1],sys.argv[2]
s=open(p).read()
s=re.sub(r'^NCM_MUSIC_U=.*$', 'NCM_MUSIC_U='+mu, s, flags=re.M)
open(p,'w').write(s)
PY
      else
        printf '\nNCM_MUSIC_U=%s\n' "$MU" >> "$ENV_FILE"
      fi
      rm -f "$ROOT/qrcode.png"
      echo "登录成功,MUSIC_U 已写入 $ENV_FILE"
      exit 0 ;;
    800) echo "二维码已过期,请重跑本脚本"; exit 1 ;;
    *) sleep 2 ;;
  esac
done
echo "超时未确认,请重跑本脚本"; exit 1
