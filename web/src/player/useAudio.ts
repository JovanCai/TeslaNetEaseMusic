import { useEffect, useRef, useState } from 'react'
import { loadNormalization, normalizationFactor, type ReplayGain } from './normalization'
import { diagnostic, diagnosticSnapshot, mediaFingerprint } from './diagnostics'

export function useAudio(onEnded?: (posMs: number, durMs: number) => void, onError?: (e: MediaError | null) => void, initialVolume = 1, onPlaybackStarted?: () => void, onPlayRejected?: (error: unknown) => void) {
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

  // 持续复用同一个原生音频元素，保留车机媒体会话与用户授予的播放权限。
  const [audio] = useState(() => {
    const a = new Audio()
    a.volume = initialVolume
    a.preload = 'auto'
    return a
  })
  const playRequestRef = useRef(0)
  const audioSnapshot = () => ({ element: 0, active: true, source: mediaFingerprint(audio.currentSrc || audio.src), seconds: Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : -1, duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : -1, paused: audio.paused, ended: audio.ended, ready: audio.readyState, network: audio.networkState, error: audio.error?.code ?? 0 })
  useEffect(() => {
    const report = () => diagnostic('audio.snapshot', audioSnapshot())
    window.addEventListener('tm-diagnostic-snapshot', report)
    document.addEventListener('visibilitychange', report)
    return () => { window.removeEventListener('tm-diagnostic-snapshot', report); document.removeEventListener('visibilitychange', report) }
  }, [audio])

  // 监听始终绑定在同一个元素上。
  useEffect(() => {
    const a = audio
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
    const onPlaying = () => { setStalled(false); playedOnceRef.current = true; cb.current.onPlaybackStarted?.() }
    const onEnd = () => cb.current.onEnded?.(a.currentTime * 1000, a.duration * 1000) // 读实时位置,后台 timeupdate 被节流也准
    const onErr = () => cb.current.onError?.(a.error) // 播放/解码/网络失败:交给上层处理
    let lastTick = 0
    const handlers: Record<string, () => void> = { timeupdate: onTime, loadedmetadata: onMeta, progress: onProgress, waiting: onWaiting, stalled: onWaiting, playing: onPlaying, ended: onEnd, error: onErr, pause: () => {}, play: () => {}, canplay: () => {}, emptied: () => {} }
    const listeners = Object.entries(handlers).map(([event, handler]) => {
      const listener = () => {
        if (diagnosticSnapshot().enabled && event !== 'progress' && (event !== 'timeupdate' || Date.now() - lastTick >= 10000)) {
          if (event === 'timeupdate') lastTick = Date.now()
          diagnostic(`audio.${event}`, audioSnapshot())
        }
        handler()
      }
      a.addEventListener(event, listener)
      return () => a.removeEventListener(event, listener)
    })
    return () => {
      ++playRequestRef.current
      listeners.forEach((remove) => remove())
      a.pause()
    }
  }, [audio])

  async function startPlayback(): Promise<void> {
    const a = audio, src = a.src
    const request = ++playRequestRef.current
    const isCurrent = () => request === playRequestRef.current && a.src === src
    if (diagnosticSnapshot().enabled) diagnostic('play.request', { request, ...audioSnapshot() })
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
  }
  function load(url: string, gain?: ReplayGain) { factor.current = normalizationFactor(gain); applyVolumes(); const a = audio; if (a.src !== url) { ++playRequestRef.current; resumeRef.current = null; a.src = url; setBufferedMs(0); setCurrentMs(0); setDurationMs(0); setStalled(false); playedOnceRef.current = false } }
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
  function reloadFrom(url: string, ms: number, play = true, gain?: ReplayGain) { if (gain) { factor.current = normalizationFactor(gain); applyVolumes() } ++playRequestRef.current; resumeRef.current = { ms, play }; playedOnceRef.current = false; const a = audio; setStalled(true); a.src = url; a.load() }
  return { normalize, setNormalize, load, play, pause, seek, setVolume, reloadFrom, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume }
}
