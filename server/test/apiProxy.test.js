import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiProxy } from '../src/apiProxy.js'

afterEach(() => vi.restoreAllMocks())

function appWith(cookie, regionUnlock = false) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => ({
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ url, cookie: opts?.headers?.Cookie ?? null }),
  })))
  const app = express()
  app.use('/api', apiProxy({ ncmBase: 'http://ncm:3000', store: { read: () => cookie }, regionUnlock }))
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
    const res = await request(appWith(null)).get('/api/cloudsearch?keywords=x')
    expect(JSON.parse(res.text).cookie).toBeNull()
  })
  it('去掉会改变上游行为的危险参数(proxy/cookie/realIP 等),保留正常参数', async () => {
    const res = await request(appWith('U')).get('/api/cloudsearch?keywords=%E5%91%A8%20%E6%9D%B0&proxy=http://evil:8080&cookie=MUSIC_U%3Dx&realIP=1.2.3.4&randomCNIP=true&ua=x&limit=30')
    const url = new URL(JSON.parse(res.text).url)
    expect(url.pathname).toBe('/cloudsearch')
    expect([...url.searchParams.keys()]).toEqual(['keywords', 'limit'])
    expect(url.searchParams.get('keywords')).toBe('周 杰')
  })
  it('区域解锁时 realIP 只能由服务端设置,客户端传的被覆盖', async () => {
    const res = await request(appWith('U', true)).get('/api/song/url/v1?id=5&realIP=8.8.8.8')
    const url = new URL(JSON.parse(res.text).url)
    expect(url.searchParams.getAll('realIP')).toHaveLength(1)
    expect(url.searchParams.get('realIP')).not.toBe('8.8.8.8')
  })
  it('白名单外的接口返回 403,不转发', async () => {
    const app = appWith('U')
    const res = await request(app).get('/api/logout')
    expect(res.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
    expect((await request(app).get('/api/song/url/v1/../../logout')).status).toBe(403)
  })
  it('区域解锁开启时自动追加中国 realIP', async () => {
    const res = await request(appWith('U', true)).get('/api/song/url/v1?id=5')
    const url = JSON.parse(res.text).url
    expect(url).toMatch(/[?&]realIP=\d+\.\d+\.\d+\.\d+$/)
  })
  it('区域解锁关闭时不追加 realIP', async () => {
    const res = await request(appWith('U', false)).get('/api/song/url/v1?id=5')
    expect(JSON.parse(res.text).url).not.toMatch(/realIP=/)
  })
})
