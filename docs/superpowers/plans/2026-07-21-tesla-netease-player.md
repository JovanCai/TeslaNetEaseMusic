# 特斯拉网易云车机播放器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先交付一个可 `docker compose up` 一键部署的最小验证页——在真实特斯拉车机浏览器上,点一下就用你自己的网易云账号播放一首真歌,并显示逐行滚动歌词——用它一次性验证整条高风险管线。

**Architecture:** 三层同源:前端(Vite+React+TS 静态页)只调本地 `/api`;nginx 反代 `/api` 到网易云 API fork 容器,并在服务器端注入登录 cookie(车机浏览器不持有凭证);fork 容器负责与网易云官方 API 的加密/签名/登录。

**Tech Stack:** Vite + React + TypeScript + Vitest + @testing-library/react;后端 `moefurina/ncm-api`(`NeteaseCloudMusicApiEnhanced/api-enhanced`);nginx;Docker Compose。

## Global Constraints

- **不做音源替换**:后端必须设 `ENABLE_GENERAL_UNBLOCK=false`(fork 默认是 true,必须显式关掉)。
- **realIP 区域解锁可选、默认关闭**:仅当配置了 `VITE_REAL_IP` 时前端才附加 `&realIP=`,默认不附加。
- **凭证不落车机浏览器**:登录 cookie 由 nginx 在服务器端以 `Cookie` 请求头注入上游,前端代码与浏览器 URL 中**绝不出现** `MUSIC_U`。
- **单实例单账号**:一台部署对应一个网易云账号,cookie 存于 `.env`(阶段 0)。
- **端口**:后端容器 3000;对外统一走 nginx 80。
- **前端只调同源 `/api/*`**,不得直连网易云或跨域。
- 阶段 0 的 `DEMO_SONG_ID` 必须选一首**无需解锁即可正常播放**的歌(测管线,不测解锁)。

---

## File Structure(阶段 0)

```
tesla-music/
  docker-compose.yml            # ncm-api(fork) + nginx
  .env.example                  # NCM_MUSIC_U / ENABLE_GENERAL_UNBLOCK=false / DEMO_SONG_ID / VITE_REAL_IP
  nginx/
    default.conf.template       # / -> 静态; /api/ -> ncm-api:3000 + 注入 Cookie 头
  web/
    package.json  vite.config.ts  index.html
    src/
      main.tsx  App.tsx         # 验证页
      api.ts                    # getSongUrl / getLyric
      lyrics/parseLrc.ts        # LRC -> LyricLine[]; getCurrentLineIndex
      lyrics/parseLrc.test.ts
      lyrics/LyricsView.tsx     # 滚动歌词组件
      lyrics/LyricsView.test.tsx
      player/useAudio.ts        # <audio> 封装
      player/wakeLock.ts        # 屏幕常亮
```

---

### Task 1: 脚手架 web 应用(Vite + React + TS + Vitest)

**Files:**
- Create: `web/`(整个前端工程)
- Create: `web/vitest.config.ts`

**Interfaces:**
- Produces: 可 `npm run build` 与 `npm run test` 的前端工程骨架。

- [ ] **Step 1: 生成工程并安装依赖**

```bash
cd ~/tesla-music
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: 配置 Vitest(jsdom + setup)**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/setupTests.ts' },
})
```
Create `web/src/setupTests.ts`:
```ts
import '@testing-library/jest-dom'
```
Add to `web/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: 冒烟测试**

```bash
cd ~/tesla-music/web && npm run build && npm run test
```
Expected: build 成功产出 `dist/`;`vitest` 报告 "No test files found"(此时尚无测试,视为通过)。

- [ ] **Step 4: Commit**

```bash
cd ~/tesla-music && git add web && git commit -m "chore: scaffold web app (vite+react+ts+vitest)"
```

---

### Task 2: 起后端 fork + 扫码登录 + 验证播放URL/歌词(集成,提前排雷)

> 这是全项目最不确定的一环(fork 的 cookie/realIP 具体行为),放在最前面排雷。

**Files:**
- Create: `.env`(本地,不提交)、`.env.example`(提交)

**Interfaces:**
- Produces: 一个可用的 `MUSIC_U` cookie 值,写入 `.env` 的 `NCM_MUSIC_U`;确认 `DEMO_SONG_ID`。

- [ ] **Step 1: 起后端容器(显式关闭音源替换)**

```bash
docker run -d --name ncm-api -p 3000:3000 -e ENABLE_GENERAL_UNBLOCK=false moefurina/ncm-api:latest
curl -s "http://localhost:3000/" | head -c 200   # 确认服务起来
```

- [ ] **Step 2: 扫码登录拿 cookie**

```bash
TS=$(date +%s000)
KEY=$(curl -s "http://localhost:3000/login/qr/key?timestamp=$TS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['unikey'])")
# 生成二维码图片(base64 data URL),复制到浏览器地址栏打开,用手机网易云 App 扫码
curl -s "http://localhost:3000/login/qr/create?key=$KEY&qrimg=true&timestamp=$TS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['qrimg'])"
# 扫码后轮询,直到 code==803(成功),打印 cookie
curl -s "http://localhost:3000/login/qr/check?key=$KEY&timestamp=$(date +%s000)"
```
Expected: check 返回 `code:803` 且含 `cookie` 字段;从中提取 `MUSIC_U=xxxxx`。

- [ ] **Step 3: 用 cookie 验证真实播放 URL**

```bash
MUSIC_U="<粘贴上一步的 MUSIC_U 值>"
# 换成一首你 VIP 能正常播的歌 id
SONG=1824045033
curl -s "http://localhost:3000/song/url/v1?id=$SONG&level=exhigh" \
  --cookie "MUSIC_U=$MUSIC_U" | python3 -m json.tool
```
Expected: `data[0].url` 是一个非空的可播放地址(不是 null)。若为 null,换一首无版权限制的歌,或该歌需要 realIP(阶段 0 先避开)。

- [ ] **Step 4: 验证歌词接口**

```bash
curl -s "http://localhost:3000/lyric?id=$SONG" --cookie "MUSIC_U=$MUSIC_U" | python3 -c "import sys,json;print(json.load(sys.stdin)['lrc']['lyric'][:200])"
```
Expected: 打印出带 `[mm:ss.xx]` 时间戳的 LRC 文本。

- [ ] **Step 5: 记录结果到 `.env.example` 并 commit**

Create `.env.example`:
```dotenv
# 服务器端注入,前端/浏览器绝不可见
NCM_MUSIC_U=你的MUSIC_U值
# 音源替换必须关闭(不做跨平台解锁)
ENABLE_GENERAL_UNBLOCK=false
# 验证页要播放的歌(选一首无需解锁就能播的)
DEMO_SONG_ID=1824045033
# 可选:区域解锁用的国内 IP,留空=不解锁(默认)
VITE_REAL_IP=
```
```bash
cd ~/tesla-music && git add .env.example && echo ".env" >> .gitignore && git add .gitignore && git commit -m "chore: backend verified; env template"
```

---

### Task 3: LRC 解析与当前行定位(纯逻辑,TDD)

**Files:**
- Create: `web/src/lyrics/parseLrc.ts`
- Test: `web/src/lyrics/parseLrc.test.ts`

**Interfaces:**
- Produces:
  - `interface LyricLine { timeMs: number; text: string }`
  - `parseLrc(lrc: string): LyricLine[]`(按时间升序,忽略无时间戳/元数据行,支持一行多时间戳)
  - `getCurrentLineIndex(lines: LyricLine[], currentMs: number): number`(返回当前应高亮行下标,早于首行返回 -1)

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { parseLrc, getCurrentLineIndex } from './parseLrc'

describe('parseLrc', () => {
  it('解析基本时间戳', () => {
    expect(parseLrc('[00:01.00]hello\n[00:03.50]world')).toEqual([
      { timeMs: 1000, text: 'hello' },
      { timeMs: 3500, text: 'world' },
    ])
  })
  it('忽略元数据行与空行', () => {
    expect(parseLrc('[ti:Song]\n[ar:X]\n\n[00:02.00]a')).toEqual([{ timeMs: 2000, text: 'a' }])
  })
  it('一行多时间戳拆成多行并排序', () => {
    expect(parseLrc('[00:05.00][00:01.00]repeat')).toEqual([
      { timeMs: 1000, text: 'repeat' },
      { timeMs: 5000, text: 'repeat' },
    ])
  })
  it('支持两位毫秒', () => {
    expect(parseLrc('[01:02.5]x')).toEqual([{ timeMs: 62500, text: 'x' }])
  })
})

describe('getCurrentLineIndex', () => {
  const lines = [{ timeMs: 1000, text: 'a' }, { timeMs: 3000, text: 'b' }, { timeMs: 5000, text: 'c' }]
  it('早于首行返回 -1', () => expect(getCurrentLineIndex(lines, 0)).toBe(-1))
  it('区间内取上一行', () => expect(getCurrentLineIndex(lines, 3500)).toBe(1))
  it('正好命中', () => expect(getCurrentLineIndex(lines, 5000)).toBe(2))
  it('晚于末行取末行', () => expect(getCurrentLineIndex(lines, 9999)).toBe(2))
  it('空歌词返回 -1', () => expect(getCurrentLineIndex([], 100)).toBe(-1))
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/lyrics/parseLrc.test.ts`
Expected: FAIL(`parseLrc is not a function` 或找不到模块)。

- [ ] **Step 3: 实现**

```ts
export interface LyricLine { timeMs: number; text: string }

const TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return []
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(TIME_RE, '').trim()
    if (!text) continue
    let m: RegExpExecArray | null
    TIME_RE.lastIndex = 0
    while ((m = TIME_RE.exec(raw)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0
      out.push({ timeMs: min * 60000 + sec * 1000 + frac, text })
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}

export function getCurrentLineIndex(lines: LyricLine[], currentMs: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].timeMs <= currentMs) { ans = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return ans
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/tesla-music/web && npx vitest run src/lyrics/parseLrc.test.ts`
Expected: PASS(全部用例)。

- [ ] **Step 5: Commit**

```bash
cd ~/tesla-music && git add web/src/lyrics && git commit -m "feat: LRC parser + current-line lookup"
```

---

### Task 4: API 客户端封装(TDD,mock fetch)

**Files:**
- Create: `web/src/api.ts`
- Test: `web/src/api.test.ts`

**Interfaces:**
- Consumes: 同源 `/api/song/url/v1`、`/api/lyric`。
- Produces:
  - `getSongUrl(id: number, realIP?: string): Promise<{ id: number; url: string | null }>`
  - `getLyric(id: number): Promise<{ lrc: string; tlyric: string }>`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSongUrl, getLyric } from './api'

function mockFetch(json: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) })
}
afterEach(() => vi.restoreAllMocks())

describe('getSongUrl', () => {
  it('默认不带 realIP,解析 url', async () => {
    const f = mockFetch({ data: [{ url: 'http://x/a.mp3' }] })
    vi.stubGlobal('fetch', f)
    const r = await getSongUrl(123)
    expect(r).toEqual({ id: 123, url: 'http://x/a.mp3' })
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=123&level=exhigh')
  })
  it('提供 realIP 时附加参数', async () => {
    const f = mockFetch({ data: [{ url: null }] })
    vi.stubGlobal('fetch', f)
    await getSongUrl(9, '116.25.146.177')
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=9&level=exhigh&realIP=116.25.146.177')
  })
})

describe('getLyric', () => {
  it('解析 lrc 与 tlyric', async () => {
    vi.stubGlobal('fetch', mockFetch({ lrc: { lyric: 'L' }, tlyric: { lyric: 'T' } }))
    expect(await getLyric(5)).toEqual({ lrc: 'L', tlyric: 'T' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/api.test.ts`
Expected: FAIL(模块/函数未定义)。

- [ ] **Step 3: 实现**

```ts
const BASE = '/api'

export async function getSongUrl(id: number, realIP?: string): Promise<{ id: number; url: string | null }> {
  const p = new URLSearchParams({ id: String(id), level: 'exhigh' })
  if (realIP) p.set('realIP', realIP)
  const r = await fetch(`${BASE}/song/url/v1?${p}`)
  if (!r.ok) throw new Error(`song/url ${r.status}`)
  const j: any = await r.json()
  return { id, url: j?.data?.[0]?.url ?? null }
}

export async function getLyric(id: number): Promise<{ lrc: string; tlyric: string }> {
  const r = await fetch(`${BASE}/lyric?id=${id}`)
  if (!r.ok) throw new Error(`lyric ${r.status}`)
  const j: any = await r.json()
  return { lrc: j?.lrc?.lyric ?? '', tlyric: j?.tlyric?.lyric ?? '' }
}
```
注:`URLSearchParams` 序列化 `realIP` 值中的 `.` 不会被编码,断言里的字符串与实现一致。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/tesla-music/web && npx vitest run src/api.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/tesla-music && git add web/src/api.ts web/src/api.test.ts && git commit -m "feat: api client (song url + lyric)"
```

---

### Task 5: 滚动歌词组件 LyricsView(TDD,testing-library)

**Files:**
- Create: `web/src/lyrics/LyricsView.tsx`
- Test: `web/src/lyrics/LyricsView.test.tsx`

**Interfaces:**
- Consumes: `LyricLine`(Task 3)。
- Produces: `<LyricsView lines={LyricLine[]} activeIndex={number} />`;当前行元素带 `data-active="true"` 且 class 含 `active`。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LyricsView } from './LyricsView'

const lines = [{ timeMs: 0, text: 'l0' }, { timeMs: 1000, text: 'l1' }, { timeMs: 2000, text: 'l2' }]

describe('LyricsView', () => {
  it('渲染全部歌词行', () => {
    render(<LyricsView lines={lines} activeIndex={1} />)
    expect(screen.getByText('l0')).toBeInTheDocument()
    expect(screen.getByText('l2')).toBeInTheDocument()
  })
  it('仅当前行标记为 active', () => {
    render(<LyricsView lines={lines} activeIndex={1} />)
    expect(screen.getByText('l1').getAttribute('data-active')).toBe('true')
    expect(screen.getByText('l0').getAttribute('data-active')).toBe('false')
  })
  it('无歌词时显示占位', () => {
    render(<LyricsView lines={[]} activeIndex={-1} />)
    expect(screen.getByText('暂无歌词')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/tesla-music/web && npx vitest run src/lyrics/LyricsView.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

```tsx
import { useEffect, useRef } from 'react'
import type { LyricLine } from './parseLrc'

export function LyricsView({ lines, activeIndex }: { lines: LyricLine[]; activeIndex: number }) {
  const activeRef = useRef<HTMLparagraphElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  if (lines.length === 0) return <p className="lyrics-empty">暂无歌词</p>
  return (
    <div className="lyrics">
      {lines.map((l, i) => {
        const active = i === activeIndex
        return (
          <p
            key={i}
            ref={active ? activeRef : null}
            data-active={active}
            className={active ? 'line active' : 'line'}
          >
            {l.text}
          </p>
        )
      })}
    </div>
  )
}
```
注:`HTMLparagraphElement` 应写作 `HTMLParagraphElement`(实现时用正确大小写)。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/tesla-music/web && npx vitest run src/lyrics/LyricsView.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/tesla-music && git add web/src/lyrics/LyricsView.tsx web/src/lyrics/LyricsView.test.tsx && git commit -m "feat: scrolling lyrics view"
```

---

### Task 6: 验证页 App(音频 + 屏幕常亮 + 接线,运行时验证)

**Files:**
- Create: `web/src/player/useAudio.ts`、`web/src/player/wakeLock.ts`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `getSongUrl`/`getLyric`(Task 4)、`parseLrc`/`getCurrentLineIndex`(Task 3)、`LyricsView`(Task 5)。
- Produces: 一个"点击开始 → 播放 `DEMO_SONG_ID` → 歌词随进度滚动"的单页。

- [ ] **Step 1: 屏幕常亮 helper**

Create `web/src/player/wakeLock.ts`:
```ts
export async function requestWakeLock(): Promise<void> {
  try {
    // @ts-expect-error 实验性 API
    await navigator.wakeLock?.request('screen')
  } catch { /* 车机不支持则忽略 */ }
}
```

- [ ] **Step 2: 音频 hook**

Create `web/src/player/useAudio.ts`:
```ts
import { useEffect, useRef, useState } from 'react'

export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [currentMs, setCurrentMs] = useState(0)
  if (!ref.current) ref.current = new Audio()

  useEffect(() => {
    const a = ref.current!
    const onTime = () => setCurrentMs(a.currentTime * 1000)
    a.addEventListener('timeupdate', onTime)
    return () => a.removeEventListener('timeupdate', onTime)
  }, [])

  async function play(url: string) {
    const a = ref.current!
    a.src = url
    await a.play()
  }
  return { play, currentMs }
}
```

- [ ] **Step 3: App 接线**

Replace `web/src/App.tsx`:
```tsx
import { useMemo, useState } from 'react'
import { getSongUrl, getLyric } from './api'
import { parseLrc, getCurrentLineIndex } from './lyrics/parseLrc'
import { LyricsView } from './lyrics/LyricsView'
import { useAudio } from './player/useAudio'
import { requestWakeLock } from './player/wakeLock'
import './App.css'

const SONG_ID = Number(import.meta.env.VITE_DEMO_SONG_ID ?? 0)
const REAL_IP = import.meta.env.VITE_REAL_IP || undefined

export default function App() {
  const { play, currentMs } = useAudio()
  const [lrc, setLrc] = useState('')
  const [err, setErr] = useState('')
  const lines = useMemo(() => parseLrc(lrc), [lrc])
  const active = getCurrentLineIndex(lines, currentMs)

  async function start() {
    try {
      await requestWakeLock()
      const [song, lyric] = await Promise.all([getSongUrl(SONG_ID, REAL_IP), getLyric(SONG_ID)])
      if (!song.url) { setErr('无法获取播放地址(可能需要解锁)'); return }
      setLrc(lyric.lrc)
      await play(song.url)
    } catch (e) { setErr(String(e)) }
  }

  return (
    <main className="app">
      {!lrc && <button className="start" onClick={start}>开始播放</button>}
      {err && <p className="err">{err}</p>}
      <LyricsView lines={lines} activeIndex={active} />
    </main>
  )
}
```
Create `web/src/App.css`(车机大字高对比):
```css
.app { min-height: 100vh; background: #0a0a0a; color: #eee; display: flex; flex-direction: column; align-items: center; }
.start { font-size: 2.5rem; padding: 1.5rem 3rem; margin: 20vh 0; border-radius: 1rem; background: #c20c0c; color: #fff; border: 0; }
.lyrics { text-align: center; font-size: 1.8rem; line-height: 2.6; padding: 40vh 0; }
.line { opacity: .45; transition: opacity .3s; }
.line.active { opacity: 1; font-weight: 700; font-size: 2.2rem; color: #fff; }
.lyrics-empty, .err { font-size: 1.5rem; opacity: .7; margin-top: 30vh; }
```

- [ ] **Step 4: 本地对真实后端跑一遍**

在 `web/.env.local` 写 `VITE_DEMO_SONG_ID=<Task2 的 DEMO_SONG_ID>`;确保 Task 2 的 `ncm-api` 容器在跑;临时在 `vite.config.ts` 加 dev 代理:
```ts
server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true,
  headers: { Cookie: `MUSIC_U=${process.env.NCM_MUSIC_U ?? ''}` } } } }
```
Run: `cd ~/tesla-music/web && NCM_MUSIC_U=<你的值> npm run dev`,浏览器打开 → 点"开始播放"。
Expected: 出声,且歌词逐行滚动、当前行高亮。

- [ ] **Step 5: 全量测试 + build**

Run: `cd ~/tesla-music/web && npm run test && npm run build`
Expected: 测试全绿,build 出 `dist/`。

- [ ] **Step 6: Commit**

```bash
cd ~/tesla-music && git add web && git commit -m "feat: validation page (audio + wake lock + scrolling lyrics)"
```

---

### Task 7: 打包成一键部署(nginx + docker-compose)

**Files:**
- Create: `nginx/default.conf.template`、`docker-compose.yml`

**Interfaces:**
- Consumes: `web/dist`(Task 6 产物)、`.env`(Task 2)。
- Produces: `docker compose up` 后,`http://<host>/` 即验证页,cookie 由服务器端注入。

- [ ] **Step 1: nginx 模板(服务器端注入 Cookie)**

Create `nginx/default.conf.template`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location /api/ {
    proxy_set_header Cookie "MUSIC_U=${NCM_MUSIC_U}";
    proxy_pass http://ncm-api:3000/;
  }
  location / { try_files $uri /index.html; }
}
```
注:官方 nginx 镜像会对 `/etc/nginx/templates/*.template` 做 envsubst;`${NCM_MUSIC_U}` 从环境变量注入,前端与浏览器都看不到。

- [ ] **Step 2: docker-compose**

Create `docker-compose.yml`:
```yaml
services:
  ncm-api:
    image: moefurina/ncm-api:latest
    environment:
      - ENABLE_GENERAL_UNBLOCK=false
    restart: unless-stopped
  web:
    image: nginx:alpine
    depends_on: [ncm-api]
    ports: ["80:80"]
    environment:
      - NCM_MUSIC_U=${NCM_MUSIC_U}
    volumes:
      - ./web/dist:/usr/share/nginx/html:ro
      - ./nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro
    restart: unless-stopped
```

- [ ] **Step 3: 起来并验证同源播放**

```bash
cd ~/tesla-music && npm --prefix web run build && docker compose --env-file .env up -d
curl -s "http://localhost/api/song/url/v1?id=$(grep DEMO_SONG_ID .env | cut -d= -f2)&level=exhigh" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['url'])"
```
Expected: 打印出非空播放 URL(证明 nginx 已在服务器端注入 cookie、代理生效)。浏览器开 `http://localhost/` 点"开始播放"应出声+滚词。

- [ ] **Step 4: Commit**

```bash
cd ~/tesla-music && git add nginx docker-compose.yml && git commit -m "feat: one-command deploy (nginx + compose, server-side cookie)"
```

---

### Task 8: 真车验证(阶段 0 的门,手动)

> 这是决定阶段 1/2 是否照现设计推进的验收点。无代码,照单验证并记录结果。

**Files:**
- Create: `docs/superpowers/car-validation-2026-07-21.md`(记录结果)

- [ ] **Step 1: 让车机能访问到服务**

把服务跑在车机可达的地址(家里 LAN 内一台机 + 手机热点让特斯拉连同一网络,或临时用 `cloudflared`/`ngrok` 暴露一个 https 域名——车机浏览器对 https 更友好)。

- [ ] **Step 2: 在真车上逐项验证并记录**

在特斯拉浏览器打开该地址,点"开始播放",逐条记录:
- [ ] 页面能加载(网络通路 OK)
- [ ] 点击后**能出声**且走车载扬声器
- [ ] 自动播放是否需要那一次点击(记录行为)
- [ ] 歌词**逐行滚动**且高亮当前行
- [ ] "播放"时屏幕**是否保持常亮**、浏览器是否被系统切走
- [ ] 行驶中浏览器是否仍可用(安全前提下,副驾操作或低速验证)

- [ ] **Step 3: 写结论**

在 `car-validation-2026-07-21.md` 记录每项结果与异常;据此决定阶段 1 是否需要针对性调整(如自动播放策略、保活方案)。Commit。

```bash
cd ~/tesla-music && git add docs/superpowers/car-validation-2026-07-21.md && git commit -m "docs: real-car validation results (phase 0 gate)"
```

---

## 阶段 1 / 阶段 2 提纲(真车验证通过后各自展开为独立计划)

> 阶段 0 通过后,针对性把下列每组展开成独立的详细 TDD 计划。现在不写死,因为实现细节取决于 Task 8 的实测结论(自动播放/保活/浏览器可用性)。

**阶段 1 — v1 完整体**
- 扫码登录 UI + 服务器端 cookie **持久化到 Docker 数据卷**(替换阶段 0 的 `.env` cookie;相对 fork 的增量薄持久化层)
- 首页:我的歌单 / 每日推荐 / 搜索(唯一需车机键盘处)
- 完整播放器:播放/暂停/上一首/下一首/进度条/自动连播
- 车机 UI 打磨:大触控目标、高对比、行驶中零交互
- 完善 README + `.env.example` + 一键部署文档 + 开源许可证(建议 AGPL-3.0,防中心化商用)

**阶段 2 — 增强(可选)**
- 逐字 `yrc` 卡拉OK字级高亮(改用 `/lyric/new`)+ 翻译行
- 深色极简车机主题
- realIP 解锁的 UI 开关(仍默认关闭)
- 多用户隔离(如确有需要)

---

## Self-Review

- **Spec 覆盖**:自托管/一键部署 → Task 7;realIP 可选默认关 → Global Constraints + Task 4/6;不做音源替换 → `ENABLE_GENERAL_UNBLOCK=false`(Task 2/7);凭证不落浏览器 → Task 7 nginx 注入;滚动歌词 → Task 3/5/6;登录保持(cookie 服务器端) → 阶段 0 用 `.env`,阶段 1 升级为数据卷持久化;真车验证 → Task 8。覆盖完整。
- **占位符扫描**:无 TBD;所有代码步骤含完整代码。两处**已知拼写陷阱**已在正文显式标注(`HTMLParagraphElement` 大小写、`realIP` 编码),不是占位符而是提醒。
- **类型一致性**:`LyricLine{timeMs,text}` 在 Task 3 定义,Task 5/6 一致引用;`getSongUrl(id, realIP?)`、`getLyric(id)` 在 Task 4 定义,Task 6 一致调用;`getCurrentLineIndex` 命名前后一致。
