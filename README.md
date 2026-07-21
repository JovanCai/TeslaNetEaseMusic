# tesla-music

自托管、开源、车机优化的网易云音乐 Web 播放器,行车时显示滚动歌词。每个人部署自己的小服务器、登录自己的账号。

> **阶段 0(当前)**:一屏验证页,用于在真实特斯拉车机上验证整条管线(联网 → 用你的账号取到播放地址 → 出声 → 歌词滚动)。完整播放器(登录 UI、歌单、搜索、连播)在阶段 1。

## 边界与姿态

- **自托管,各用各的**:不做中心服务,不持有任何他人凭证。
- **不做跨平台音源替换**:后端 `ENABLE_GENERAL_UNBLOCK=false`。灰色无版权歌不会被替换成别家音源。
- **realIP 区域解锁可选、默认关闭**:仅当在 `.env` 配置 `VITE_REAL_IP` 时才启用,依赖你自己账号的版权,后果自负。
- **凭证不落浏览器**:登录 cookie 由 nginx 在服务器端注入,前端与浏览器 URL 中不出现 `MUSIC_U`。

## 依赖

- Docker + Docker Compose
- Node 20+(仅构建前端用)

## 部署

```bash
cp .env.example .env
# 编辑 .env:填 VITE_DEMO_SONG_ID(选一首你能正常播、且有歌词的歌);VITE_REAL_IP 可留空

# 1) 起后端并扫码登录(把 MUSIC_U 写入 .env)
docker run -d --name ncm-login -p 3000:3000 -e ENABLE_GENERAL_UNBLOCK=false moefurina/ncm-api:latest
./scripts/login.sh          # 用手机网易云 App 扫 qrcode.png
docker rm -f ncm-login

# 2) 构建前端(VITE_* 在此刻被嵌入)并起服务
set -a; . ./.env; set +a
npm --prefix web install
npm --prefix web run build
docker compose up -d        # nginx 服务 dist 并注入 NCM_MUSIC_U

# 打开 http://<本机IP>/ ,点“开始播放”
```

## 验证(阶段 0 的门)

- **8a 电脑 Chrome**:本机 `http://localhost/` 点“开始播放”,确认出声、歌词滚动。
- **8b 真车**:把服务暴露到车机可达地址(建议 https,如 `cloudflared`),在特斯拉浏览器打开验证;确认走车载扬声器、屏幕保活、行驶中可用。**8a 通过 ≠ 8b 通过。**

## 开发

```bash
npm --prefix web install
npm --prefix web run test    # 单元测试
npm --prefix web run dev     # 本地开发(需 dev 代理指向 ncm-api,见计划文档)
```

设计与实现计划见 `docs/superpowers/`。
