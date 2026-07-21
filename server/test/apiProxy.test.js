import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiProxy } from '../src/apiProxy.js'

afterEach(() => vi.restoreAllMocks())

function appWith(cookie) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => ({
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ url, cookie: opts?.headers?.Cookie ?? null }),
  })))
  const app = express()
  app.use('/api', apiProxy({ ncmBase: 'http://ncm:3000', store: { read: () => cookie } }))
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
})
