import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSongUrl, getLyric, getDailySongs, search, getUserPlaylists } from './api'

function mockFetch(json: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) })
}
afterEach(() => vi.restoreAllMocks())

describe('getSongUrl', () => {
  it('默认不带 realIP,解析 url', async () => {
    const f = mockFetch({ data: [{ url: 'http://x/a.mp3' }] })
    vi.stubGlobal('fetch', f)
    const r = await getSongUrl(123)
    expect(r).toEqual({ id: 123, url: 'https://x/a.mp3' })
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=123&level=exhigh')
  })
  it('提供 realIP 时附加参数', async () => {
    const f = mockFetch({ data: [{ url: null }] })
    vi.stubGlobal('fetch', f)
    await getSongUrl(9, '116.25.146.177')
    expect(f.mock.calls[0][0]).toBe('/api/song/url/v1?id=9&level=exhigh&realIP=116.25.146.177')
  })
  it('把 http 播放地址升级为 https(防车机混合内容拦截)', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: [{ url: 'http://m8.music.126.net/x.mp3' }] }))
    expect((await getSongUrl(1)).url).toBe('https://m8.music.126.net/x.mp3')
  })
  it('url 为 null 时保持 null', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: [{ url: null }] }))
    expect((await getSongUrl(1)).url).toBeNull()
  })
})

describe('getLyric', () => {
  it('解析 lrc 与 tlyric', async () => {
    vi.stubGlobal('fetch', mockFetch({ lrc: { lyric: 'L' }, tlyric: { lyric: 'T' } }))
    expect(await getLyric(5)).toEqual({ lrc: 'L', tlyric: 'T', pureMusic: false })
  })
  it('标记纯音乐', async () => {
    vi.stubGlobal('fetch', mockFetch({ pureMusic: true, lrc: { lyric: '[00:05.00]纯音乐，请欣赏' } }))
    expect((await getLyric(5)).pureMusic).toBe(true)
  })
})

describe('getDailySongs', () => {
  it('归一化 dailySongs', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { dailySongs: [
      { id: 7, name: 'S', ar: [{ name: 'A' }], al: { picUrl: 'p' } }] } }))
    expect(await getDailySongs()).toEqual([{ id: 7, name: 'S', artist: 'A', cover: 'p' }])
  })
})
describe('search', () => {
  it('归一化 result.songs', async () => {
    vi.stubGlobal('fetch', mockFetch({ result: { songs: [
      { id: 9, name: 'T', ar: [{ name: 'B' }], al: { picUrl: 'q' } }] } }))
    const r = await search('x'); expect(r[0]).toEqual({ id: 9, name: 'T', artist: 'B', cover: 'q' })
  })
})
describe('getUserPlaylists', () => {
  it('映射歌单概要', async () => {
    vi.stubGlobal('fetch', mockFetch({ playlist: [{ id: 1, name: 'PL', coverImgUrl: 'c', trackCount: 5 }] }))
    expect(await getUserPlaylists(42)).toEqual([{ id: 1, name: 'PL', cover: 'c', count: 5 }])
  })
})
