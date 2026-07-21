import express from 'express'
import { join } from 'node:path'
import { createCookieStore } from './cookieStore.js'
import { sessionRouter } from './session.js'
import { apiProxy } from './apiProxy.js'

const PORT = Number(process.env.PORT || 80)
const NCM = process.env.NCM_BASE || 'http://ncm-api:3000'
const COOKIE_PATH = process.env.COOKIE_PATH || '/data/cookie'
const DIST = process.env.DIST_DIR || '/app/dist'
const REGION_UNLOCK = process.env.REGION_UNLOCK === 'true'

const store = createCookieStore(COOKIE_PATH)
if (!store.read() && process.env.NCM_MUSIC_U) store.write(process.env.NCM_MUSIC_U) // 首启可选 seed

const app = express()
app.use(express.json())
app.use('/session', sessionRouter({ ncmBase: NCM, store }))
app.use('/api', apiProxy({ ncmBase: NCM, store, regionUnlock: REGION_UNLOCK }))
app.use(express.static(DIST))
app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')))
app.listen(PORT, () => console.log(`app listening on ${PORT}`))
