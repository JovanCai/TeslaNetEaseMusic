import { useMemo } from 'react'
import { usePlayer } from './PlayerContext'
import { parseLrc, getCurrentLineIndex } from '../lyrics/parseLrc'
import { LyricsView } from '../lyrics/LyricsView'
import './player.css'

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer()
  const lines = useMemo(() => parseLrc(p.lrc), [p.lrc])
  const active = getCurrentLineIndex(lines, p.currentMs)
  if (!p.current) return null
  const repeatIcon = p.repeat === 'one' ? '🔂' : p.repeat === 'all' ? '🔁' : '↩'
  return (
    <div className="np">
      <button className="tap np-close" onClick={onClose}>▾</button>
      <div className="np-title neon-text">{p.current.name} — {p.current.artist}</div>
      <div className="np-lyrics"><LyricsView lines={lines} activeIndex={active} /></div>
      <div className="np-progress">
        <span className="np-time">{fmt(p.currentMs)}</span>
        <input className="np-seek" type="range" min={0} max={Math.max(p.durationMs, 1)} value={Math.min(p.currentMs, p.durationMs)}
          onChange={(e) => p.seek(Number(e.target.value))} />
        <span className="np-time">{fmt(p.durationMs)}</span>
      </div>
      <div className="np-ctl">
        <button className={`tap ctl ${p.shuffle ? 'on' : ''}`} onClick={() => p.setShuffle(!p.shuffle)}>🔀</button>
        <button className="tap ctl" onClick={p.prev}>⏮</button>
        <button className="tap ctl big" onClick={p.toggle}>{p.isPlaying ? '⏸' : '▶'}</button>
        <button className="tap ctl" onClick={p.next}>⏭</button>
        <button className="tap ctl" onClick={p.cycleRepeat}>{repeatIcon}</button>
      </div>
    </div>
  )
}
