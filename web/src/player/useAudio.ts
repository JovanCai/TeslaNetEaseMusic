import { useCallback, useEffect, useRef, useState } from 'react'
import { loadNormalization, normalizationFactor, type ReplayGain } from './normalization'
import { diagnostic, diagnosticSnapshot, mediaFingerprint } from './diagnostics'

// 当前位置之后还缓冲了多少秒(弱网诊断最关键的一个数)
const bufferedAhead = (a: HTMLAudioElement) => {
  for (let i = 0; i < a.buffered.length; i++) if (a.buffered.start(i) <= a.currentTime && a.currentTime <= a.buffered.end(i)) return Math.round((a.buffered.end(i) - a.currentTime) * 10) / 10
  return 0
}
export const audioSnapshot = (audio: HTMLAudioElement) => ({ element: 0, active: true, source: mediaFingerprint(audio.currentSrc || audio.src), ms: Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 1000) : -1, duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : -1, ahead: bufferedAhead(audio), paused: audio.paused, ended: audio.ended, ready: audio.readyState, network: audio.networkState, error: audio.error?.code ?? 0 })

export function useAudio(onEnded?: (posMs: number, durMs: number) => void, onError?: (e: MediaError | null, posMs: number) => void, initialVolume = 1, onPlaybackStarted?: () => void, onPlayRejected?: (error: unknown) => void) {
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [bufferedMs, setBufferedMs] = useState(0) // 已缓冲到的位置(播放条上的浅色加载进度)
  const [stalled, setStalled] = useState(false)   // 缓冲中(buffer 见底、等数据),含起播/换流的加载态
  const [stallSeq, setStallSeq] = useState(0)     // "播放中断流"计数:只统计已放出声之后的 waiting(起播/换音质/seek 的蓄流不算),给弱网降档判断用
  const [volume, setVolumeState] = useState(initialVolume)
  const [normalize, setNormalizeState] = useState(loadNormalization)
  const normalizeRef = useRef(normalize)
  const volumeRef = useRef(initialVolume)
  const factor = useRef(1)
  const cb = useRef({ onEnded, onError, onPlaybackStarted, onPlayRejected })
  cb.current = { onEnded, onError, onPlaybackStarted, onPlayRejected }
  const resumeRef = useRef<{ ms: number; play: boolean } | null>(null) // reloadFrom 后待 seek 回的位置(ms)与是否自动播
  const playedOnceRef = useRef(false) // 当前流是否已真正放出过声;换流(load/reloadFrom/切歌)重置。起播蓄流的卡顿不算网络差
  const seekingRef = useRef(false)    // 正在跳转进度:这期间的等数据是跳转引起的,不算网络差

  // 持续复用同一个原生音频元素，保留车机媒体会话与用户授予的播放权限。
  const [audio] = useState(() => {
    const a = new Audio()
    a.volume = initialVolume
    a.preload = 'auto'
    return a
  })
  const playRequestRef = useRef(0)
  useEffect(() => {
    const report = () => diagnostic('audio.snapshot', audioSnapshot(audio))
    window.addEventListener('tm-diagnostic-snapshot', report)
    document.addEventListener('visibilitychange', report)
    return () => { window.removeEventListener('tm-diagnostic-snapshot', report); document.removeEventListener('visibilitychange', report) }
  }, [audio])

  const startPlayback = useCallback(async (): Promise<void> => {
    const a = audio, src = a.src
    const request = ++playRequestRef.current
    const isCurrent = () => request === playRequestRef.current && a.src === src
    if (diagnosticSnapshot().recording) diagnostic('play.request', { request, ...audioSnapshot(a) })
    try {
      await a.play()
      diagnostic('play.resolved', { request, element: 0, current: isCurrent() })
    } catch (error) {
      diagnostic('play.rejected', { request, element: 0, current: isCurrent(), name: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown' })
      if (!isCurrent()) return // 已切歌或暂停，旧请求不能影响新的播放状态。
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      // AbortError 通常是切歌/暂停取消了 play，不表示需要用户重新授权。
      if (name !== 'AbortError') { setStalled(false); cb.current.onPlayRejected?.(error) }
    }
  }, [audio])

  // 监听始终绑定在同一个元素上。
  useEffect(() => {
    const a = audio
    const playRequests = playRequestRef // 清理时作废进行中的 play 请求(计数器,不是 DOM 引用)
    const readBuffered = () => setBufferedMs(a.buffered.length ? a.buffered.end(a.buffered.length - 1) * 1000 : 0)
    let lastTime = -1
    const onTime = () => {
      setCurrentMs(a.currentTime * 1000); readBuffered()
      // 时间在走 = 声音在放:清掉缓冲态(不只靠 playing 事件,弱网下它不一定再触发)
      if (!a.paused && a.currentTime !== lastTime) setStalled(false)
      lastTime = a.currentTime
    }
    const onMeta = () => {
      setDurationMs((a.duration || 0) * 1000)
      const r = resumeRef.current
      if (r != null) { // reloadFrom:元数据就绪后 seek 回断点,按需续播
        resumeRef.current = null
        try { a.currentTime = r.ms / 1000 } catch { /* 忽略 */ }
        diagnostic('reload.seek', { requested: Math.round(r.ms), actual: Math.round(a.currentTime * 1000) })
        if (r.play) startPlayback().catch(() => {})
      }
    }
    const onProgress = () => readBuffered()
    // 只有"已放出声之后"、且不是拖动进度引起的等数据,才算网络扛不住当前码率。
    // 注意不监听 stalled 事件:它只表示"暂时没在下载",缓冲区里有数据时声音照常在放,弱网下会频繁误报。
    const onWaiting = () => { setStalled(true); if (playedOnceRef.current && !seekingRef.current) setStallSeq((n) => n + 1) }
    const onPlaying = () => { setStalled(false); playedOnceRef.current = true; cb.current.onPlaybackStarted?.() }
    const onSeeking = () => { seekingRef.current = true }
    const onSeeked = () => { seekingRef.current = false; diagnostic('audio.seek-result', { actual: Math.round(a.currentTime * 1000) }) }
    const onEnd = () => cb.current.onEnded?.(a.currentTime * 1000, a.duration * 1000) // 读实时位置,后台 timeupdate 被节流也准
    const onErr = () => cb.current.onError?.(a.error, a.currentTime * 1000) // 播放/解码/网络失败:交给上层处理(带实时位置)
    let lastTick = 0
    const handlers: Record<string, () => void> = { timeupdate: onTime, loadedmetadata: onMeta, progress: onProgress, waiting: onWaiting, stalled: () => {}, playing: onPlaying, seeking: onSeeking, seeked: onSeeked, ended: onEnd, error: onErr, pause: () => {}, play: () => {}, canplay: () => {}, emptied: () => {} }
    const listeners = Object.entries(handlers).map(([event, handler]) => {
      const listener = () => {
        if (diagnosticSnapshot().recording && event !== 'progress' && (event !== 'timeupdate' || Date.now() - lastTick >= 10000)) {
          if (event === 'timeupdate') lastTick = Date.now()
          diagnostic(`audio.${event}`, audioSnapshot(a))
        }
        handler()
      }
      a.addEventListener(event, listener)
      return () => a.removeEventListener(event, listener)
    })
    return () => {
      ++playRequests.current
      listeners.forEach((remove) => remove())
      a.pause()
    }
  }, [audio, startPlayback])
  function load(url: string, gain?: ReplayGain) { factor.current = normalizationFactor(gain); applyVolumes(); const a = audio; if (a.src !== url) { ++playRequestRef.current; resumeRef.current = null; a.src = url; setBufferedMs(0); setCurrentMs(0); setDurationMs(0); setStalled(false); playedOnceRef.current = false; seekingRef.current = false } }
  function play() { return startPlayback() }
  function pause() { ++playRequestRef.current; if (resumeRef.current) resumeRef.current.play = false; audio.pause() }
  function seek(ms: number) { audio.currentTime = ms / 1000 }
  function applyVolumes() { audio.volume = volumeRef.current * (normalizeRef.current ? factor.current : 1) }
  function setVolume(v: number) { volumeRef.current = Math.max(0, Math.min(1, v)); applyVolumes(); setVolumeState(volumeRef.current) }
  function setNormalize(value: boolean) {
    normalizeRef.current = value; setNormalizeState(value); applyVolumes()
    try { localStorage.setItem('tm.normalize', value ? '1' : '0') } catch { /* session-only */ }
    diagnostic('volume.normalization', { enabled: value, factor: factor.current })
  }
  // 断点重载:重新加载地址,元数据就绪后 seek 回 ms;play=false 时只加载不自动播(暂停中换音质用)
  function reloadFrom(url: string, ms: number, play = true, gain?: ReplayGain) { if (gain) { factor.current = normalizationFactor(gain); applyVolumes() } ++playRequestRef.current; resumeRef.current = { ms, play }; playedOnceRef.current = false; seekingRef.current = false; const a = audio; setStalled(true); a.src = url; a.load() }
  // 切歌但新地址还没拿到:先停掉旧歌并清零进度。否则弱网下旧歌会继续放,新歌的歌词却按旧歌的时间滚动。
  function holdForSwitch() { ++playRequestRef.current; resumeRef.current = null; if (!audio.paused) audio.pause(); setCurrentMs(0); setDurationMs(0); setBufferedMs(0); setStalled(true) }
  // 元素的实时位置。后台时 timeupdate 被节流,React 里的 currentMs 可能落后好几秒,断点/换档要用这个
  function positionMs() { return Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0 }
  return { normalize, setNormalize, load, play, pause, seek, setVolume, reloadFrom, holdForSwitch, positionMs, element: audio, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume }
}
