# tesla-music

自托管、开源、车机优化的网易云音乐 Web 播放器,深空霓虹科技风、适合车机点击。日推 / 我的歌单 / 搜索 / 完整播放控制(切歌·乱序·循环·进度)/ 行车滚动歌词。每个人部署自己的小服务器、登录自己的账号。

## 边界与姿态

- **自托管,各用各的**:不做中心服务,不持有任何他人凭证。
- **不做跨平台音源替换**:后端 `ENABLE_GENERAL_UNBLOCK=false`。灰色无版权歌不会被替换成别家音源。
- **realIP 区域解锁可选、默认关闭**:仅当在 `.env` 配置 `VITE_REAL_IP` 时才启用,依赖你自己账号的版权,后果自负。
- **凭证不落浏览器**:登录 cookie 只存在服务器端数据卷(`/data/cookie`),由后端注入;前端与浏览器中不出现 `MUSIC_U`。

## 架构(2 个容器)

- `app`(Node/Express):服务前端静态页;`/session/*` 扫码登录并把 cookie 持久化到数据卷;`/api/*` 转发到 `ncm-api` 时注入已存 cookie。
- `ncm-api`(`moefurina/ncm-api`):网易云 API,`ENABLE_GENERAL_UNBLOCK=false`。

音频由前端 `<audio>` 直连网易云 CDN(地址前端升级为 https,防车机混合内容拦截)。

## 依赖

- Docker + Docker Compose(前端在镜像内构建,无需本机 Node)

## 部署

```bash
cp .env.example .env
# 可选:编辑 .env —— 首启想直接带登录态可填 NCM_MUSIC_U;VITE_REAL_IP 留空=不解锁
set -a; . ./.env; set +a
docker compose up -d --build
# 打开 http://<本机IP>/
```

首次打开若未登录,页面会显示**二维码**,用手机网易云 App 扫码即登录(cookie 存服务器端数据卷,重启不丢,长期免登录)。

> 命令行登录(可选):也可 `docker run -d -p 3000:3000 -e ENABLE_GENERAL_UNBLOCK=false moefurina/ncm-api` 后跑 `./scripts/login.sh` 把 `MUSIC_U` 写入 `.env` 再部署。

## 验证(阶段门)

- **8a 电脑 Chrome**:`http://localhost/` 走通 登录→日推/歌单/搜索→连播/乱序/循环/进度/切歌/滚词。
- **8b 真车**:把服务用 https 暴露到车机可达地址(如 `cloudflared`),特斯拉浏览器打开;确认走车载扬声器、屏幕保活、行驶中可用。**8a 通过 ≠ 8b 通过。**

## 开发

```bash
npm --prefix web install && npm --prefix web run test   # 前端单测
npm --prefix server install && npm --prefix server test # BFF 单测
```

设计与实现计划见 `docs/superpowers/`。
