import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSongUrl, getLyric } from './api'

function mockFetch(json: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) })
}
afterEach(() => vi.restoreAllMocks())

describe('getSongUrl', () => {
  it('默认不带 realIP,解析 url', async () => {
    const f = mockFetch({ data: [{ url: 'http://x/a.mp3' }] })
    vi.stubGlobal('fetch', f)
    const r = await getSongUrl(123)
    expect(r).toEqual({ id: 123, url: 'http://x/a.mp3' })
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=123&level=exhigh')
  })
  it('提供 realIP 时附加参数', async () => {
    const f = mockFetch({ data: [{ url: null }] })
    vi.stubGlobal('fetch', f)
    await getSongUrl(9, '116.25.146.177')
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=9&level=exhigh&realIP=116.25.146.177')
  })
})

describe('getLyric', () => {
  it('解析 lrc 与 tlyric', async () => {
    vi.stubGlobal('fetch', mockFetch({ lrc: { lyric: 'L' }, tlyric: { lyric: 'T' } }))
    expect(await getLyric(5)).toEqual({ lrc: 'L', tlyric: 'T' })
  })
})
