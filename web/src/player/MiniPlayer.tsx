import { usePlayer, usePlayerProgress } from './PlayerContext'
import { Icon } from '../components/Icon'
import './player.css'

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const p = usePlayer()
  const { currentMs, durationMs, bufferedMs, stalled, netInterrupted } = usePlayerProgress()
  if (!p.current) return null
  const cur = p.current
  const progress = durationMs > 0 ? (currentMs / durationMs) * 100 : 0
  const buffered = durationMs > 0 ? Math.min(100, (bufferedMs / durationMs) * 100) : 0
  return (
    <div className="mini glass">
      <div className="mini-buffer" style={{ width: `${buffered}%` }} />
      <div className="mini-bar" style={{ width: `${progress}%` }} />
      <div className="mini-info tap" onClick={onExpand}>
        {cur.cover && <img src={cur.cover} alt="" className="mini-cover" />}
        <div className="mini-meta">
          <div className="mini-name">{cur.name}</div>
          <div className="mini-artist" style={netInterrupted ? { color: '#ffb454' } : undefined}>{netInterrupted ? '网络中断,恢复后继续' : stalled ? '缓冲中…' : cur.artist}</div>
        </div>
      </div>
      <button className={`tap iconbtn ${p.isLiked(cur.id) ? 'liked' : ''}`} onClick={() => p.toggleLike(cur.id)} aria-label="红心">
        <Icon name={p.isLiked(cur.id) ? 'heartFilled' : 'heart'} size={24} />
      </button>
      <button className="tap iconbtn" onClick={p.prev} aria-label="上一首"><Icon name="prev" size={26} /></button>
      <button className="tap iconbtn mini-play" onClick={p.toggle} aria-label="播放/暂停"><Icon name={p.isPlaying ? 'pause' : 'play'} size={28} /></button>
      <button className="tap iconbtn" onClick={p.next} aria-label="下一首"><Icon name="next" size={26} /></button>
    </div>
  )
}
