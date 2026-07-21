# Phase 1:tesla-music 完整播放器 — 设计文档

- 日期:2026-07-21
- 状态:设计已通过,待写实现计划
- 前置:阶段 0(验证页)已通过 8a;本阶段在其上扩展

## Context

阶段 0 证明了核心管线(登录 cookie → 取播放地址 → 出声 → 滚动歌词)在浏览器可用。Phase 1 把它从"一屏验证页"扩展成**可日常使用的车机播放器**:日推、我的歌单、搜索、完整播放控制,以及深空霓虹科技风、适合车机点击的 UI。用户已确认在 App 内做扫码登录。

## Goals

- 三大功能入口:**日推 / 我的歌单 / 搜索**,底部大标签导航 + 常驻迷你播放条 + 全屏播放页。
- **完整播放控制**:播放/暂停、上一首/下一首、乱序、循环(关/列表/单曲)、进度拖动、自动连播。
- **App 内扫码登录**,cookie 持久化在服务器端数据卷(凭证不落浏览器)。
- **深空霓虹**设计系统;所有主要可点元素 ≥ 64px,行车易点。

## Non-Goals

- 不做多用户隔离(仍单实例单账号)。
- 不做跨平台音源替换;realIP 仍可选默认关。
- Phase 1 不做逐字 yrc 歌词、翻译行(留 Phase 2)。
- 不做收藏/评论/私人FM/下载。

## 架构变化(核心)

**去掉 nginx,改用一个 Node BFF(`app` 服务)。** 部署从 3 概念层收敛为 2 个容器:

```
特斯拉浏览器 ── 前端静态(React SPA)
      │  同源 HTTP
┌─────▼─────────────────────────────┐
│  app (Node BFF)                   │
│   · 服务前端 dist(静态)            │
│   · /session/* 扫码登录 + cookie   │
│     持久化到数据卷 /data/cookie     │
│   · /api/* 转发 ncm-api,注入已存   │
│     cookie(凭证不落浏览器)         │
└─────┬─────────────────────────────┘
      │
┌─────▼─────────────────────────────┐
│  ncm-api (moefurina/ncm-api)      │
│   ENABLE_GENERAL_UNBLOCK=false    │
└───────────────────────────────────┘
```

**为什么加 BFF**:用户要 App 内扫码登录,又要凭证不落浏览器。nginx 只能注入 `.env` 里的静态 cookie,无法在运行时捕获登录返回的 cookie 并持久化。BFF 承担"薄持久化层":登录成功→存 cookie 到卷→后续 `/api` 注入。

**BFF 只代理 JSON**:音频仍由前端 `<audio>` 直连网易云 CDN(https 升级已在阶段 0 做),BFF 不碰二进制流。

### BFF 组件(server/,ESM JS,Vitest 测试)

- `cookieStore.js`:读写 `/data/cookie`(纯逻辑,单测)。接口:`readCookie(): string|null`、`writeCookie(musicU: string): void`、`getStatus(): {loggedIn: boolean}`。
- `session.js`:`GET /session/status`、`POST /session/qr/key`、`POST /session/qr/create`、`POST /session/qr/check`(转发 ncm-api 的 qr 流程;check 返回 803 时提取 MUSIC_U 并 `writeCookie`)。
- `apiProxy.js`:`ALL /api/*` → fetch `ncm-api:3000/*`,注入 `Cookie: MUSIC_U=<readCookie>`,回传 JSON。
- `index.js`:Express 组装静态服务 + session + apiProxy。
- 迁移:删除 `nginx/default.conf.template`;`docker-compose.yml` 用 `app` 服务替换 `web`(nginx),挂载 `cookie-data` 卷;`.env` 的 `NCM_MUSIC_U` 首次运行可选地 seed 进卷(否则首启显示登录页)。

## 前端组件(web/src/)

- `app/router` — 三 Tab(日推/歌单/搜索)+ 全屏播放页 + 登录页;底部 `TabBar`(大按钮)。
- `player/PlayerContext.tsx` — 全局播放状态:queue、index、isPlaying、shuffle、repeat、progress;动作 play(list,startIndex)/toggle/next/prev/seek/setShuffle/cycleRepeat。
- `player/queue.ts` — **纯函数(TDD)**:`nextIndex(len,index,repeat,shuffleOrder)`、`prevIndex(...)`、`buildShuffleOrder(len,current)`。播放控制的核心逻辑集中于此,便于独立测试。
- `player/MiniPlayer.tsx` — 常驻底条:封面/歌名/播放暂停/展开。
- `player/NowPlaying.tsx` — 全屏:封面 + 复用 `LyricsView` + 控制(播放/暂停/上下曲/乱序/循环/进度条)。
- `views/Daily.tsx`、`views/Playlists.tsx`(列表→详情 `PlaylistDetail`)、`views/Search.tsx`。
- `views/Login.tsx` — 二维码扫码 + 轮询 `/session/qr/check`。
- `api.ts`(扩展):`getDailySongs()`、`getUserPlaylists(uid)`、`getPlaylistTracks(id)`、`search(kw)`、`getLoginStatus()`、`getProfile()`;沿用 `getSongUrl`/`getLyric`。
- `ui/` — 深空霓虹设计系统(见下)。

## 深空霓虹设计系统

CSS 变量(`web/src/ui/theme.css`),暗色为唯一模式:

- 背景 `--bg:#0a0b12`;次层 `--bg-2:#0f1220`;细网格底纹叠加。
- 玻璃面板 `--surface:rgba(255,255,255,.04)` + `backdrop-filter: blur(12px)` + 边框 `rgba(120,200,255,.12)`。
- 强调 `--cyan:#22d3ee`、`--purple:#a855f7`;当前歌词/进度用青→紫渐变 + 辉光 `box-shadow`。
- 文本 `--text:#e6edf3`、`--text-2:#8b97a7`。
- 点击目标 ≥ 64px 高;底部 TabBar 与播放控制按钮特大;字号大、对比高。
- 过渡柔和(200–300ms),歌词行发光高亮。

## 数据流

前端调 `/api/*`(BFF 注入 cookie)→ ncm-api → 网易云。播放:取 songId 列表入队 → 当前曲调 `/api/song/url/v1`(前端升 https)喂 `<audio>` + 调 `/api/lyric` 滚词 → 结束按 repeat/shuffle 决定 next。

## 错误处理

- 未登录(BFF status loggedOut)→ 全局跳登录页。
- 取不到播放地址 → toast 提示并自动跳下一首(不卡队列)。
- 歌词缺失 → 显示"暂无歌词"(已有降级)。
- BFF 与 ncm-api 通信失败 → 502 JSON,前端 toast。

## 测试

- **BFF**:`cookieStore` 纯逻辑单测;session/apiProxy 用 supertest + 打桩 ncm-api 做集成测试(登录写卷、api 注入 cookie、未登录状态)。
- **前端**:`queue.ts`(next/prev/shuffle/repeat 全分支)纯函数 TDD;`PlayerContext` reducer 测试;关键组件(TabBar 切换、MiniPlayer 展开、Login 轮询)交互测试。已有 `parseLrc`/`LyricsView`/`api` 测试保留。

## 构建顺序(分阶段,每步独立可验证)

1. **BFF 替换 nginx**:session+cookie持久化+api代理;删 nginx。验收:现有验证页仍能播,登录态由数据卷驱动;`docker compose up` 单命令起。
2. **设计系统 + 播放器状态**:深空霓虹 theme + PlayerContext + queue 纯函数 + NowPlaying 完整控制(切歌/乱序/循环/进度)。验收:验证页升级成真播放器,一个歌单能连播、乱序、循环。
3. **三 Tab + 导航 + 迷你播放条**:日推/歌单/搜索 + 底部 TabBar + MiniPlayer。验收:三入口都能选歌入队播放。
4. **扫码登录页**:Login 视图 + 未登录跳转。验收:清空 cookie 卷后,App 显示扫码页,扫码后进入主界面。

## 验证

- BFF:`docker compose up` 后清空 cookie 卷 → `/session/status` 未登录;扫码 → 已登录并持久化;重启容器仍登录。
- 前端:桌面 Chrome 走通 登录→日推/歌单/搜索→连播/乱序/循环/进度/切歌→滚词。
- 车机(延续阶段 0 的 8b):真车上验证新 UI 的可点性与出声。

## 实现时确认

- ncm-api 的 `/login/qr/*` 与 `/user/playlist`、`/playlist/track/all`、`/recommend/songs`、`/cloudsearch` 已在阶段 0 后实测可用。
- BFF 静态服务 + 代理的 Express 中间件顺序(避免 `/api` 被静态兜底吞掉)。
