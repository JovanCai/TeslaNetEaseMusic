import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from './PlayerContext'
import { parseLrc, getCurrentLineIndex } from '../lyrics/parseLrc'
import { LyricsView } from '../lyrics/LyricsView'
import { QueueView } from './QueueView'
import { QualityPicker } from '../components/QualityPicker'
import { Icon } from '../components/Icon'
import './player.css'

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function NowPlaying({ open, onClose, onOpenAlbum, onOpenArtist }: {
  open: boolean; onClose: () => void
  onOpenAlbum: (albumId: number) => void
  onOpenArtist: (artistId: number) => void
}) {
  const p = usePlayer()
  const npRef = useRef<HTMLDivElement>(null)
  const flipFirst = useRef<Map<string, DOMRect> | null>(null)
  const [showQueue, setShowQueue] = useState(false)
  const [showTrans, setShowTrans] = useState(() => {
    try { return localStorage.getItem('tm.showtrans') !== '0' } catch { return true }
  })
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('tm.nplayout') || 'center' } catch { return 'center' }
  })
  function toggleTrans() {
    const v = !showTrans
    setShowTrans(v)
    try { localStorage.setItem('tm.showtrans', v ? '1' : '0') } catch { /* 忽略 */ }
  }
  function toggleLayout() {
    // FLIP:先记下三块当前位置,切换后从旧位置飞到新位置
    const root = npRef.current
    if (root) {
      const first = new Map<string, DOMRect>()
      root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => first.set(el.dataset.flip!, el.getBoundingClientRect()))
      flipFirst.current = first
    }
    const v = layout === 'split' ? 'center' : 'split'
    setLayout(v)
    try { localStorage.setItem('tm.nplayout', v) } catch { /* 忽略 */ }
  }

  useLayoutEffect(() => {
    const first = flipFirst.current
    const root = npRef.current
    if (!first || !root) return
    flipFirst.current = null
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return // 晕动敏感:直接切,不做飞行动画
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'))
    els.forEach((el) => {
      const f = first.get(el.dataset.flip!)
      if (!f) return
      const l = el.getBoundingClientRect()
      const dx = f.left - l.left, dy = f.top - l.top
      const sx = l.width ? f.width / l.width : 1, sy = l.height ? f.height / l.height : 1
      el.style.transition = 'none'
      el.style.transformOrigin = 'top left'
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    })
    void root.offsetWidth // 强制回流,让上面的初始变换生效
    requestAnimationFrame(() => {
      els.forEach((el) => {
        el.style.transition = 'transform .5s cubic-bezier(.2,.85,.25,1)'
        el.style.transform = ''
      })
      const clear = () => els.forEach((el) => { el.style.transition = ''; el.style.transformOrigin = '' })
      window.setTimeout(clear, 560)
    })
  }, [layout])

  const lines = useMemo(() => {
    const main = parseLrc(p.lrc)
    const trans = parseLrc(p.tlyric)
    if (!trans.length) return main
    const map = new Map(trans.map((t) => [t.timeMs, t.text]))
    return main.map((l) => ({ ...l, trans: map.get(l.timeMs) }))
  }, [p.lrc, p.tlyric])
  const active = getCurrentLineIndex(lines, p.currentMs)
  const hasTrans = lines.some((l) => 'trans' in l && (l as { trans?: string }).trans)
  const displayLines = showTrans ? lines : lines.map((l) => ({ timeMs: l.timeMs, text: l.text }))

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!p.current) return null
  const cur = p.current

  return (
    <div ref={npRef} className={`np ${layout} ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="np-top" data-flip="top">
        {cur.cover && <img className="np-cover" src={cur.cover} alt="" />}
        <div className="np-title">{cur.name}</div>
        <div className="np-artist">{cur.artist}</div>
        <div className="np-actions">
          <button className={`tap iconbtn ${p.isLiked(cur.id) ? 'liked' : ''}`} onClick={() => p.toggleLike(cur.id)} aria-label="红心">
            <Icon name={p.isLiked(cur.id) ? 'heartFilled' : 'heart'} size={22} />
          </button>
          {cur.artistId > 0 && <button className="tap iconbtn" onClick={() => onOpenArtist(cur.artistId)} aria-label="歌手"><Icon name="artist" size={22} /></button>}
          {cur.albumId > 0 && <button className="tap iconbtn" onClick={() => onOpenAlbum(cur.albumId)} aria-label="所属专辑"><Icon name="album" size={22} /></button>}
          <button className="tap iconbtn" onClick={() => setShowQueue(true)} aria-label="播放队列"><Icon name="queue" size={22} /></button>
          {hasTrans && <button className={`tap iconbtn trans-btn ${showTrans ? 'on' : ''}`} onClick={toggleTrans} aria-label="翻译">译</button>}
          <button className={`tap iconbtn ${layout === 'split' ? 'on' : ''}`} onClick={toggleLayout} aria-label="布局"><Icon name="layout" size={22} /></button>
        </div>
      </div>

      <div className="np-lyrics" data-flip="lyrics">
        {open && (p.pureMusic
          ? <div className="np-nolyric">纯音乐 · 请欣赏</div>
          : lines.length === 0
            ? <div className="np-nolyric">暂无歌词</div>
            : <LyricsView lines={displayLines} activeIndex={active} onSeek={(ms) => p.seek(ms)} />)}
      </div>

      <div className="np-bottom" data-flip="bottom">
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
        <div className="np-volume">
          <Icon name="volume" size={20} />
          <input className="np-vol-seek" type="range" min={0} max={1} step={0.01}
            value={p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} aria-label="音量" />
        </div>
        <QualityPicker />
        <button className="tap np-collapse" onClick={onClose} aria-label="收起"><Icon name="chevronDown" size={22} /> 收起</button>
      </div>

      {showQueue && <QueueView onClose={() => setShowQueue(false)} />}
    </div>
  )
}
