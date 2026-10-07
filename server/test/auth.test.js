import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAuth, tokenFor } from '../src/auth.js'

function makeApp(password, now = () => 0) {
  const auth = createAuth({ password, now, failDelayMs: 0 })
  const app = express()
  app.use(express.json())
  app.use('/auth', auth.router)
  app.get('/api/x', auth.guard, (req, res) => res.json({ ok: 1 }))
  return app
}

describe('auth', () => {
  it('未设密码:不拦截,status 报 required=false', async () => {
    const app = makeApp('')
    expect((await request(app).get('/api/x')).status).toBe(200)
    expect((await request(app).get('/auth/status')).body).toEqual({ required: false, ok: true })
  })
  it('设了密码:无 cookie 时 401', async () => {
    const app = makeApp('pw')
    expect((await request(app).get('/api/x')).status).toBe(401)
    expect((await request(app).get('/auth/status')).body).toEqual({ required: true, ok: false })
  })
  it('密码正确:下发 HttpOnly cookie,带上后放行', async () => {
    const app = makeApp('pw')
    const res = await request(app).post('/auth/login').send({ password: 'pw' })
    expect(res.status).toBe(200)
    const set = res.headers['set-cookie'][0]
    expect(set).toMatch(/HttpOnly/)
    expect(set).not.toMatch(/Secure/)
    const cookie = set.split(';')[0]
    expect((await request(app).get('/api/x').set('Cookie', cookie)).status).toBe(200)
  })
  it('经 https 代理时 cookie 带 Secure', async () => {
    const res = await request(makeApp('pw')).post('/auth/login').set('X-Forwarded-Proto', 'https').send({ password: 'pw' })
    expect(res.headers['set-cookie'][0]).toMatch(/Secure/)
  })
  it('密码错误 401;旧密码的 cookie 改密后失效', async () => {
    const app = makeApp('pw')
    expect((await request(app).post('/auth/login').send({ password: 'no' })).status).toBe(401)
    expect((await request(app).get('/api/x').set('Cookie', `tm_auth=${tokenFor('old')}`)).status).toBe(401)
  })
  it('连续输错 10 次锁定,锁定期内正确密码也拒绝,过期后恢复', async () => {
    let t = 0
    const app = makeApp('pw', () => t)
    for (let i = 0; i < 10; i++) await request(app).post('/auth/login').send({ password: 'no' })
    expect((await request(app).post('/auth/login').send({ password: 'pw' })).status).toBe(429)
    t = 11 * 60 * 1000
    expect((await request(app).post('/auth/login').send({ password: 'pw' })).status).toBe(200)
  })
})
