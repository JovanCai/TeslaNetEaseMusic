import { useEffect, useState } from 'react'

export function useAudio(onEnded?: () => void) {
  const [audio] = useState(() => new Audio())
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [volume, setVolumeState] = useState(1)

  useEffect(() => {
    const onTime = () => setCurrentMs(audio.currentTime * 1000)
    const onMeta = () => setDurationMs((audio.duration || 0) * 1000)
    const onEnd = () => onEnded?.()
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [audio, onEnded])

  async function play(url: string) {
    if (audio.src !== url) audio.src = url
    await audio.play()
  }
  function pause() { audio.pause() }
  function resume() { audio.play().catch(() => {}) }
  function seek(ms: number) { audio.currentTime = ms / 1000 }
  function setVolume(v: number) { audio.volume = v; setVolumeState(v) }
  return { play, pause, resume, seek, setVolume, currentMs, durationMs, volume }
}
