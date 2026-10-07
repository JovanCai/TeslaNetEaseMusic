import express from 'express'
import { join } from 'node:path'
import { createCookieStore } from './cookieStore.js'
import { sessionRouter } from './session.js'
import { apiProxy } from './apiProxy.js'
import { createAuth } from './auth.js'

const PORT = Number(process.env.PORT || 80)
const NCM = process.env.NCM_BASE || 'http://ncm-api:3000'
const COOKIE_PATH = process.env.COOKIE_PATH || '/data/cookie'
const DIST = process.env.DIST_DIR || '/app/dist'
const REGION_UNLOCK = process.env.REGION_UNLOCK === 'true'

const store = createCookieStore(COOKIE_PATH)
if (!store.read() && process.env.NCM_MUSIC_U) store.write(process.env.NCM_MUSIC_U) // 首启可选 seed

const auth = createAuth({ password: process.env.APP_PASSWORD || '' })

const app = express()
app.set('trust proxy', true) // 经 Cloudflare 隧道时按 X-Forwarded-* 判断 https / 来源 IP
app.use(express.json())
app.use('/auth', auth.router)
app.use('/session', auth.guard, sessionRouter({ ncmBase: NCM, store }))
app.use('/api', auth.guard, apiProxy({ ncmBase: NCM, store, regionUnlock: REGION_UNLOCK }))
app.use(express.static(DIST))
app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')))
app.listen(PORT, () => console.log(`app listening on ${PORT}`))
