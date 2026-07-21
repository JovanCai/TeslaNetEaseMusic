#!/usr/bin/env bash
# 一键部署:起服务 → 扫码登录 → 打印特斯拉可访问的 https 地址。
# 用法:在项目目录里运行   ./deploy.sh
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1;36m%s\033[0m\n" "$1"; }
ok()  { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }

# 1) Docker 是否在运行
if ! docker info >/dev/null 2>&1; then
  warn "Docker 没有运行。正在尝试打开 Docker Desktop……请等它启动后重跑本脚本。"
  open -a Docker 2>/dev/null || true
  exit 1
fi
ok "Docker 正常"

# 2) 配置文件
if [ ! -f .env ]; then cp .env.example .env; ok "已生成 .env(默认配置即可)"; fi

# 3) 起服务(首次会构建镜像,约 1–2 分钟)
say "启动服务中(首次构建稍慢,请稍候)……"
set -a; . ./.env; set +a
docker compose up -d --build >/dev/null
ok "服务已启动"

# 4) 等就绪
printf "等待服务就绪"
for _ in $(seq 1 30); do
  if curl -sf http://localhost/session/status >/dev/null 2>&1; then break; fi
  printf "."; sleep 2
done
printf "\n"

# 5) 登录(未登录则打开页面让你扫码,并等待)
if curl -s http://localhost/session/status | grep -q '"loggedIn":true'; then
  ok "已登录,可直接用"
else
  say "还没登录 —— 已为你打开 http://localhost/ ,请用【手机网易云 App】扫码登录。"
  open http://localhost/ 2>/dev/null || true
  printf "等待你扫码完成(最多约 3 分钟)"
  for _ in $(seq 1 90); do
    if curl -s http://localhost/session/status | grep -q '"loggedIn":true'; then break; fi
    printf "."; sleep 2
  done
  printf "\n"
  if curl -s http://localhost/session/status | grep -q '"loggedIn":true'; then
    ok "登录成功"
  else
    warn "还没检测到登录。扫码完成后重跑本脚本即可。"
    exit 0
  fi
fi

# 6) 确保 cloudflared 已安装(用于生成公网 https 地址)
if ! command -v cloudflared >/dev/null 2>&1; then
  say "首次需要安装 cloudflared(用来生成特斯拉能访问的 https 地址)……"
  if command -v brew >/dev/null 2>&1; then
    brew install cloudflared
  else
    warn "未找到 Homebrew。请手动安装 cloudflared 后重跑:"
    echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
  fi
fi

# 7) 生成并打印车机可访问地址
cat <<'BANNER'

────────────────────────────────────────────────────────
  下面会出现一行  https://xxxx.trycloudflare.com  地址。
  ➜ 在【特斯拉车机浏览器】里打开那个地址,就能用了。
  ➜ 本窗口保持开着(关掉地址就失效);电脑也要保持开机。
────────────────────────────────────────────────────────
BANNER
exec cloudflared tunnel --url http://localhost:80
