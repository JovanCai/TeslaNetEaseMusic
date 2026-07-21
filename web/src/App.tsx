import { useMemo, useState } from 'react'
import { getSongUrl, getLyric } from './api'
import { parseLrc, getCurrentLineIndex } from './lyrics/parseLrc'
import { LyricsView } from './lyrics/LyricsView'
import { useAudio } from './player/useAudio'
import { requestWakeLock } from './player/wakeLock'
import './App.css'

const SONG_ID = Number(import.meta.env.VITE_DEMO_SONG_ID ?? 0)
const REAL_IP = import.meta.env.VITE_REAL_IP || undefined

export default function App() {
  const { play, currentMs } = useAudio()
  const [lrc, setLrc] = useState('')
  const [err, setErr] = useState('')
  const lines = useMemo(() => parseLrc(lrc), [lrc])
  const active = getCurrentLineIndex(lines, currentMs)

  async function start() {
    try {
      await requestWakeLock()
      const [song, lyric] = await Promise.all([getSongUrl(SONG_ID, REAL_IP), getLyric(SONG_ID)])
      if (!song.url) { setErr('无法获取播放地址(可能需要解锁)'); return }
      setLrc(lyric.lrc)
      await play(song.url)
    } catch (e) { setErr(String(e)) }
  }

  return (
    <main className="app">
      {!lrc && <button className="start" onClick={start}>开始播放</button>}
      {err && <p className="err">{err}</p>}
      <LyricsView lines={lines} activeIndex={active} />
    </main>
  )
}
