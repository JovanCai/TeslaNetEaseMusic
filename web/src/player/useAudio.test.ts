import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAudio } from './useAudio'

let elements: HTMLAudioElement[]
beforeEach(() => {
  elements = []
  vi.stubGlobal('Audio', function () {
    const a = document.createElement('audio')
    a.play = vi.fn().mockResolvedValue(undefined)
    a.pause = vi.fn()
    a.load = vi.fn()
    elements.push(a)
    return a
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('handles ended immediately after swapping, without waiting for React to rebind listeners', () => {
  const ended = vi.fn(), error = vi.fn()
  const { result } = renderHook(() => useAudio(ended, error))
  act(() => {
    result.current.preload('https://audio.test/next.mp3')
    expect(result.current.swapToPreloaded('https://audio.test/next.mp3')).toBe(true)
    // React has not committed the new active index yet.
    elements[1].dispatchEvent(new Event('ended'))
    expect(ended).toHaveBeenCalledTimes(1)
    elements[0].dispatchEvent(new Event('ended'))
    elements[0].dispatchEvent(new Event('error'))
    expect(ended).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })
})

it('does not retry or report an obsolete rejection after the user pauses', async () => {
  const rejected = vi.fn()
  const { result } = renderHook(() => useAudio(undefined, undefined, 1, undefined, rejected))
  await act(async () => { result.current.load('https://audio.test/1.mp3'); await result.current.play() })
  let reject!: (e: unknown) => void
  elements[1].play = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  let pending!: Promise<void>
  act(() => {
    result.current.preload('https://audio.test/2.mp3')
    result.current.swapToPreloaded('https://audio.test/2.mp3')
    pending = result.current.play()
    result.current.pause()
  })
  await act(async () => { reject(new DOMException('', 'NotAllowedError')); await pending })
  expect(elements[0].src).toBe('https://audio.test/1.mp3')
  expect(elements[0].play).toHaveBeenCalledTimes(1)
  expect(rejected).not.toHaveBeenCalled()
})

it('does not stop a new source when the previous source rejects late', async () => {
  const rejected = vi.fn()
  const { result } = renderHook(() => useAudio(undefined, undefined, 1, undefined, rejected))
  let reject!: (e: unknown) => void
  vi.mocked(elements[0].play).mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  let pending!: Promise<void>
  act(() => { result.current.load('https://audio.test/1.mp3'); pending = result.current.play() })
  await act(async () => { result.current.load('https://audio.test/2.mp3'); await result.current.play() })
  await act(async () => { reject(new DOMException('', 'NotAllowedError')); await pending })
  expect(elements[0].src).toBe('https://audio.test/2.mp3')
  expect(rejected).not.toHaveBeenCalled()
})

it('ignores cancellation errors without treating them as autoplay denial', async () => {
  const rejected = vi.fn()
  const { result } = renderHook(() => useAudio(undefined, undefined, 1, undefined, rejected))
  elements[0].play = vi.fn().mockRejectedValue(new DOMException('', 'AbortError'))
  await act(async () => { result.current.load('https://audio.test/1.mp3'); await result.current.play() })
  expect(rejected).not.toHaveBeenCalled()
})
