import { useEffect, useRef, useState } from 'react'

export function useAudio(onEnded?: () => void, onError?: (e: MediaError | null) => void, initialVolume = 1) {
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [bufferedMs, setBufferedMs] = useState(0) // 已缓冲到的位置(播放条上的浅色加载进度)
  const [stalled, setStalled] = useState(false)   // 缓冲中(buffer 见底、等数据),含起播/换流的加载态
  const [stallSeq, setStallSeq] = useState(0)     // "播放中断流"计数:只统计已放出声之后的 waiting(起播/换音质/seek 的蓄流不算),给弱网降档判断用
  const [volume, setVolumeState] = useState(initialVolume)
  const cb = useRef({ onEnded, onError })
  cb.current = { onEnded, onError }
  const resumeRef = useRef<{ ms: number; play: boolean } | null>(null) // reloadFrom 后待 seek 回的位置(ms)与是否自动播
  const playedOnceRef = useRef(false) // 当前流是否已真正放出过声;换流(load/reloadFrom/切歌)重置。起播蓄流的卡顿不算网络差

  // 两个元素乒乓:一个在播,另一个预载下一首。切歌时交换,直接用已缓冲的字节,不重新下载。
  const [pair] = useState<[HTMLAudioElement, HTMLAudioElement]>(() => {
    const a = new Audio(), b = new Audio()
    a.volume = b.volume = initialVolume
    return [a, b]
  })
  const activeIdxRef = useRef(0)
  const spareUrlRef = useRef('') // 备用元素当前预载的地址
  const [activeIdx, setActiveIdx] = useState(0) // 变化时把监听器重绑到新的活动元素
  const cur = () => pair[activeIdxRef.current]
  const spare = () => pair[1 - activeIdxRef.current]

  useEffect(() => {
    const a = pair[activeIdx]
    const readBuffered = () => setBufferedMs(a.buffered.length ? a.buffered.end(a.buffered.length - 1) * 1000 : 0)
    const onTime = () => { setCurrentMs(a.currentTime * 1000); readBuffered() }
    const onMeta = () => {
      setDurationMs((a.duration || 0) * 1000)
      const r = resumeRef.current
      if (r != null) { // reloadFrom:元数据就绪后 seek 回断点,按需续播
        resumeRef.current = null
        try { a.currentTime = r.ms / 1000 } catch { /* 忽略 */ }
        if (r.play) a.play().catch(() => {})
      }
    }
    const onProgress = () => readBuffered()
    // 只有"已放出声之后"再等数据才算网络扛不住当前码率;起播/换音质/seek 的蓄流不计入降档
    const onWaiting = () => { setStalled(true); if (playedOnceRef.current) setStallSeq((n) => n + 1) }
    const onPlaying = () => { setStalled(false); playedOnceRef.current = true }
    const onEnd = () => cb.current.onEnded?.()
    const onErr = () => cb.current.onError?.(a.error) // 播放/解码/网络失败:交给上层处理
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('progress', onProgress)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('stalled', onWaiting)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('ended', onEnd)
    a.addEventListener('error', onErr)
    setCurrentMs(a.currentTime * 1000); setDurationMs((a.duration || 0) * 1000); readBuffered() // 交换后立即同步
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('progress', onProgress)
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('stalled', onWaiting)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('error', onErr)
    }
  }, [pair, activeIdx])

  function load(url: string) { const a = cur(); if (a.src !== url) { a.src = url; setBufferedMs(0); setCurrentMs(0); setStalled(false); playedOnceRef.current = false } }
  function play() { return cur().play() }
  function pause() { cur().pause() }
  function seek(ms: number) { cur().currentTime = ms / 1000 }
  function setVolume(v: number) { pair.forEach((a) => { a.volume = v }); setVolumeState(v) }
  function preload(url: string) { const s = spare(); if (spareUrlRef.current !== url) { s.preload = 'auto'; s.src = url; spareUrlRef.current = url } }
  // 断点重载:重新加载地址,元数据就绪后 seek 回 ms;play=false 时只加载不自动播(暂停中换音质用)
  function reloadFrom(url: string, ms: number, play = true) { resumeRef.current = { ms, play }; playedOnceRef.current = false; const a = cur(); setStalled(true); a.src = url; a.load() }
  // 切到已预载的备用元素(已缓冲下一首)。备用地址不匹配则返回 false,让调用方走普通加载。
  function swapToPreloaded(url: string): boolean {
    if (spareUrlRef.current !== url) return false
    pause() // 停掉旧的活动元素
    activeIdxRef.current = 1 - activeIdxRef.current
    playedOnceRef.current = false // 新活动流还没放出声,等它 playing 再允许计入卡顿
    cur().currentTime = 0
    spareUrlRef.current = '' // 旧活动元素成为新备用,清掉标记
    setActiveIdx(activeIdxRef.current)
    return true
  }
  return { load, play, pause, seek, setVolume, preload, swapToPreloaded, reloadFrom, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume }
}
