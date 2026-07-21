import { useEffect, useState } from 'react'

export function useAudio() {
  const [audio] = useState(() => new Audio())
  const [currentMs, setCurrentMs] = useState(0)

  useEffect(() => {
    const onTime = () => setCurrentMs(audio.currentTime * 1000)
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [audio])

  async function play(url: string) {
    audio.src = url
    await audio.play()
  }
  return { play, currentMs }
}
