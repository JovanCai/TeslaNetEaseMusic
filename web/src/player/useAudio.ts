import { useEffect, useState } from 'react'

export function useAudio(onEnded?: () => void, initialVolume = 1) {
  const [audio] = useState(() => { const a = new Audio(); a.volume = initialVolume; return a })
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [volume, setVolumeState] = useState(initialVolume)

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

  function load(url: string) { if (audio.src !== url) audio.src = url }
  function play() { return audio.play() }        // 播放当前 src
  function pause() { audio.pause() }
  function seek(ms: number) { audio.currentTime = ms / 1000 }
  function setVolume(v: number) { audio.volume = v; setVolumeState(v) }
  return { load, play, pause, seek, setVolume, currentMs, durationMs, volume }
}
