#!/usr/bin/env bash
# 换账号 / 重新登录:清除已存的登录 cookie 并打开页面让你重新扫码。
set -e
cd "$(dirname "$0")"

docker compose exec -T app rm -f /data/cookie 2>/dev/null || true
docker compose restart app >/dev/null 2>&1 || true
printf "\033[1;32m✓ 已清除登录态\033[0m\n"
echo "请在浏览器用手机网易云 App 扫码重新登录(已为你打开 http://localhost/)"
open http://localhost/ 2>/dev/null || true
