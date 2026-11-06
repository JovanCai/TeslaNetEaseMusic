import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlayerProvider } from './PlayerContext'
import { usePlayer } from './usePlayer'
import { getSongUrl } from '../api'

vi.mock('../api', () => ({
  getSongUrl: vi.fn(async (id: number, level: string) => ({ id, url: `https://audio.test/${id}-${level}.mp3` })),
  getLyric: vi.fn(async () => ({ lrc: '', tlyric: '', pureMusic: false })),
  getLoginStatus: vi.fn(async () => ({ loggedIn: false })),
  getLikedIds: vi.fn(async () => []), setLike: vi.fn(), getPersonalFm: vi.fn(), scrobble: vi.fn(), fmTrash: vi.fn(),
}))

const songs = [1, 2, 3].map(id => ({ id, name: `Song ${id}`, artist: 'Artist', cover: '', albumId: id, artistId: 1 }))
let player: ReturnType<typeof usePlayer>
function Controls() { player = usePlayer(); return null }
let audio: HTMLAudioElement
const fire = (type: string) => act(async () => { audio.dispatchEvent(new Event(type)) })

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tm.quality', 'exhigh')
  const nav = Object.create(navigator)
  Object.defineProperty(nav, 'onLine', { get: () => true })
  vi.stubGlobal('navigator', nav)
  vi.stubGlobal('Audio', function () {
    const a = document.createElement('audio')
    Object.defineProperty(a, 'duration', { value: 180 })
    a.play = vi.fn(async () => { a.dispatchEvent(new Event('loadedmetadata')); a.dispatchEvent(new Event('playing')) })
    a.pause = vi.fn()
    a.load = vi.fn()
    audio = a
    return a
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('同一首卡顿两次:开省流但不中途换当前曲的文件,下一首起用省流码率', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  expect(audio.src).toBe('https://audio.test/1-exhigh.mp3')
  const callsBefore = vi.mocked(getSongUrl).mock.calls.length
  await fire('waiting'); await fire('playing')
  await fire('waiting'); await fire('playing')
  expect(player.lowData).toBe(true)
  expect(vi.mocked(getSongUrl).mock.calls.length).toBe(callsBefore) // 没有为当前曲重新取地址
  expect(audio.src).toBe('https://audio.test/1-exhigh.mp3')         // 当前曲文件没换
  await act(async () => player.next())
  expect(audio.src).toBe('https://audio.test/2-standard.mp3')
})

it('stalled 事件和拖动进度引起的等待不触发省流', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  for (let i = 0; i < 3; i++) { await fire('stalled'); await fire('seeking'); await fire('waiting'); await fire('seeked'); await fire('playing') }
  expect(player.lowData).toBe(false)
})

it('取地址失败后不卡死:网络恢复自动重新加载这首', async () => {
  vi.mocked(getSongUrl).mockRejectedValueOnce(new Error('timeout'))
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 1))
  expect(audio.src).toBe('')
  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(audio.src).toBe('https://audio.test/2-exhigh.mp3')
  expect(audio.play).toHaveBeenCalled()
})

it('断网续播先换新地址(旧地址可能已过期),从断点继续', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 95, set: () => {} })
  vi.mocked(getSongUrl).mockResolvedValueOnce({ id: 1, url: 'https://audio.test/1-fresh.mp3' })
  await fire('error') // 网络类错误(jsdom 无 MediaError → 视为网络问题)
  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(audio.src).toBe('https://audio.test/1-fresh.mp3')
  expect(audio.load).toHaveBeenCalled()
})
