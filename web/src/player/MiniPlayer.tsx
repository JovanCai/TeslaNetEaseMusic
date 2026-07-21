import { usePlayer } from './PlayerContext'
import './player.css'

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const p = usePlayer()
  if (!p.current) return null
  return (
    <div className="mini glass">
      <div className="mini-info tap" onClick={onExpand}>
        {p.current.cover && <img src={p.current.cover} alt="" className="mini-cover" />}
        <div className="mini-meta">
          <div className="mini-name">{p.current.name}</div>
          <div className="mini-artist">{p.current.artist}</div>
        </div>
      </div>
      <button className="tap ctl" onClick={p.toggle}>{p.isPlaying ? '⏸' : '▶'}</button>
      <button className="tap ctl" onClick={p.next}>⏭</button>
    </div>
  )
}
