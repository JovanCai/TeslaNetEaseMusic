import { usePlayer } from './PlayerContext'
import { Icon } from '../components/Icon'
import './player.css'

export function QueueView({ onClose }: { onClose: () => void }) {
  const p = usePlayer()
  const start = Math.max(0, p.pos - 2)
  const list = p.queueSongs.slice(start, start + 200) // 显示当前附近 + 接下来 ~200 首,避免超长队列卡顿

  return (
    <>
      <div className="queue-mask" onClick={onClose} />
      <div className="queue-sheet glass">
        <div className="queue-head">
          <span className="queue-title">播放队列 · {p.queueSongs.length} 首</span>
          <button className="tap iconbtn" onClick={onClose} aria-label="关闭"><Icon name="chevronDown" size={22} /></button>
        </div>
        <div className="queue-list">
          {list.map((s, k) => {
            const idx = start + k
            return (
              <div key={idx} className={`queue-row tap ${idx === p.pos ? 'playing' : ''}`} onClick={() => p.jumpTo(idx)}>
                {s.cover && <img src={s.cover} className="queue-cover" alt="" loading="lazy" />}
                <div className="queue-meta">
                  <div className="queue-name">{s.name}</div>
                  <div className="queue-artist">{s.artist}</div>
                </div>
                <button className="tap queue-x" onClick={(e) => { e.stopPropagation(); p.removeAt(idx) }} aria-label="移除">✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
