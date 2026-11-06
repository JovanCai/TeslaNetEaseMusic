import express from 'express'
import { join } from 'node:path'
import { createCookieStore } from './cookieStore.js'
import { sessionRouter } from './session.js'
import { apiProxy } from './apiProxy.js'
import { createAuth } from './auth.js'
import { diagRouter } from './diag.js'
import { securityHeaders, blockCrossSite } from './security.js'

const PORT = Number(process.env.PORT || 80)
const NCM = process.env.NCM_BASE || 'http://ncm-api:3000'
const COOKIE_PATH = process.env.COOKIE_PATH || '/data/cookie'
const DIST = process.env.DIST_DIR || '/app/dist'
const REGION_UNLOCK = process.env.REGION_UNLOCK === 'true'
const DIAG_DIR = process.env.DIAG_DIR || '/diagnostics' // docker-compose 挂到宿主机项目目录下的 diagnostics/

const store = createCookieStore(COOKIE_PATH)
if (!store.read() && process.env.NCM_MUSIC_U) store.write(process.env.NCM_MUSIC_U) // 首启可选 seed

const auth = createAuth({ password: process.env.APP_PASSWORD || '' })

const app = express()
app.disable('x-powered-by')
// 只信任本机与内网地址转发来的 X-Forwarded-*(Cloudflare 隧道容器在 Docker 内网里)。
// 原来是 true(信任任何来源),端口直接暴露在公网时客户端可伪造来源 IP / https。
app.set('trust proxy', 'loopback, linklocal, uniquelocal')
app.use(securityHeaders)
// 接口一律拒绝其他网站发起的请求(防 CSRF);静态页面不受影响
for (const prefix of ['/diag', '/auth', '/session', '/api']) app.use(prefix, blockCrossSite)
// 诊断上传放在全局 json 之前:日志可达 2MB,超过全局 json 的 100kb 上限
app.use('/diag', auth.guard, diagRouter({ dir: DIAG_DIR }))
app.use(express.json())
app.use('/auth', auth.router)
app.use('/session', auth.guard, sessionRouter({ ncmBase: NCM, store }))
app.use('/api', auth.guard, apiProxy({ ncmBase: NCM, store, regionUnlock: REGION_UNLOCK }))
app.use(express.static(DIST))
app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')))
app.listen(PORT, () => console.log(`app listening on ${PORT}`))
