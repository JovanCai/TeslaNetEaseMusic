import { useEffect, useRef, useState } from 'react'
import type { Song } from '../api'
import { usePlayer } from '../player/PlayerContext'

const ROW = 72       // 每行固定高度(px)
const OVERSCAN = 6   // 视口上下多渲染几行,滚动更顺

/** 虚拟化歌曲列表:只渲染可见行,几千首也不卡;整张列表都在队列里(随机/播放全部覆盖全部)。 */
export function SongList({ songs }: { songs: Song[] }) {
  const p = usePlayer()
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: Math.min(songs.length, 24) })

  useEffect(() => {
    const compute = () => {
      const el = ref.current
      if (!el) return
      const listTop = el.getBoundingClientRect().top + window.scrollY
      const start = Math.max(0, Math.floor((window.scrollY - listTop) / ROW) - OVERSCAN)
      const count = Math.ceil(window.innerHeight / ROW) + OVERSCAN * 2
      setRange({ start, end: Math.min(songs.length, start + count) })
    }
    compute()
    window.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => { window.removeEventListener('scroll', compute); window.removeEventListener('resize', compute) }
  }, [songs.length])

  const rows = []
  for (let i = range.start; i < range.end; i++) {
    const s = songs[i]
    rows.push(
      <div key={i} className="song-row tap" style={{ position: 'absolute', top: i * ROW, left: 0, right: 0, height: ROW }}
        onClick={() => p.playList(songs, i)}>
        {s.cover && <img src={s.cover} className="song-cover" alt="" loading="lazy" />}
        <div className="song-meta">
          <div className="song-name">{s.name}</div>
          <div className="song-artist">{s.artist}</div>
        </div>
      </div>,
    )
  }

  return (
    <div ref={ref} className="song-list" style={{ position: 'relative', height: songs.length * ROW }}>
      {rows}
    </div>
  )
}
