import { useEffect, useRef, useState } from 'react'
import { diagnostic, diagnosticSnapshot, mediaFingerprint } from './diagnostics'

export function useAudio(onEnded?: (posMs: number, durMs: number) => void, onError?: (e: MediaError | null) => void, initialVolume = 1, onPlaybackStarted?: () => void, onPlayRejected?: (error: unknown) => void) {
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [bufferedMs, setBufferedMs] = useState(0) // 已缓冲到的位置(播放条上的浅色加载进度)
  const [stalled, setStalled] = useState(false)   // 缓冲中(buffer 见底、等数据),含起播/换流的加载态
  const [stallSeq, setStallSeq] = useState(0)     // "播放中断流"计数:只统计已放出声之后的 waiting(起播/换音质/seek 的蓄流不算),给弱网降档判断用
  const [volume, setVolumeState] = useState(initialVolume)
  const cb = useRef({ onEnded, onError, onPlaybackStarted, onPlayRejected })
  cb.current = { onEnded, onError, onPlaybackStarted, onPlayRejected }
  const resumeRef = useRef<{ ms: number; play: boolean } | null>(null) // reloadFrom 后待 seek 回的位置(ms)与是否自动播
  const playedOnceRef = useRef(false) // 当前流是否已真正放出过声;换流(load/reloadFrom/切歌)重置。起播蓄流的卡顿不算网络差

  // 两个元素乒乓:一个在播,另一个预载下一首。切歌时交换,直接用已缓冲的字节,不重新下载。
  const [pair] = useState<[HTMLAudioElement, HTMLAudioElement]>(() => {
    const a = new Audio(), b = new Audio()
    a.volume = b.volume = initialVolume
    return [a, b]
  })
  const activeIdxRef = useRef(0)
  const lastPlayedIdxRef = useRef<number | null>(null)
  const playRequestRef = useRef(0)
  const spareUrlRef = useRef('') // 备用元素当前预载的地址
  const [activeIdx, setActiveIdx] = useState(0) // 变化时同步新活动元素的进度与缓冲
  const cur = () => pair[activeIdxRef.current]
  const spare = () => pair[1 - activeIdxRef.current]
  const audioSnapshot = (a: HTMLAudioElement, index: number) => ({ element: index, active: index === activeIdxRef.current, source: mediaFingerprint(a.currentSrc || a.src), seconds: Number.isFinite(a.currentTime) ? Math.round(a.currentTime) : -1, duration: Number.isFinite(a.duration) ? Math.round(a.duration) : -1, paused: a.paused, ended: a.ended, ready: a.readyState, network: a.networkState, error: a.error?.code ?? 0 })
  useEffect(() => {
    const report = () => pair.forEach((a, index) => diagnostic('audio.snapshot', audioSnapshot(a, index)))
    window.addEventListener('tm-diagnostic-snapshot', report)
    document.addEventListener('visibilitychange', report)
    return () => { window.removeEventListener('tm-diagnostic-snapshot', report); document.removeEventListener('visibilitychange', report) }
  }, [pair])

  // 永久监听两个元素并过滤备用元素，交换后不依赖 React 重绑事件才能继续播放。
  useEffect(() => {
    const cleanups = pair.map((a, index) => {
      const readBuffered = () => setBufferedMs(a.buffered.length ? a.buffered.end(a.buffered.length - 1) * 1000 : 0)
      const onTime = () => { setCurrentMs(a.currentTime * 1000); readBuffered() }
      const onMeta = () => {
        setDurationMs((a.duration || 0) * 1000)
        const r = resumeRef.current
        if (r != null) { // reloadFrom:元数据就绪后 seek 回断点,按需续播
          resumeRef.current = null
          try { a.currentTime = r.ms / 1000 } catch { /* 忽略 */ }
          if (r.play) startPlayback().catch(() => {})
        }
      }
      const onProgress = () => readBuffered()
      // 只有"已放出声之后"再等数据才算网络扛不住当前码率;起播/换音质/seek 的蓄流不计入降档
      const onWaiting = () => { setStalled(true); if (playedOnceRef.current) setStallSeq((n) => n + 1) }
      const onPlaying = () => { setStalled(false); playedOnceRef.current = true; lastPlayedIdxRef.current = index; cb.current.onPlaybackStarted?.() }
      const onEnd = () => cb.current.onEnded?.(a.currentTime * 1000, a.duration * 1000) // 读实时位置,后台 timeupdate 被节流也准
      const onErr = () => cb.current.onError?.(a.error) // 播放/解码/网络失败:交给上层处理
      let lastTick = 0
      const handlers: Record<string, () => void> = { timeupdate: onTime, loadedmetadata: onMeta, progress: onProgress, waiting: onWaiting, stalled: onWaiting, playing: onPlaying, ended: onEnd, error: onErr, pause: () => {}, play: () => {}, canplay: () => {}, emptied: () => {} }
      const listeners = Object.entries(handlers).map(([event, handler]) => {
        const listener = () => {
          if (diagnosticSnapshot().enabled && event !== 'progress' && (event !== 'timeupdate' || Date.now() - lastTick >= 10000)) {
            if (event === 'timeupdate') lastTick = Date.now()
            diagnostic(`audio.${event}`, audioSnapshot(a, index))
          }
          if (index === activeIdxRef.current) handler()
        }
        a.addEventListener(event, listener)
        return () => a.removeEventListener(event, listener)
      })
      return () => {
        listeners.forEach((remove) => remove())
      }
    })
    return () => { ++playRequestRef.current; cleanups.forEach((remove) => remove()) }
  }, [pair])

  useEffect(() => {
    const a = pair[activeIdx]
    setCurrentMs(a.currentTime * 1000); setDurationMs((a.duration || 0) * 1000)
    setBufferedMs(a.buffered.length ? a.buffered.end(a.buffered.length - 1) * 1000 : 0)
  }, [pair, activeIdx])

  async function startPlayback(allowFallback = true): Promise<void> {
    const a = cur(), index = activeIdxRef.current, src = a.src
    const request = ++playRequestRef.current
    const isCurrent = () => request === playRequestRef.current && index === activeIdxRef.current && a.src === src
    if (diagnosticSnapshot().enabled) diagnostic('play.request', { request, ...audioSnapshot(a, index) })
    try {
      await a.play()
      diagnostic('play.resolved', { request, element: index, current: isCurrent() })
      if (isCurrent()) lastPlayedIdxRef.current = index
    } catch (error) {
      diagnostic('play.rejected', { request, element: index, current: isCurrent(), name: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown' })
      if (!isCurrent()) return // 已切歌或暂停，旧请求不能影响新的播放状态。
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      const previous = lastPlayedIdxRef.current
      // 若内核拒绝后台启用另一个音频元素，只回退一次，复用已成功播放过的元素。
      if (name === 'NotAllowedError' && allowFallback && previous != null && previous !== index) {
        diagnostic('play.fallback', { from: index, to: previous })
        a.pause()
        activeIdxRef.current = previous
        spareUrlRef.current = ''
        resumeRef.current = null
        playedOnceRef.current = false
        cur().src = src
        setCurrentMs(0); setBufferedMs(0); setStalled(true)
        setActiveIdx(previous)
        return startPlayback(false)
      }
      // AbortError 通常是切歌/暂停取消了 play，不表示需要用户重新授权。
      if (name !== 'AbortError') { setStalled(false); cb.current.onPlayRejected?.(error) }
    }
  }
  function load(url: string) { const a = cur(); if (a.src !== url) { ++playRequestRef.current; resumeRef.current = null; a.src = url; setBufferedMs(0); setCurrentMs(0); setStalled(false); playedOnceRef.current = false } }
  function play() { return startPlayback() }
  function pause() { ++playRequestRef.current; if (resumeRef.current) resumeRef.current.play = false; cur().pause() }
  function seek(ms: number) { cur().currentTime = ms / 1000 }
  function setVolume(v: number) { pair.forEach((a) => { a.volume = v }); setVolumeState(v) }
  function preload(url: string) { const s = spare(); if (spareUrlRef.current !== url) { s.preload = 'auto'; s.src = url; spareUrlRef.current = url } }
  // 断点重载:重新加载地址,元数据就绪后 seek 回 ms;play=false 时只加载不自动播(暂停中换音质用)
  function reloadFrom(url: string, ms: number, play = true) { ++playRequestRef.current; resumeRef.current = { ms, play }; playedOnceRef.current = false; const a = cur(); setStalled(true); a.src = url; a.load() }
  // 切到已预载的备用元素(已缓冲下一首)。备用地址不匹配则返回 false,让调用方走普通加载。
  function swapToPreloaded(url: string): boolean {
    diagnostic('audio.swap', { matched: spareUrlRef.current === url, from: activeIdxRef.current })
    if (spareUrlRef.current !== url) return false
    pause() // 停掉旧的活动元素
    activeIdxRef.current = 1 - activeIdxRef.current
    resumeRef.current = null
    playedOnceRef.current = false // 新活动流还没放出声,等它 playing 再允许计入卡顿
    cur().currentTime = 0
    spareUrlRef.current = '' // 旧活动元素成为新备用,清掉标记
    setActiveIdx(activeIdxRef.current)
    return true
  }
  return { load, play, pause, seek, setVolume, preload, swapToPreloaded, reloadFrom, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume }
}
