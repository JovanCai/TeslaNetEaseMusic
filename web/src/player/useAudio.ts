import { useEffect, useRef, useState } from 'react'

export function useAudio(onEnded?: () => void, onError?: (e: MediaError | null) => void, initialVolume = 1) {
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [bufferedMs, setBufferedMs] = useState(0) // 已缓冲到的位置(播放条上的浅色加载进度)
  const [stalled, setStalled] = useState(false)   // 缓冲中(buffer 见底、等数据)
  const [volume, setVolumeState] = useState(initialVolume)
  const cb = useRef({ onEnded, onError })
  cb.current = { onEnded, onError }
  const resumeSeekRef = useRef<number | null>(null) // reloadFrom 后待 seek 回的位置(ms)

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
      if (resumeSeekRef.current != null) { // reloadFrom:元数据就绪后 seek 回断点续播
        try { a.currentTime = resumeSeekRef.current / 1000 } catch { /* 忽略 */ }
        resumeSeekRef.current = null
        a.play().catch(() => {})
      }
    }
    const onProgress = () => readBuffered()
    const onWaiting = () => setStalled(true)
    const onPlaying = () => setStalled(false)
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

  function load(url: string) { const a = cur(); if (a.src !== url) { a.src = url; setBufferedMs(0); setCurrentMs(0); setStalled(false) } }
  function play() { return cur().play() }
  function pause() { cur().pause() }
  function seek(ms: number) { cur().currentTime = ms / 1000 }
  function setVolume(v: number) { pair.forEach((a) => { a.volume = v }); setVolumeState(v) }
  function preload(url: string) { const s = spare(); if (spareUrlRef.current !== url) { s.preload = 'auto'; s.src = url; spareUrlRef.current = url } }
  // 断点重载:重新加载地址,元数据就绪后 seek 回 ms 续播(用于断网恢复)
  function reloadFrom(url: string, ms: number) { resumeSeekRef.current = ms; const a = cur(); setStalled(true); a.src = url; a.load() }
  // 切到已预载的备用元素(已缓冲下一首)。备用地址不匹配则返回 false,让调用方走普通加载。
  function swapToPreloaded(url: string): boolean {
    if (spareUrlRef.current !== url) return false
    pause() // 停掉旧的活动元素
    activeIdxRef.current = 1 - activeIdxRef.current
    cur().currentTime = 0
    spareUrlRef.current = '' // 旧活动元素成为新备用,清掉标记
    setActiveIdx(activeIdxRef.current)
    return true
  }
  return { load, play, pause, seek, setVolume, preload, swapToPreloaded, reloadFrom, currentMs, durationMs, bufferedMs, stalled, volume }
}
