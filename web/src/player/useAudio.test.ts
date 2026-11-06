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

it('keeps one element and its listeners through source changes', () => {
  const ended = vi.fn(), error = vi.fn()
  const { result } = renderHook(() => useAudio(ended, error))
  act(() => {
    result.current.load('https://audio.test/first.mp3')
    result.current.load('https://audio.test/next.mp3')
    elements[0].dispatchEvent(new Event('ended'))
    elements[0].dispatchEvent(new Event('error'))
  })
  expect(elements).toHaveLength(1)
  expect(ended).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledTimes(1)
})

it('does not retry or report an obsolete rejection after the user pauses', async () => {
  const rejected = vi.fn()
  const { result } = renderHook(() => useAudio(undefined, undefined, 1, undefined, rejected))
  await act(async () => { result.current.load('https://audio.test/1.mp3'); await result.current.play() })
  let reject!: (e: unknown) => void
  elements[0].play = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  let pending!: Promise<void>
  act(() => {
    result.current.load('https://audio.test/2.mp3')
    pending = result.current.play()
    result.current.pause()
  })
  await act(async () => { reject(new DOMException('', 'NotAllowedError')); await pending })
  expect(elements[0].src).toBe('https://audio.test/2.mp3')
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

it('只把「放出声后、非拖动引起的 waiting」算作卡顿;stalled 事件不算', () => {
  const { result } = renderHook(() => useAudio())
  const a = () => elements[0]
  act(() => result.current.load('https://audio.test/1.mp3'))
  act(() => a().dispatchEvent(new Event('waiting'))) // 起播蓄流:不算
  expect(result.current.stallSeq).toBe(0)
  act(() => a().dispatchEvent(new Event('playing')))
  act(() => a().dispatchEvent(new Event('stalled')))  // 只是暂时没在下载,声音照常:不算,也不显示缓冲中
  expect(result.current.stallSeq).toBe(0)
  expect(result.current.stalled).toBe(false)
  act(() => { a().dispatchEvent(new Event('seeking')); a().dispatchEvent(new Event('waiting')) }) // 拖进度:不算
  expect(result.current.stallSeq).toBe(0)
  act(() => { a().dispatchEvent(new Event('seeked')); a().dispatchEvent(new Event('waiting')) }) // 真卡顿
  expect(result.current.stallSeq).toBe(1)
  expect(result.current.stalled).toBe(true)
})

it('时间在走就清掉缓冲态(弱网下不一定再收到 playing)', () => {
  const { result } = renderHook(() => useAudio())
  const a = elements[0]
  Object.defineProperty(a, 'paused', { configurable: true, get: () => false })
  let t = 10
  Object.defineProperty(a, 'currentTime', { configurable: true, get: () => t, set: () => {} })
  act(() => { a.dispatchEvent(new Event('playing')); a.dispatchEvent(new Event('waiting')) })
  expect(result.current.stalled).toBe(true)
  act(() => a.dispatchEvent(new Event('timeupdate'))) // 第一次:记下时间
  t = 10.25
  act(() => a.dispatchEvent(new Event('timeupdate'))) // 时间前进了
  expect(result.current.stalled).toBe(false)
})

it('出错时把元素的实时位置交给上层;holdForSwitch 停掉旧歌并清零进度', () => {
  const error = vi.fn()
  const { result } = renderHook(() => useAudio(undefined, error))
  const a = elements[0]
  Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 42.5, set: () => {} })
  act(() => a.dispatchEvent(new Event('error')))
  expect(error.mock.calls[0][1]).toBe(42500) // 第二个参数是元素实时位置(jsdom 不实现 audio.error,第一个参数不比较)
  expect(result.current.positionMs()).toBe(42500)
  Object.defineProperty(a, 'paused', { configurable: true, get: () => false })
  act(() => result.current.holdForSwitch())
  expect(a.pause).toHaveBeenCalled()
  expect(result.current.currentMs).toBe(0)
})

it('preserves normalization across track changes, volume changes and stream reloads', () => {
  localStorage.removeItem('tm.normalize')
  const { result } = renderHook(() => useAudio(undefined, undefined, 0.8))
  act(() => result.current.load('https://audio.test/loud.mp3', { gain: -6.0206 }))
  expect(elements[0].volume).toBeCloseTo(0.4)
  expect(result.current.volume).toBe(0.8)
  act(() => result.current.load('https://audio.test/quiet.mp3', { gain: 0 }))
  expect(elements[0].volume).toBeCloseTo(0.8)
  act(() => result.current.setVolume(0.5))
  expect(elements[0].volume).toBeCloseTo(0.5)
  act(() => result.current.load('https://audio.test/loud.mp3', { gain: -6.0206 }))
  expect(elements[0].volume).toBeCloseTo(0.25)
  act(() => result.current.setNormalize(false))
  expect(elements[0].volume).toBe(0.5)
  expect(localStorage.getItem('tm.normalize')).toBe('0')
  act(() => result.current.setNormalize(true))
  expect(elements[0].volume).toBeCloseTo(0.25)
  act(() => result.current.reloadFrom('https://audio.test/loud.mp3', 3000))
  expect(elements[0].volume).toBeCloseTo(0.25)
  act(() => result.current.reloadFrom('https://audio.test/loud-hq.mp3', 3000, false, { gain: 0 }))
  expect(elements[0].volume).toBe(0.5)
  act(() => result.current.load('https://audio.test/no-data.mp3'))
  expect(elements[0].volume).toBe(0.5)
  expect(elements).toHaveLength(1)
})
