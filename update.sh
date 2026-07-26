#!/usr/bin/env bash
# 一条命令更新到最新版:拉取仓库(compose/脚本变更)+ 拉取预构建镜像 + 重启。
# 用法:./update.sh   —— 脚本会按需对 docker 加 sudo(群晖等需要 root)。
set -euo pipefail
cd "$(dirname "$0")"

# 1) 拉取仓库最新(以当前用户身份,避免 sudo 造成 git 属主告警)
git pull --ff-only

# 2) docker 在群晖等需要 root;不需要时不加 sudo
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

# 3) 拉最新镜像并重启(带隧道)
$DOCKER compose --profile tunnel pull
$DOCKER compose --profile tunnel up -d
$DOCKER compose ps

# 4) 清理旧镜像
$DOCKER image prune -f >/dev/null 2>&1 || true
echo "✅ 已更新到最新版"
