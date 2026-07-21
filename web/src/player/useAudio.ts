import { useEffect, useRef, useState } from 'react'

export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [currentMs, setCurrentMs] = useState(0)
  if (!ref.current) ref.current = new Audio()

  useEffect(() => {
    const a = ref.current!
    const onTime = () => setCurrentMs(a.currentTime * 1000)
    a.addEventListener('timeupdate', onTime)
    return () => a.removeEventListener('timeupdate', onTime)
  }, [])

  async function play(url: string) {
    const a = ref.current!
    a.src = url
    await a.play()
  }
  return { play, currentMs }
}
