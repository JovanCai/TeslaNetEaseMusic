import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlayerProvider, usePlayer } from './PlayerContext'
import { getSongUrl } from '../api'

vi.mock('../api', () => ({
  getSongUrl: vi.fn(async (id: number) => ({ id, url: `https://audio.test/${id}.mp3` })),
  getLyric: vi.fn(async () => ({ lrc: '', tlyric: '', pureMusic: false })),
  getLoginStatus: vi.fn(async () => ({ loggedIn: false })),
  getLikedIds: vi.fn(async () => []), setLike: vi.fn(), getPersonalFm: vi.fn(),
}))

const songs = [1, 2, 3].map(id => ({ id, name: `Song ${id}`, artist: 'Artist', cover: `https://cover.test/${id}.jpg`, albumId: id, artistId: 1 }))
let player: ReturnType<typeof usePlayer>
function Controls() { player = usePlayer(); return null }
let elements: HTMLAudioElement[]
let starts: Array<{ src: string; cover: string | undefined }>
let media: { metadata: MediaMetadata | null; playbackState: string; setActionHandler: ReturnType<typeof vi.fn>; setPositionState: ReturnType<typeof vi.fn> }

beforeEach(() => {
  localStorage.clear()
  elements = []; starts = []
  media = { metadata: null, playbackState: 'none', setActionHandler: vi.fn(), setPositionState: vi.fn() }
  vi.stubGlobal('MediaMetadata', class { constructor(data: MediaMetadataInit) { Object.assign(this, data) } })
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaSession: media }))
  vi.stubGlobal('Audio', function () {
    const a = document.createElement('audio')
    Object.defineProperty(a, 'duration', { value: 180 })
    a.play = vi.fn(async () => {
      starts.push({ src: a.src, cover: media.metadata?.artwork[0]?.src })
      a.dispatchEvent(new Event('playing'))
    })
    a.pause = vi.fn()
    elements.push(a)
    return a
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks() })

it('advances on ended with stale background progress', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  await act(async () => {
    elements[0].currentTime = 6
    elements[0].dispatchEvent(new Event('timeupdate'))
  })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  // No further timeupdate or timer ticks: only the media element knows the real end time.
  elements[0].currentTime = 180
  await act(async () => {
    elements[0].dispatchEvent(new Event('ended'))
  })
  expect(starts.at(-1)?.src).toBe('https://audio.test/2.mp3')
  expect(starts.at(-1)?.cover).toContain('/2.jpg')
})

it('does not leave the player marked playing when background play is rejected', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  await act(async () => {
    elements[0].currentTime = 6
    elements[0].dispatchEvent(new Event('timeupdate'))
  })
  elements[1].play = vi.fn().mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
  elements[0].play = vi.fn().mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await act(async () => player.next())
  expect(player.current?.id).toBe(2)
  expect(player.isPlaying).toBe(false)
  expect(media.playbackState).toBe('paused')
})

it('reuses the previously playing element when the preloaded element is blocked', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  await act(async () => {
    elements[0].currentTime = 6
    elements[0].dispatchEvent(new Event('timeupdate'))
  })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  elements[1].play = vi.fn().mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
  elements[0].currentTime = 180
  await act(async () => elements[0].dispatchEvent(new Event('ended')))
  expect(elements[1].play).toHaveBeenCalledTimes(1)
  expect(elements[0].src).toBe('https://audio.test/2.mp3')
  expect(starts.at(-1)?.cover).toContain('/2.jpg')
  expect(player.current?.id).toBe(2)
  expect(player.isPlaying).toBe(true)
})

it('publishes the new cover before normal and preloaded playback, then republishes on playing', async () => {
  render(<PlayerProvider><Controls /></PlayerProvider>)
  await act(async () => player.playList(songs, 0))
  expect(starts.at(-1)?.cover).toContain('/1.jpg')

  // Let the production preload path fetch and buffer song 2.
  await act(async () => {
    elements[0].currentTime = 6
    elements[0].dispatchEvent(new Event('timeupdate'))
  })
  expect(elements[1].src).toBe('https://audio.test/2.mp3')
  const callsForSecond = () => vi.mocked(getSongUrl).mock.calls.filter(([id]) => id === 2).length
  const callsBefore = callsForSecond()
  await act(async () => player.next())
  expect(callsForSecond()).toBe(callsBefore)
  expect(starts.at(-1)).toEqual({ src: 'https://audio.test/2.mp3', cover: 'https://cover.test/2.jpg?param=128y128' })

  media.metadata = null
  await act(async () => elements[0].dispatchEvent(new Event('playing')))
  expect(media.metadata).toBeNull() // inactive element cannot republish
  await act(async () => elements[1].dispatchEvent(new Event('playing')))
  expect((media.metadata as MediaMetadata | null)?.artwork[0].src).toContain('/2.jpg')

  await act(async () => player.prev()) // previous song is not preloaded: ordinary URL load
  expect(starts.at(-1)?.cover).toContain('/1.jpg')
})
