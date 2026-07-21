import { useMemo } from 'react'
import { usePlayer } from './PlayerContext'
import { parseLrc, getCurrentLineIndex } from '../lyrics/parseLrc'
import { LyricsView } from '../lyrics/LyricsView'
import { Icon } from '../components/Icon'
import './player.css'

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer()
  const lines = useMemo(() => parseLrc(p.lrc), [p.lrc])
  const active = getCurrentLineIndex(lines, p.currentMs)
  if (!p.current) return null

  return (
    <div className="np">
      <button className="tap iconbtn np-close" onClick={onClose} aria-label="收起"><Icon name="chevronDown" /></button>
      {p.current.cover && <img className="np-cover" src={p.current.cover} alt="" />}
      <div className="np-title">{p.current.name}</div>
      <div className="np-artist">{p.current.artist}</div>

      <div className="np-lyrics">
        {p.pureMusic
          ? <div className="np-nolyric">纯音乐 · 请欣赏</div>
          : lines.length === 0
            ? <div className="np-nolyric">暂无歌词</div>
            : <LyricsView lines={lines} activeIndex={active} />}
      </div>

      <div className="np-progress">
        <span className="np-time">{fmt(p.currentMs)}</span>
        <input className="np-seek" type="range" min={0} max={Math.max(p.durationMs, 1)}
          value={Math.min(p.currentMs, p.durationMs)} onChange={(e) => p.seek(Number(e.target.value))} />
        <span className="np-time">{fmt(p.durationMs)}</span>
      </div>

      <div className="np-ctl">
        <button className={`tap iconbtn ${p.shuffle ? 'on' : ''}`} onClick={() => p.setShuffle(!p.shuffle)} aria-label="随机"><Icon name="shuffle" size={22} /></button>
        <button className="tap iconbtn" onClick={p.prev} aria-label="上一首"><Icon name="prev" size={30} /></button>
        <button className="tap iconbtn play-btn" onClick={p.toggle} aria-label="播放/暂停"><Icon name={p.isPlaying ? 'pause' : 'play'} size={34} /></button>
        <button className="tap iconbtn" onClick={p.next} aria-label="下一首"><Icon name="next" size={30} /></button>
        <button className={`tap iconbtn ${p.repeat !== 'off' ? 'on' : ''}`} onClick={p.cycleRepeat} aria-label="循环"><Icon name={p.repeat === 'one' ? 'repeatOne' : 'repeat'} size={22} /></button>
      </div>
    </div>
  )
}
