import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createArtworkPublisher } from './mediaArtwork'
let images: HTMLImageElement[]
let media: { metadata: MediaMetadata | null }
const song = (id: number) => ({ id, name: `Song ${id}`, artist: 'Artist', cover: `http://cover.test/${id}.jpg?existing=1&param=128y128` })
beforeEach(() => {
  vi.useFakeTimers()
  images = []
  media = { metadata: null }
  vi.stubGlobal('navigator', { mediaSession: media })
  vi.stubGlobal('MediaMetadata', class { constructor(data: MediaMetadataInit) { Object.assign(this, data) } })
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img')
    Object.defineProperties(image, { naturalWidth: { value: 512 }, naturalHeight: { value: 512 } })
    images.push(image)
    return image
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('clears old artwork, waits for image success and retries once', () => {
  const publisher = createArtworkPublisher(song(1))
  publisher.sync()
  expect(media.metadata?.title).toBe('Song 1 · Artist')
  expect(media.metadata?.artwork).toEqual([])
  expect(images[0].src).toBe('https://cover.test/1.jpg?existing=1&param=512y512')
  publisher.sync() // playing before the image is ready
  expect(images).toHaveLength(1)
  images[0].dispatchEvent(new Event('load'))
  expect((media.metadata as MediaMetadata | null)?.artwork[0].src).toBe(images[0].src)
  media.metadata = null
  vi.advanceTimersByTime(1000)
  expect((media.metadata as MediaMetadata | null)?.artwork[0].src).toBe(images[0].src)
  expect(vi.getTimerCount()).toBe(0)
  publisher.dispose()
})
it('falls back to the original image when the resized image fails', () => {
  const publisher = createArtworkPublisher(song(1))
  publisher.sync()
  images[0].dispatchEvent(new Event('error'))
  expect(images[1].src).toBe('https://cover.test/1.jpg?existing=1&param=128y128')
  images[1].dispatchEvent(new Event('load'))
  expect((media.metadata as MediaMetadata | null)?.artwork[0].src).toBe(images[1].src)
  publisher.dispose()
})
it('ignores late image callbacks and cancels retries after a track change', () => {
  const old = createArtworkPublisher(song(1))
  old.sync()
  const lateLoad = images[0].onload!
  old.dispose()
  const next = createArtworkPublisher(song(2))
  next.sync()
  lateLoad.call(images[0], new Event('load'))
  expect(media.metadata?.title).toBe('Song 2 · Artist')
  expect(media.metadata?.artwork).toEqual([])
  images[1].dispatchEvent(new Event('load'))
  next.dispose()
  media.metadata = null
  vi.advanceTimersByTime(10000)
  expect(media.metadata).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('bounds stalled image requests and leaves no stale artwork on failure', () => {
  const publisher = createArtworkPublisher(song(1))
  publisher.sync()
  vi.advanceTimersByTime(16000)
  expect(images).toHaveLength(2)
  expect(media.metadata?.artwork).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
  publisher.dispose()
})
