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
