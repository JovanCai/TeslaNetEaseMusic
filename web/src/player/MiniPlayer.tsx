import { usePlayer } from './PlayerContext'
import { Icon } from '../components/Icon'
import './player.css'

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const p = usePlayer()
  if (!p.current) return null
  const progress = p.durationMs > 0 ? (p.currentMs / p.durationMs) * 100 : 0
  return (
    <div className="mini glass">
      <div className="mini-bar" style={{ width: `${progress}%` }} />
      <div className="mini-info tap" onClick={onExpand}>
        {p.current.cover && <img src={p.current.cover} alt="" className="mini-cover" />}
        <div className="mini-meta">
          <div className="mini-name">{p.current.name}</div>
          <div className="mini-artist">{p.current.artist}</div>
        </div>
      </div>
      <button className="tap iconbtn" onClick={p.prev} aria-label="上一首"><Icon name="prev" size={26} /></button>
      <button className="tap iconbtn" onClick={p.toggle} aria-label="播放/暂停"><Icon name={p.isPlaying ? 'pause' : 'play'} size={28} /></button>
      <button className="tap iconbtn" onClick={p.next} aria-label="下一首"><Icon name="next" size={26} /></button>
    </div>
  )
}
