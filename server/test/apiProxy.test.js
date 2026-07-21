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
    const res = await request(appWith(null)).get('/api/search?keywords=x')
    expect(JSON.parse(res.text).cookie).toBeNull()
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
