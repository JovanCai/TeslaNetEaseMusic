import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { securityHeaders, blockCrossSite } from '../src/security.js'

function makeApp() {
  const app = express()
  app.use(securityHeaders)
  app.use('/api', blockCrossSite)
  app.get('/api/like', (req, res) => res.json({ ok: 1 }))
  app.get('/', (req, res) => res.send('page'))
  return app
}

describe('security', () => {
  it('带上安全响应头', async () => {
    const res = await request(makeApp()).get('/')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'none'")
  })
  it('拒绝其他网站发起的接口请求,同源与无该头的请求放行', async () => {
    const app = makeApp()
    expect((await request(app).get('/api/like').set('Sec-Fetch-Site', 'cross-site')).status).toBe(403)
    expect((await request(app).get('/api/like').set('Sec-Fetch-Site', 'same-origin')).status).toBe(200)
    expect((await request(app).get('/api/like').set('Sec-Fetch-Site', 'none')).status).toBe(200) // 地址栏直接打开
    expect((await request(app).get('/api/like')).status).toBe(200)                               // 老浏览器 / curl
  })
  it('页面本身不受跨站限制(从别处点链接进来要能打开)', async () => {
    expect((await request(makeApp()).get('/').set('Sec-Fetch-Site', 'cross-site')).status).toBe(200)
  })
})
