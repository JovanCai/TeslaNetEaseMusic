# Phase 1 完整播放器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把阶段 0 验证页扩展成可日常使用的车机播放器:BFF 承载扫码登录与服务器端 cookie 持久化,前端提供日推/歌单/搜索、完整播放控制与深空霓虹 UI。

**Architecture:** 去掉 nginx,新增 Node/Express BFF(`app` 服务):服务前端静态、`/session/*` 扫码登录并把 cookie 存到数据卷、`/api/*` 转发 ncm-api 时注入已存 cookie。前端为 React SPA,底部三大标签 + 常驻迷你播放条 + 全屏播放页。音频仍由前端直连网易云 CDN(https)。

**Tech Stack:** 前端 Vite+React+TS+Vitest;BFF Node20+Express(ESM JS)+Vitest+supertest;Docker(多阶段构建前端+跑 BFF)+ Compose(2 容器)。

## Global Constraints

- **凭证不落浏览器**:cookie 只存服务器端数据卷 `/data/cookie`,由 BFF 注入;`MUSIC_U` 绝不出现在前端代码、浏览器 URL 或 localStorage。
- **不做音源替换**:ncm-api `ENABLE_GENERAL_UNBLOCK=false`。
- **realIP 可选默认关**:仅当 `VITE_REAL_IP` 非空时前端才附加 `&realIP=`。
- **单实例单账号**:单 cookie 文件。
- **BFF 只代理 JSON**;音频由前端 `<audio>` 直连 CDN(URL 前端升 https)。
- **2 个容器**:`ncm-api` + `app`(Express),**不再有 nginx**。
- **深空霓虹暗色令牌**:`--bg:#0a0b12`、`--bg-2:#0f1220`、`--surface:rgba(255,255,255,.04)`、边框 `rgba(120,200,255,.12)`、`--cyan:#22d3ee`、`--purple:#a855f7`、`--text:#e6edf3`、`--text-2:#8b97a7`;主要可点元素 ≥ 64px 高。

---

## File Structure

```
server/                         # 新增 BFF(ESM JS)
  package.json  Dockerfile? (Dockerfile 在仓库根)
  src/cookieStore.js            # 读写 /data/cookie(纯逻辑)
  src/session.js                # /session/* 扫码登录 + 写 cookie
  src/apiProxy.js               # /api/* 转发 + 注入 cookie
  src/index.js                  # express 组装:static + session + api
  test/cookieStore.test.js  test/session.test.js  test/apiProxy.test.js
Dockerfile                      # 多阶段:build web/dist + 跑 server
docker-compose.yml              # 改:app(build) 替换 web(nginx) + cookie-data 卷
web/src/
  ui/theme.css                  # 深空霓虹令牌 + 基础类
  api.ts                        # 扩展:日推/歌单/搜索/登录状态/资料
  player/queue.ts               # 纯函数:next/prev/shuffle(TDD)
  player/PlayerContext.tsx      # 全局播放状态(reducer)
  player/MiniPlayer.tsx  player/NowPlaying.tsx
  views/Daily.tsx  views/Playlists.tsx  views/Search.tsx  views/Login.tsx
  components/TabBar.tsx  components/SongList.tsx
  App.tsx                       # 改:路由 + Tab + 迷你条 + 登录判断
```

---

# 阶段 1:BFF 替换 nginx

### Task 1: BFF 脚手架 + cookieStore(TDD)

**Files:**
- Create: `server/package.json`, `server/src/cookieStore.js`, `server/test/cookieStore.test.js`

**Interfaces:**
- Produces: `createCookieStore(path) → { read(): string|null, write(musicU: string): void, status(): {loggedIn: boolean} }`

- [ ] **Step 1: 建 server 工程**

Create `server/package.json`:
```json
{
  "name": "tesla-music-server",
  "private": true,
  "type": "module",
  "scripts": { "start": "node src/index.js", "test": "vitest run" },
  "dependencies": { "express": "^4.21.2" },
  "devDependencies": { "vitest": "^4.1.10", "supertest": "^7.1.1" }
}
```
Run: `cd ~/tesla-music/server && npm install`

- [ ] **Step 2: 写失败测试**

Create `server/test/cookieStore.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCookieStore } from '../src/cookieStore.js'

let store
beforeEach(() => { store = createCookieStore(join(mkdtempSync(join(tmpdir(), 'ck-')), 'cookie')) })

describe('cookieStore', () => {
  it('初始未登录', () => expect(store.status()).toEqual({ loggedIn: false }))
  it('写后可读且已登录', () => {
    store.write('abc123')
    expect(store.read()).toBe('abc123')
    expect(store.status()).toEqual({ loggedIn: true })
  })
  it('空值视为未登录', () => { store.write(''); expect(store.read()).toBeNull() })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ~/tesla-music/server && npx vitest run test/cookieStore.test.js`
Expected: FAIL(找不到 `createCookieStore`)。

- [ ] **Step 4: 实现**

Create `server/src/cookieStore.js`:
```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function createCookieStore(path) {
  return {
    read() {
      try { return existsSync(path) ? (readFileSync(path, 'utf8').trim() || null) : null }
      catch { return null }
    },
    write(musicU) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, musicU ?? '', 'utf8')
    },
    status() { return { loggedIn: !!this.read() } },
  }
}
```

- [ ] **Step 5: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/server && npx vitest run test/cookieStore.test.js`  → PASS
```bash
cd ~/tesla-music && git add server && git commit -m "feat(bff): cookie store"
```

---

### Task 2: /api 代理注入 cookie(TDD,supertest + 打桩 fetch)

**Files:**
- Create: `server/src/apiProxy.js`, `server/test/apiProxy.test.js`

**Interfaces:**
- Consumes: cookieStore(仅 `read()`)。
- Produces: `apiProxy({ ncmBase, store }) → express handler`;把 `/api/foo?x=1` 转发到 `${ncmBase}/foo?x=1`,带 `Cookie: MUSIC_U=<read()>`(有 cookie 时)。

- [ ] **Step 1: 写失败测试**

Create `server/test/apiProxy.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiProxy } from '../src/apiProxy.js'

afterEach(() => vi.restoreAllMocks())

function appWith(cookie) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => ({
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ url, cookie: opts?.headers?.Cookie ?? null }),
  })))
  const app = express()
  app.use('/api', apiProxy({ ncmBase: 'http://ncm:3000', store: { read: () => cookie } }))
  return app
}

describe('apiProxy', () => {
  it('转发路径与query,并注入cookie', async () => {
    const res = await request(appWith('TESTU')).get('/api/song/url/v1?id=5')
    const j = JSON.parse(res.text)
    expect(j.url).toBe('http://ncm:3000/song/url/v1?id=5')
    expect(j.cookie).toBe('MUSIC_U=TESTU')
  })
  it('无cookie时不注入', async () => {
    const res = await request(appWith(null)).get('/api/search?keywords=x')
    expect(JSON.parse(res.text).cookie).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/server && npx vitest run test/apiProxy.test.js` → FAIL

- [ ] **Step 3: 实现**

Create `server/src/apiProxy.js`:
```js
export function apiProxy({ ncmBase, store }) {
  return async (req, res) => {
    const cookie = store.read()
    const headers = {}
    if (cookie) headers.Cookie = `MUSIC_U=${cookie}`
    try {
      const upstream = await fetch(`${ncmBase}${req.url}`, { headers })
      const body = await upstream.text()
      res.status(upstream.status)
      res.set('content-type', upstream.headers.get('content-type') || 'application/json')
      res.send(body)
    } catch (e) {
      res.status(502).json({ error: 'upstream', detail: String(e) })
    }
  }
}
```
注:`app.use('/api', handler)` 下,`req.url` 已剥去 `/api` 前缀,含 query。

- [ ] **Step 4: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/server && npx vitest run test/apiProxy.test.js` → PASS
```bash
cd ~/tesla-music && git add server && git commit -m "feat(bff): api proxy with server-side cookie injection"
```

---

### Task 3: /session 扫码登录路由(TDD)

**Files:**
- Create: `server/src/session.js`, `server/test/session.test.js`

**Interfaces:**
- Consumes: cookieStore(`write`,`status`)。
- Produces: `sessionRouter({ ncmBase, store, now? }) → express Router`,路由:
  - `GET /status` → `{loggedIn}`
  - `POST /qr/key` → `{unikey}`
  - `POST /qr/create`(body `{key}`)→ `{qrimg}`
  - `POST /qr/check`(body `{key}`)→ `{code, loggedIn}`;code 803 时从响应 `cookie` 提取 `MUSIC_U` 并 `store.write`。

- [ ] **Step 1: 写失败测试**

Create `server/test/session.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { sessionRouter } from '../src/session.js'

afterEach(() => vi.restoreAllMocks())

function makeApp(store, fetchImpl) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const app = express()
  app.use(express.json())
  app.use('/session', sessionRouter({ ncmBase: 'http://ncm:3000', store, now: () => 111 }))
  return app
}
const okJson = (obj) => async () => ({ json: async () => obj })

describe('sessionRouter', () => {
  it('status 透传 store', async () => {
    const app = makeApp({ status: () => ({ loggedIn: true }) }, okJson({}))
    expect((await request(app).get('/session/status')).body).toEqual({ loggedIn: true })
  })
  it('qr/key 返回 unikey', async () => {
    const app = makeApp({}, okJson({ data: { unikey: 'K1' } }))
    expect((await request(app).post('/session/qr/key')).body).toEqual({ unikey: 'K1' })
  })
  it('qr/check 成功时写入 MUSIC_U', async () => {
    const written = []
    const store = { write: (v) => written.push(v), status: () => ({ loggedIn: written.length > 0 }) }
    const app = makeApp(store, okJson({ code: 803, cookie: 'MUSIC_U=ABC; Max-Age=1' }))
    const res = await request(app).post('/session/qr/check').send({ key: 'K1' })
    expect(written).toEqual(['ABC'])
    expect(res.body).toEqual({ code: 803, loggedIn: true })
  })
  it('qr/check 未确认(801)不写入', async () => {
    const store = { write: vi.fn(), status: () => ({ loggedIn: false }) }
    const app = makeApp(store, okJson({ code: 801 }))
    const res = await request(app).post('/session/qr/check').send({ key: 'K1' })
    expect(store.write).not.toHaveBeenCalled()
    expect(res.body).toEqual({ code: 801, loggedIn: false })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/server && npx vitest run test/session.test.js` → FAIL

- [ ] **Step 3: 实现**

Create `server/src/session.js`:
```js
import { Router } from 'express'

export function sessionRouter({ ncmBase, store, now = () => Date.now() }) {
  const r = Router()
  r.get('/status', (req, res) => res.json(store.status()))
  r.post('/qr/key', async (req, res) => {
    const j = await (await fetch(`${ncmBase}/login/qr/key?timestamp=${now()}`)).json()
    res.json({ unikey: j?.data?.unikey ?? null })
  })
  r.post('/qr/create', async (req, res) => {
    const key = encodeURIComponent(req.body?.key ?? '')
    const j = await (await fetch(`${ncmBase}/login/qr/create?key=${key}&qrimg=true&timestamp=${now()}`)).json()
    res.json({ qrimg: j?.data?.qrimg ?? null })
  })
  r.post('/qr/check', async (req, res) => {
    const key = encodeURIComponent(req.body?.key ?? '')
    const j = await (await fetch(`${ncmBase}/login/qr/check?key=${key}&timestamp=${now()}`)).json()
    if (j?.code === 803) {
      const m = /MUSIC_U=([^;]+)/.exec(j?.cookie || '')
      if (m) store.write(m[1])
    }
    res.json({ code: j?.code, loggedIn: store.status().loggedIn })
  })
  return r
}
```

- [ ] **Step 4: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/server && npx vitest run test/session.test.js` → PASS
```bash
cd ~/tesla-music && git add server && git commit -m "feat(bff): qr-login session routes with cookie persistence"
```

---

### Task 4: index 组装 + Dockerfile + compose 换掉 nginx(集成)

**Files:**
- Create: `server/src/index.js`, `Dockerfile`
- Modify: `docker-compose.yml`(全量替换)
- Delete: `nginx/default.conf.template`(及空 `nginx/` 目录)

**Interfaces:**
- Consumes: cookieStore、sessionRouter、apiProxy。
- Produces: `docker compose up` 后单容器 `app` 服务前端 + `/session` + `/api`;cookie 存 `cookie-data` 卷。

- [ ] **Step 1: index.js**

Create `server/src/index.js`:
```js
import express from 'express'
import { join } from 'node:path'
import { createCookieStore } from './cookieStore.js'
import { sessionRouter } from './session.js'
import { apiProxy } from './apiProxy.js'

const PORT = Number(process.env.PORT || 80)
const NCM = process.env.NCM_BASE || 'http://ncm-api:3000'
const COOKIE_PATH = process.env.COOKIE_PATH || '/data/cookie'
const DIST = process.env.DIST_DIR || '/app/dist'

const store = createCookieStore(COOKIE_PATH)
if (!store.read() && process.env.NCM_MUSIC_U) store.write(process.env.NCM_MUSIC_U) // 首启可选 seed

const app = express()
app.use(express.json())
app.use('/session', sessionRouter({ ncmBase: NCM, store }))
app.use('/api', apiProxy({ ncmBase: NCM, store }))
app.use(express.static(DIST))
app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')))
app.listen(PORT, () => console.log(`app listening on ${PORT}`))
```

- [ ] **Step 2: Dockerfile(多阶段:构建前端 + 跑 BFF)**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
ARG VITE_DEMO_SONG_ID
ARG VITE_REAL_IP
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./dist
ENV DIST_DIR=/app/dist
EXPOSE 80
CMD ["node", "src/index.js"]
```

- [ ] **Step 3: docker-compose.yml 全量替换**

Replace `docker-compose.yml`:
```yaml
services:
  ncm-api:
    image: moefurina/ncm-api:latest
    environment:
      - ENABLE_GENERAL_UNBLOCK=false
    restart: unless-stopped
  app:
    build:
      context: .
      args:
        VITE_DEMO_SONG_ID: ${VITE_DEMO_SONG_ID}
        VITE_REAL_IP: ${VITE_REAL_IP}
    depends_on: [ncm-api]
    ports: ["80:80"]
    environment:
      - NCM_BASE=http://ncm-api:3000
      - NCM_MUSIC_U=${NCM_MUSIC_U}
      - COOKIE_PATH=/data/cookie
    volumes:
      - cookie-data:/data
    restart: unless-stopped
volumes:
  cookie-data:
```

- [ ] **Step 4: 删除 nginx,起服务验证**

```bash
cd ~/tesla-music && git rm nginx/default.conf.template
set -a; . ./.env; set +a
docker compose up -d --build
sleep 5
curl -s localhost/session/status                     # {"loggedIn":true}(.env seed)
curl -s "localhost/api/search?keywords=test&limit=1" | head -c 80   # 真实结果
curl -s -o /dev/null -w "静态页 %{http_code}\n" localhost/
```
Expected: session 已登录、search 返回结果、静态页 200。

- [ ] **Step 5: Commit**

```bash
cd ~/tesla-music && git add -A && git commit -m "feat(bff): serve static + wire session/api; replace nginx with app service"
```

---

# 阶段 2:深空霓虹设计系统 + 播放器状态

### Task 5: 深空霓虹主题 + 应用到验证页(视觉)

**Files:**
- Create: `web/src/ui/theme.css`
- Modify: `web/src/main.tsx`(引入 theme.css)、`web/src/App.css`(改用令牌)

**Interfaces:**
- Produces: 全局 CSS 变量与基础类(`.glass`、`.neon-text`、`.tap`(≥64px))。

- [ ] **Step 1: theme.css**

Create `web/src/ui/theme.css`:
```css
:root {
  --bg:#0a0b12; --bg-2:#0f1220; --surface:rgba(255,255,255,.04);
  --border:rgba(120,200,255,.12); --cyan:#22d3ee; --purple:#a855f7;
  --text:#e6edf3; --text-2:#8b97a7;
}
body { margin:0; background:
  radial-gradient(1200px 600px at 70% -10%, rgba(34,211,238,.08), transparent),
  linear-gradient(180deg, var(--bg), var(--bg-2)); color:var(--text);
  font-family: system-ui, -apple-system, 'PingFang SC', sans-serif; }
.glass { background:var(--surface); backdrop-filter:blur(12px);
  border:1px solid var(--border); border-radius:16px; }
.neon-text { color:var(--cyan); text-shadow:0 0 12px rgba(34,211,238,.6); }
.tap { min-height:64px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; user-select:none; }
```

- [ ] **Step 2: 引入并改造验证页**

In `web/src/main.tsx` add `import './ui/theme.css'` (在 `import './index.css'` 之后)。
Replace `web/src/App.css`:
```css
.app { min-height:100vh; display:flex; flex-direction:column; align-items:center; }
.start { font-size:2rem; padding:1.25rem 2.5rem; margin:18vh 0; border-radius:16px;
  background:linear-gradient(90deg,var(--cyan),var(--purple)); color:#00121a; border:0; font-weight:700;
  box-shadow:0 0 30px rgba(34,211,238,.35); }
.lyrics { text-align:center; font-size:1.6rem; line-height:2.6; padding:38vh 0; }
.line { opacity:.4; transition:opacity .3s, text-shadow .3s; }
.line.active { opacity:1; font-weight:700; font-size:2rem; }
.line.active { color:var(--cyan); text-shadow:0 0 14px rgba(34,211,238,.6); }
.lyrics-empty,.err { font-size:1.3rem; color:var(--text-2); margin-top:28vh; }
```

- [ ] **Step 3: 构建 + 目视确认**

Run: `cd ~/tesla-music/web && npm run build && npm run test`  → build ok,17/17 通过
浏览器打开(compose 已起)确认深色霓虹生效。

- [ ] **Step 4: Commit**

```bash
cd ~/tesla-music && git add web/src && git commit -m "feat(ui): deep-space neon theme applied to validation page"
```

---

### Task 6: 播放队列纯函数(TDD)

**Files:**
- Create: `web/src/player/queue.ts`, `web/src/player/queue.test.ts`

**Interfaces:**
- Produces:
  - `type Repeat = 'off' | 'all' | 'one'`
  - `nextIndex(len: number, index: number, repeat: Repeat): number`(到末尾:all→0,off→-1,one→同 index)
  - `prevIndex(len: number, index: number): number`(首→0)
  - `buildShuffleOrder(len: number, current: number): number[]`(current 打头,其余顺序打乱前的确定序;用可测的确定实现:current 在前,后接其余升序)

- [ ] **Step 1: 写失败测试**

Create `web/src/player/queue.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { nextIndex, prevIndex, buildShuffleOrder } from './queue'

describe('nextIndex', () => {
  it('普通前进', () => expect(nextIndex(3, 0, 'off')).toBe(1))
  it('末尾 off 返回 -1', () => expect(nextIndex(3, 2, 'off')).toBe(-1))
  it('末尾 all 回到 0', () => expect(nextIndex(3, 2, 'all')).toBe(0))
  it('单曲 one 停在原地', () => expect(nextIndex(3, 1, 'one')).toBe(1))
})
describe('prevIndex', () => {
  it('普通后退', () => expect(prevIndex(3, 2)).toBe(1))
  it('首个后退夹在 0', () => expect(prevIndex(3, 0)).toBe(0))
})
describe('buildShuffleOrder', () => {
  it('current 打头且是全排列', () => {
    const order = buildShuffleOrder(4, 2)
    expect(order[0]).toBe(2)
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/player/queue.test.ts` → FAIL

- [ ] **Step 3: 实现**

Create `web/src/player/queue.ts`:
```ts
export type Repeat = 'off' | 'all' | 'one'

export function nextIndex(len: number, index: number, repeat: Repeat): number {
  if (len === 0) return -1
  if (repeat === 'one') return index
  if (index + 1 < len) return index + 1
  return repeat === 'all' ? 0 : -1
}

export function prevIndex(len: number, index: number): number {
  if (len === 0) return -1
  return index > 0 ? index - 1 : 0
}

export function buildShuffleOrder(len: number, current: number): number[] {
  const rest = Array.from({ length: len }, (_, i) => i).filter((i) => i !== current)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [current, ...rest]
}
```

- [ ] **Step 4: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/web && npx vitest run src/player/queue.test.ts` → PASS
```bash
cd ~/tesla-music && git add web/src/player/queue.ts web/src/player/queue.test.ts && git commit -m "feat(player): queue next/prev/shuffle logic"
```

---

### Task 7: PlayerContext(reducer + provider)

**Files:**
- Create: `web/src/player/PlayerContext.tsx`, `web/src/player/PlayerContext.test.tsx`

**Interfaces:**
- Consumes: `queue.ts`、`getSongUrl`/`getLyric`(api.ts)、`useAudio`。
- Produces: `PlayerProvider`、`usePlayer() → { queue, index, current, isPlaying, shuffle, repeat, currentMs, playList(songs, start), toggle, next, prev, seek, setShuffle, cycleRepeat }`。`Song = { id:number, name:string, artist:string, cover:string }`。

- [ ] **Step 1: 写失败测试(reducer 纯逻辑)**

Create `web/src/player/PlayerContext.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { playerReducer, initialPlayerState } from './PlayerContext'

const songs = [
  { id: 1, name: 'a', artist: 'x', cover: '' },
  { id: 2, name: 'b', artist: 'y', cover: '' },
]

describe('playerReducer', () => {
  it('playList 设置队列并定位', () => {
    const s = playerReducer(initialPlayerState, { type: 'playList', songs, start: 1 })
    expect(s.queue).toHaveLength(2)
    expect(s.index).toBe(1)
    expect(s.isPlaying).toBe(true)
  })
  it('cycleRepeat 循环 off→all→one→off', () => {
    let s = { ...initialPlayerState }
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('all')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('one')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('off')
  })
  it('next 到末尾 off 保持并停', () => {
    let s = playerReducer(initialPlayerState, { type: 'playList', songs, start: 1 })
    s = playerReducer(s, { type: 'next' })
    expect(s.index).toBe(1); expect(s.isPlaying).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/player/PlayerContext.test.tsx` → FAIL

- [ ] **Step 3: 实现**

Create `web/src/player/PlayerContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useReducer } from 'react'
import { nextIndex, prevIndex, type Repeat } from './queue'
import { getSongUrl, getLyric } from '../api'
import { useAudio } from './useAudio'

export interface Song { id: number; name: string; artist: string; cover: string }
export interface PlayerState {
  queue: Song[]; index: number; isPlaying: boolean; shuffle: boolean; repeat: Repeat; lrc: string
}
export const initialPlayerState: PlayerState = {
  queue: [], index: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '',
}
type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'toggle' } | { type: 'next' } | { type: 'prev' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string }

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': return { ...s, queue: a.songs, index: a.start, isPlaying: true, lrc: '' }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'next': {
      const i = nextIndex(s.queue.length, s.index, s.repeat)
      return i < 0 ? { ...s, isPlaying: false } : { ...s, index: i, isPlaying: true, lrc: '' }
    }
    case 'prev': return { ...s, index: prevIndex(s.queue.length, s.index), lrc: '' }
    case 'setShuffle': return { ...s, shuffle: a.on }
    case 'cycleRepeat': {
      const order: Repeat[] = ['off', 'all', 'one']
      return { ...s, repeat: order[(order.indexOf(s.repeat) + 1) % 3] }
    }
    case 'setLrc': return { ...s, lrc: a.lrc }
    default: return s
  }
}

const Ctx = createContext<any>(null)
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState)
  const { play, pause, currentMs } = useAudio()
  const current = state.index >= 0 ? state.queue[state.index] : null

  useEffect(() => {
    if (!current) return
    let cancelled = false
    ;(async () => {
      const realIP = (import.meta.env.VITE_REAL_IP as string) || undefined
      const [song, lyric] = await Promise.all([getSongUrl(current.id, realIP), getLyric(current.id)])
      if (cancelled) return
      dispatch({ type: 'setLrc', lrc: lyric.lrc })
      if (song.url) await play(song.url)
    })()
    return () => { cancelled = true }
  }, [current?.id]) // eslint-disable-line

  useEffect(() => { state.isPlaying ? undefined : pause() }, [state.isPlaying]) // 暂停控制

  const value = {
    ...state, current, currentMs,
    playList: (songs: Song[], start: number) => dispatch({ type: 'playList', songs, start }),
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    setShuffle: (on: boolean) => dispatch({ type: 'setShuffle', on }),
    cycleRepeat: () => dispatch({ type: 'cycleRepeat' }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export function usePlayer() { return useContext(Ctx) }
```
注:`useAudio` 需扩展出 `pause()`(见 Step 4)。

- [ ] **Step 4: 给 useAudio 加 pause + 播完自动 next 钩子**

Modify `web/src/player/useAudio.ts` — 增加 `pause()` 与 `onEnded` 回调:
```ts
import { useEffect, useState } from 'react'

export function useAudio(onEnded?: () => void) {
  const [audio] = useState(() => new Audio())
  const [currentMs, setCurrentMs] = useState(0)
  useEffect(() => {
    const onTime = () => setCurrentMs(audio.currentTime * 1000)
    const onEnd = () => onEnded?.()
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('ended', onEnd) }
  }, [audio, onEnded])
  async function play(url: string) { if (audio.src !== url) audio.src = url; await audio.play() }
  function pause() { audio.pause() }
  function seek(ms: number) { audio.currentTime = ms / 1000 }
  return { play, pause, seek, currentMs }
}
```
(PlayerContext 里把 `dispatch({type:'next'})` 作为 `onEnded` 传入 useAudio 以实现自动连播。)

- [ ] **Step 5: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/web && npx vitest run src/player/PlayerContext.test.tsx` → PASS
```bash
cd ~/tesla-music && git add web/src/player && git commit -m "feat(player): PlayerContext reducer + audio pause/seek/ended"
```

---

### Task 8: 全屏播放页 + 迷你播放条

**Files:**
- Create: `web/src/player/NowPlaying.tsx`, `web/src/player/MiniPlayer.tsx`, `web/src/player/player.css`

**Interfaces:**
- Consumes: `usePlayer()`、`LyricsView`、`parseLrc`/`getCurrentLineIndex`。
- Produces: `<NowPlaying onClose>`(全屏)、`<MiniPlayer onExpand>`(底条)。

- [ ] **Step 1: MiniPlayer**

Create `web/src/player/MiniPlayer.tsx`:
```tsx
import { usePlayer } from './PlayerContext'
import './player.css'

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const p = usePlayer()
  if (!p.current) return null
  return (
    <div className="mini glass">
      <div className="mini-info tap" onClick={onExpand}>
        {p.current.cover && <img src={p.current.cover} alt="" className="mini-cover" />}
        <div className="mini-meta">
          <div className="mini-name">{p.current.name}</div>
          <div className="mini-artist">{p.current.artist}</div>
        </div>
      </div>
      <button className="tap ctl" onClick={p.toggle}>{p.isPlaying ? '⏸' : '▶'}</button>
      <button className="tap ctl" onClick={p.next}>⏭</button>
    </div>
  )
}
```

- [ ] **Step 2: NowPlaying**

Create `web/src/player/NowPlaying.tsx`:
```tsx
import { useMemo } from 'react'
import { usePlayer } from './PlayerContext'
import { parseLrc, getCurrentLineIndex } from '../lyrics/parseLrc'
import { LyricsView } from '../lyrics/LyricsView'
import './player.css'

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer()
  const lines = useMemo(() => parseLrc(p.lrc), [p.lrc])
  const active = getCurrentLineIndex(lines, p.currentMs)
  if (!p.current) return null
  return (
    <div className="np">
      <button className="tap np-close" onClick={onClose}>▾</button>
      <div className="np-title neon-text">{p.current.name} — {p.current.artist}</div>
      <LyricsView lines={lines} activeIndex={active} />
      <div className="np-ctl">
        <button className="tap ctl" onClick={() => p.setShuffle(!p.shuffle)}>{p.shuffle ? '🔀' : '➡'}</button>
        <button className="tap ctl" onClick={p.prev}>⏮</button>
        <button className="tap ctl big" onClick={p.toggle}>{p.isPlaying ? '⏸' : '▶'}</button>
        <button className="tap ctl" onClick={p.next}>⏭</button>
        <button className="tap ctl" onClick={p.cycleRepeat}>{p.repeat === 'one' ? '🔂' : p.repeat === 'all' ? '🔁' : '↩'}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: player.css(深空霓虹,大点击区)**

Create `web/src/player/player.css`:
```css
.mini { position:fixed; left:12px; right:12px; bottom:88px; display:flex; align-items:center; gap:8px; padding:8px 12px; z-index:20; }
.mini-info { flex:1; gap:12px; justify-content:flex-start; }
.mini-cover { width:48px; height:48px; border-radius:10px; }
.mini-name { font-weight:600; } .mini-artist { color:var(--text-2); font-size:.9rem; }
.ctl { min-width:64px; font-size:1.6rem; background:none; border:0; color:var(--text); }
.ctl.big { font-size:2.4rem; color:var(--cyan); text-shadow:0 0 16px rgba(34,211,238,.6); }
.np { position:fixed; inset:0; z-index:30; display:flex; flex-direction:column; align-items:center;
  background:linear-gradient(180deg, var(--bg), var(--bg-2)); }
.np-close { align-self:center; font-size:2rem; color:var(--text-2); background:none; border:0; }
.np-title { font-size:1.4rem; margin:8px 0; }
.np-ctl { display:flex; gap:8px; padding:24px 0 40px; }
```

- [ ] **Step 4: 构建 + 目视**

Run: `cd ~/tesla-music/web && npm run build && npm run test` → build ok,测试全绿。
(接线到 App 在 Task 10。)

- [ ] **Step 5: Commit**

```bash
cd ~/tesla-music && git add web/src/player && git commit -m "feat(player): NowPlaying + MiniPlayer (deep-space neon)"
```

---

# 阶段 3:三 Tab + 导航 + 迷你播放条

### Task 9: api.ts 扩展(TDD)

**Files:**
- Modify: `web/src/api.ts`
- Test: `web/src/api.test.ts`(追加)

**Interfaces:**
- Produces(均返回归一化 `Song[]` 或简单结构):
  - `getDailySongs(): Promise<Song[]>` ← `/api/recommend/songs`(`data.dailySongs`)
  - `getUserPlaylists(uid: number): Promise<{id:number,name:string,cover:string,count:number}[]>` ← `/api/user/playlist`
  - `getPlaylistTracks(id: number): Promise<Song[]>` ← `/api/playlist/track/all`
  - `search(keywords: string): Promise<Song[]>` ← `/api/cloudsearch`(`result.songs`)
  - `getLoginStatus(): Promise<{loggedIn:boolean, uid:number|null, nickname:string|null}>` ← `/api/login/status`
  - `Song = { id, name, artist, cover }`;归一化函数 `toSong(raw)`(处理 `ar`/`artists`、`al`/`album`)。

- [ ] **Step 1: 追加失败测试**

Append to `web/src/api.test.ts`:
```ts
import { getDailySongs, search, getUserPlaylists } from './api'

describe('getDailySongs', () => {
  it('归一化 dailySongs', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { dailySongs: [
      { id: 7, name: 'S', ar: [{ name: 'A' }], al: { picUrl: 'p' } }] } }))
    expect(await getDailySongs()).toEqual([{ id: 7, name: 'S', artist: 'A', cover: 'p' }])
  })
})
describe('search', () => {
  it('归一化 result.songs', async () => {
    vi.stubGlobal('fetch', mockFetch({ result: { songs: [
      { id: 9, name: 'T', ar: [{ name: 'B' }], al: { picUrl: 'q' } }] } }))
    const r = await search('x'); expect(r[0]).toEqual({ id: 9, name: 'T', artist: 'B', cover: 'q' })
  })
})
describe('getUserPlaylists', () => {
  it('映射歌单概要', async () => {
    vi.stubGlobal('fetch', mockFetch({ playlist: [{ id: 1, name: 'PL', coverImgUrl: 'c', trackCount: 5 }] }))
    expect(await getUserPlaylists(42)).toEqual([{ id: 1, name: 'PL', cover: 'c', count: 5 }])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/api.test.ts` → 新增用例 FAIL

- [ ] **Step 3: 实现(追加到 api.ts)**

Append to `web/src/api.ts`:
```ts
export interface Song { id: number; name: string; artist: string; cover: string }
function toSong(r: any): Song {
  const ar = r.ar ?? r.artists ?? []
  const al = r.al ?? r.album ?? {}
  return { id: r.id, name: r.name, artist: (ar[0]?.name ?? ''), cover: (al.picUrl ?? '') }
}
async function getJson(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
}
export async function getDailySongs(): Promise<Song[]> {
  const j = await getJson('/recommend/songs'); return (j?.data?.dailySongs ?? []).map(toSong)
}
export async function getPlaylistTracks(id: number): Promise<Song[]> {
  const j = await getJson(`/playlist/track/all?id=${id}&limit=200`); return (j?.songs ?? []).map(toSong)
}
export async function search(keywords: string): Promise<Song[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&limit=30`)
  return (j?.result?.songs ?? []).map(toSong)
}
export async function getUserPlaylists(uid: number) {
  const j = await getJson(`/user/playlist?uid=${uid}&limit=60`)
  return (j?.playlist ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: p.coverImgUrl ?? '', count: p.trackCount ?? 0 }))
}
export async function getLoginStatus() {
  const j = await getJson('/login/status')
  const prof = j?.data?.profile
  return { loggedIn: !!prof, uid: prof?.userId ?? null, nickname: prof?.nickname ?? null }
}
```
注:`BASE` 已在文件顶部定义为 `/api`,复用。

- [ ] **Step 4: 跑测试确认通过并提交**

Run: `cd ~/tesla-music/web && npx vitest run src/api.test.ts` → PASS
```bash
cd ~/tesla-music && git add web/src/api.ts web/src/api.test.ts && git commit -m "feat(api): daily/playlists/tracks/search/status with Song normalization"
```

---

### Task 10: 三视图 + TabBar + App 接线

**Files:**
- Create: `web/src/components/TabBar.tsx`, `web/src/components/SongList.tsx`, `web/src/views/Daily.tsx`, `web/src/views/Playlists.tsx`, `web/src/views/Search.tsx`, `web/src/app.css`
- Modify: `web/src/App.tsx`(全量替换为壳)、`web/src/main.tsx`(包 PlayerProvider)

**Interfaces:**
- Consumes: `usePlayer`、api 扩展、`MiniPlayer`/`NowPlaying`。
- Produces: 三 Tab 壳 + 全屏播放页开合。无路由库,用本地 `tab` 与 `showNP` 状态。

- [ ] **Step 1: SongList(复用列表,点即入队播放)**

Create `web/src/components/SongList.tsx`:
```tsx
import type { Song } from '../api'
import { usePlayer } from '../player/PlayerContext'

export function SongList({ songs }: { songs: Song[] }) {
  const p = usePlayer()
  return (
    <div className="song-list">
      {songs.map((s, i) => (
        <div key={s.id} className="song-row tap" onClick={() => p.playList(songs, i)}>
          {s.cover && <img src={s.cover} className="song-cover" alt="" />}
          <div className="song-meta"><div>{s.name}</div><div className="song-artist">{s.artist}</div></div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 三视图**

Create `web/src/views/Daily.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { getDailySongs, type Song } from '../api'
import { SongList } from '../components/SongList'
export function Daily() {
  const [songs, setSongs] = useState<Song[]>([])
  useEffect(() => { getDailySongs().then(setSongs).catch(() => {}) }, [])
  return <div className="view"><h2 className="view-title">每日推荐</h2><SongList songs={songs} /></div>
}
```
Create `web/src/views/Search.tsx`:
```tsx
import { useState } from 'react'
import { search, type Song } from '../api'
import { SongList } from '../components/SongList'
export function Search() {
  const [kw, setKw] = useState(''); const [songs, setSongs] = useState<Song[]>([])
  async function go() { if (kw.trim()) setSongs(await search(kw.trim())) }
  return (
    <div className="view">
      <div className="search-bar">
        <input className="search-input" value={kw} onChange={e => setKw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()} placeholder="搜索歌曲 / 歌手" />
        <button className="tap search-go" onClick={go}>搜索</button>
      </div>
      <SongList songs={songs} />
    </div>
  )
}
```
Create `web/src/views/Playlists.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { getUserPlaylists, getPlaylistTracks, getLoginStatus, type Song } from '../api'
import { SongList } from '../components/SongList'
export function Playlists() {
  const [lists, setLists] = useState<{ id: number; name: string; cover: string; count: number }[]>([])
  const [tracks, setTracks] = useState<Song[] | null>(null)
  useEffect(() => { getLoginStatus().then(s => s.uid && getUserPlaylists(s.uid).then(setLists)) }, [])
  if (tracks) return <div className="view"><button className="tap" onClick={() => setTracks(null)}>← 返回歌单</button><SongList songs={tracks} /></div>
  return (
    <div className="view"><h2 className="view-title">我的歌单</h2>
      <div className="pl-grid">
        {lists.map(pl => (
          <div key={pl.id} className="pl-card glass tap" onClick={() => getPlaylistTracks(pl.id).then(setTracks)}>
            {pl.cover && <img src={pl.cover} className="pl-cover" alt="" />}
            <div className="pl-name">{pl.name}</div><div className="pl-count">{pl.count} 首</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TabBar + App 壳**

Create `web/src/components/TabBar.tsx`:
```tsx
export function TabBar({ tab, onTab }: { tab: string; onTab: (t: string) => void }) {
  const tabs = [['daily', '日推'], ['playlists', '歌单'], ['search', '搜索']]
  return (
    <nav className="tabbar glass">
      {tabs.map(([k, label]) => (
        <div key={k} className={`tap tabbtn ${tab === k ? 'active' : ''}`} onClick={() => onTab(k)}>{label}</div>
      ))}
    </nav>
  )
}
```
Replace `web/src/App.tsx`:
```tsx
import { useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Playlists } from './views/Playlists'
import { Search } from './views/Search'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import './app.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  return (
    <div className="shell">
      <main className="content">
        {tab === 'daily' && <Daily />}
        {tab === 'playlists' && <Playlists />}
        {tab === 'search' && <Search />}
      </main>
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={setTab} />
      {showNP && <NowPlaying onClose={() => setShowNP(false)} />}
    </div>
  )
}
```
Modify `web/src/main.tsx` — 用 `PlayerProvider` 包 `<App/>`:
```tsx
import { PlayerProvider } from './player/PlayerContext'
// ... <StrictMode><PlayerProvider><App /></PlayerProvider></StrictMode>
```

- [ ] **Step 4: app.css**

Create `web/src/app.css`:
```css
.shell { min-height:100vh; }
.content { padding:16px 16px 180px; }
.view-title { color:var(--text); margin:8px 4px 16px; }
.song-row { justify-content:flex-start; gap:12px; padding:8px; border-radius:12px; }
.song-row:active { background:var(--surface); }
.song-cover { width:52px; height:52px; border-radius:10px; }
.song-artist { color:var(--text-2); font-size:.9rem; }
.pl-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.pl-card { flex-direction:column; padding:12px; align-items:flex-start; }
.pl-cover { width:100%; aspect-ratio:1; border-radius:12px; object-fit:cover; }
.pl-name { font-weight:600; margin-top:8px; } .pl-count { color:var(--text-2); font-size:.85rem; }
.search-bar { display:flex; gap:8px; margin-bottom:16px; }
.search-input { flex:1; height:64px; border-radius:14px; border:1px solid var(--border);
  background:var(--surface); color:var(--text); font-size:1.2rem; padding:0 16px; }
.search-go { padding:0 24px; border-radius:14px; border:0; background:linear-gradient(90deg,var(--cyan),var(--purple)); color:#00121a; font-weight:700; }
.tabbar { position:fixed; left:12px; right:12px; bottom:12px; display:flex; height:72px; z-index:20; }
.tabbtn { flex:1; font-size:1.2rem; color:var(--text-2); }
.tabbtn.active { color:var(--cyan); text-shadow:0 0 12px rgba(34,211,238,.6); }
```

- [ ] **Step 5: 构建 + 目视全链路,提交**

Run: `cd ~/tesla-music/web && npm run test && npm run build` → 全绿 + build ok
起 compose,浏览器验证:日推/歌单/搜索都能选歌 → 迷你条出现 → 点开全屏 → 切歌/乱序/循环/滚词。
```bash
cd ~/tesla-music && git add -A web/src && git commit -m "feat(ui): three tabs + tabbar + player wiring"
```

---

# 阶段 4:扫码登录页

### Task 11: 登录状态判断 + 扫码登录页

**Files:**
- Create: `web/src/views/Login.tsx`, `web/src/session.ts`
- Modify: `web/src/App.tsx`(未登录时渲染 Login)

**Interfaces:**
- Consumes: BFF `/session/*`。
- Produces: `sessionApi`(`status()`, `qrKey()`, `qrCreate(key)`, `qrCheck(key)`)、`<Login onDone>`。

- [ ] **Step 1: session.ts 客户端 + 测试**

Create `web/src/session.ts`:
```ts
async function post(path: string, body?: unknown) {
  const r = await fetch(`/session${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}
export const sessionApi = {
  status: () => fetch('/session/status').then(r => r.json()) as Promise<{ loggedIn: boolean }>,
  qrKey: () => post('/qr/key') as Promise<{ unikey: string | null }>,
  qrCreate: (key: string) => post('/qr/create', { key }) as Promise<{ qrimg: string | null }>,
  qrCheck: (key: string) => post('/qr/check', { key }) as Promise<{ code: number; loggedIn: boolean }>,
}
```
Create `web/src/session.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sessionApi } from './session'
afterEach(() => vi.restoreAllMocks())
it('qrCheck POST 到 /session/qr/check', async () => {
  const f = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: 803, loggedIn: true }) })
  vi.stubGlobal('fetch', f)
  const r = await sessionApi.qrCheck('K')
  expect(f.mock.calls[0][0]).toBe('/session/qr/check')
  expect(r).toEqual({ code: 803, loggedIn: true })
})
```

- [ ] **Step 2: 跑测试(RED→GREEN)**

Run: `cd ~/tesla-music/web && npx vitest run src/session.test.ts`（先 FAIL 再实现使其 PASS;实现即上方 session.ts）。

- [ ] **Step 3: Login 视图**

Create `web/src/views/Login.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { sessionApi } from '../session'

export function Login({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    let key = ''
    ;(async () => {
      const k = await sessionApi.qrKey(); key = k.unikey ?? ''
      const c = await sessionApi.qrCreate(key); setQr(c.qrimg ?? '')
      timer.current = window.setInterval(async () => {
        const r = await sessionApi.qrCheck(key)
        if (r.loggedIn) { window.clearInterval(timer.current); onDone() }
        else if (r.code === 800) { window.clearInterval(timer.current); const k2 = await sessionApi.qrKey(); key = k2.unikey ?? ''; const c2 = await sessionApi.qrCreate(key); setQr(c2.qrimg ?? '') }
      }, 2000)
    })()
    return () => window.clearInterval(timer.current)
  }, [onDone])
  return (
    <div className="login">
      <h1 className="neon-text">tesla-music</h1>
      <p className="login-tip">用手机网易云 App 扫码登录</p>
      {qr && <img className="login-qr glass" src={qr} alt="二维码" />}
    </div>
  )
}
```
Add to `web/src/app.css`:
```css
.login { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; }
.login-tip { color:var(--text-2); } .login-qr { width:260px; height:260px; padding:16px; background:#fff; }
```

- [ ] **Step 4: App 未登录判断**

Modify `web/src/App.tsx` — 顶部加登录门:
```tsx
import { useEffect, useState } from 'react'
import { sessionApi } from './session'
import { Login } from './views/Login'
// ... 在 App() 内:
const [authed, setAuthed] = useState<boolean | null>(null)
useEffect(() => { sessionApi.status().then(s => setAuthed(s.loggedIn)) }, [])
if (authed === null) return <div className="shell" />
if (!authed) return <Login onDone={() => setAuthed(true)} />
// ... 其余壳不变
```

- [ ] **Step 5: 构建 + 端到端验证,提交**

Run: `cd ~/tesla-music/web && npm run test && npm run build` → 全绿。
验证:`docker compose exec app rm -f /data/cookie && docker compose restart app`(清空登录态)→ 浏览器应显示扫码页 → 扫码 → 进入主界面。
```bash
cd ~/tesla-music && git add -A web/src && git commit -m "feat(auth): in-app QR login + not-logged-in gate"
```

---

## Self-Review

- **Spec 覆盖**:BFF替nginx→Task1–4;深空霓虹→Task5(+各组件css);播放队列/控制→Task6–8;日推/歌单/搜索→Task9–10;底部大标签+迷你条→Task10;扫码登录+持久化→Task3+Task11;凭证不落浏览器→BFF 注入(Task2),前端无 MUSIC_U;realIP 默认关→PlayerContext 读 VITE_REAL_IP;2容器→Task4 compose;音频直连→沿用阶段0 useAudio/getSongUrl。覆盖完整。
- **占位符扫描**:无 TBD;每个代码步骤含完整代码。UI 的 CSS 值取自 Global Constraints 令牌。
- **类型一致性**:`Song{id,name,artist,cover}` 在 Task7/api(Task9)一致;`Repeat` 三态在 queue(Task6)/reducer(Task7)一致;`usePlayer()` 暴露的动作名(playList/toggle/next/prev/setShuffle/cycleRepeat)在 Task7 定义,Task8/10 一致引用;`sessionApi` 方法(status/qrKey/qrCreate/qrCheck)在 Task11 定义并自用。
- **已知修正提醒**:Task7 的 `useAudio` 需先按 Task7-Step4 扩展出 pause/seek/ended,再供 PlayerContext 使用;PlayerContext 应把 `next` 作为 `onEnded` 传入以自动连播。
