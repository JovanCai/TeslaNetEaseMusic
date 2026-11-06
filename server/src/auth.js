import { Router } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

// 可选访问密码:设置 APP_PASSWORD 后,/api 与 /session 需先通过密码。
// 凭证是由密码派生的 HMAC,存 HttpOnly cookie;改密码即全部失效。静态页面仍公开(要能显示输密码界面)。
const COOKIE = 'tm_auth'
const MAX_AGE_S = 365 * 24 * 3600
const MAX_FAILS = 10, LOCK_MS = 10 * 60 * 1000 // 同一来源连续输错 10 次锁 10 分钟
const GLOBAL_MAX_FAILS = 50                      // 所有来源合计 10 分钟内错 50 次,整体锁 10 分钟

export function tokenFor(password) {
  return createHmac('sha256', password).update('tm-auth-v1').digest('hex')
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function createAuth({ password, now = () => Date.now(), failDelayMs = 500 }) {
  const enabled = !!password
  const token = enabled ? tokenFor(password) : ''
  const fails = new Map() // ip → { count, until }
  // 全局兜底:来源 IP 来自请求头,端口直接暴露在公网时可被伪造,按 IP 限流会被绕过。
  // 所以不论来源,10 分钟内总共错 GLOBAL_MAX_FAILS 次就整体锁 10 分钟(代价:被攻击时你也得等锁定结束)。
  let globalFails = [] // 最近失败的时间戳
  let globalUntil = 0
  const ok = (req) => !enabled || safeEqual(readCookie(req, COOKIE) ?? '', token)

  const router = Router()
  router.get('/status', (req, res) => res.json({ required: enabled, ok: ok(req) }))
  router.post('/login', async (req, res) => {
    if (!enabled) return res.json({ ok: true })
    const ip = req.get('cf-connecting-ip') || req.ip
    let f = fails.get(ip)
    if (globalUntil > now() || (f && f.until > now())) return res.status(429).json({ ok: false, error: 'locked' })
    if (f?.until) f = undefined // 锁定期已过,重新计数
    if (safeEqual(req.body?.password ?? '', password)) {
      fails.delete(ip)
      const secure = req.secure || req.get('x-forwarded-proto') === 'https'
      res.set('Set-Cookie', `${COOKIE}=${token}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`)
      return res.json({ ok: true })
    }
    const count = (f?.count ?? 0) + 1
    if (fails.size > 10_000) fails.clear() // 伪造大量来源 IP 时防止内存无限增长(全局上限仍然生效)
    fails.set(ip, { count, until: count >= MAX_FAILS ? now() + LOCK_MS : 0 })
    globalFails = [...globalFails.filter((t) => t > now() - LOCK_MS), now()]
    if (globalFails.length >= GLOBAL_MAX_FAILS) { globalUntil = now() + LOCK_MS; globalFails = [] }
    if (failDelayMs) await new Promise((r) => setTimeout(r, failDelayMs)) // 拖慢暴力尝试
    res.status(401).json({ ok: false, error: 'password' })
  })

  const guard = (req, res, next) => (ok(req) ? next() : res.status(401).json({ error: 'auth' }))
  return { router, guard }
}
