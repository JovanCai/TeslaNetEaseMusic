import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePlayer, usePlayerProgress } from './usePlayer'
import { parseLrc, getCurrentLineIndex } from '../lyrics/parseLrc'
import { LyricsView } from '../lyrics/LyricsView'
import { getLyricOffset, setLyricOffset, formatOffset, OFFSET_STEP, OFFSET_LIMIT } from '../lyrics/lyricOffset'
import { QueueView } from './QueueView'
import { QualityPicker } from '../components/QualityPicker'
import { Icon } from '../components/Icon'
import './player.css'
import { displayScale } from '../ui/displayScale'
import { DiagnosticPanel } from './DiagnosticPanel'
import { diagnostic, diagnosticSnapshot, setDiagnostics, useDiagnosticEntry } from './diagnostics'

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
  const enterDiagnostics = useDiagnosticEntry(() => {
    if (!diagnosticSnapshot().enabled) setDiagnostics(true)
  })
  const { currentMs, durationMs, bufferedMs, stalled, netInterrupted } = usePlayerProgress()
  const npRef = useRef<HTMLDivElement>(null)
  const flipFirst = useRef<Map<string, DOMRect> | null>(null)
  const flipTimer = useRef<number>(0)
  // 歌词字号 = 随歌词区宽度自动缩放(区域越大字越大)× 用户手动 +/- 的倍数(记忆到本地)
  const lyricsElRef = useRef<HTMLDivElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const [lyricScale, setLyricScale] = useState(() => {
    try { const v = Number(localStorage.getItem('tm.lyricscale')); return v >= 0.6 && v <= 1.8 ? v : 1 } catch { return 1 }
  })
  const lyricScaleRef = useRef(lyricScale)
  lyricScaleRef.current = lyricScale
  const applyLyricFont = useCallback(() => {
    const el = lyricsElRef.current
    if (!el) return
    const base = Math.max(20, Math.min(32, el.clientWidth * 0.03)) // 随宽度自动
    el.style.setProperty('--lyric-font', `${Math.max(14, Math.min(56, base * lyricScaleRef.current))}px`)
  }, [])
  const lyricsRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    lyricsElRef.current = el
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => applyLyricFont())
      ro.observe(el)
      roRef.current = ro
    }
  }, [applyLyricFont])
  function changeLyricScale(delta: number) {
    const v = Math.max(0.6, Math.min(1.8, Math.round((lyricScaleRef.current + delta) * 10) / 10))
    lyricScaleRef.current = v
    setLyricScale(v)
    try { localStorage.setItem('tm.lyricscale', String(v)) } catch { /* 忽略 */ }
    applyLyricFont()
  }
  const [showQueue, setShowQueue] = useState(false)
  // 切歌换碟:旧唱片朝一个方向滑出、新唱片从另一侧滑入。下一首向左出,上一首向右出。
  // 在渲染时比对歌曲变化(此刻 DOM 仍是旧唱片),记下旧唱片的封面和当前转角,让它带着原角度滑走。
  const discRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => ({ id: p.current?.id ?? -1, pos: p.pos }))
  const [leaving, setLeaving] = useState<{ key: number; cover: string; dir: 'next' | 'prev'; transform: string } | null>(null)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null)
  if (p.current && p.current.id !== shown.id) {
    const dir = p.pos === shown.pos - 1 ? 'prev' : 'next'
    const el = discRef.current
    if (el && shown.id >= 0) {
      setLeaving({ key: Date.now(), cover: el.querySelector('img')?.getAttribute('src') ?? '', dir, transform: getComputedStyle(el).transform })
      setSlideDir(dir)
    }
    setShown({ id: p.current.id, pos: p.pos })
  } else if (p.pos !== shown.pos) setShown({ id: shown.id, pos: p.pos }) // 队列增删导致下标变化:同步,方向判断才准
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(null), 650) // 动画结束后移除旧唱片(减少动态效果时动画不触发,也靠这个兜底)
    return () => window.clearTimeout(t)
  }, [leaving])
  // 歌词时间微调(按歌记忆):正数 = 歌词提前
  const curId = p.current?.id ?? -1
  const [lyricOffset, setLyricOffsetState] = useState(() => getLyricOffset(curId))
  const [offsetFor, setOffsetFor] = useState(curId)
  if (offsetFor !== curId) { setOffsetFor(curId); setLyricOffsetState(getLyricOffset(curId)) } // 换歌:读这首的偏移
  function changeLyricOffset(next: number) { setLyricOffsetState(setLyricOffset(curId, next)) }
  // 诊断:记下每首歌生效的歌词偏移,便于区分「误触调过偏移」和「播放位置真的错了」
  useEffect(() => {
    const report = () => { if (curId >= 0) diagnostic('lyric.offset', { song: curId, offset: lyricOffset }) }
    report()
    window.addEventListener('tm-diagnostic-snapshot', report)
    return () => window.removeEventListener('tm-diagnostic-snapshot', report)
  }, [curId, lyricOffset])
  const [showTrans, setShowTrans] = useState(() => {
    try { return localStorage.getItem('tm.showtrans') !== '0' } catch { return true }
  })
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('tm.nplayout') || 'center' } catch { return 'center' }
  })
  // 分栏左栏宽度(可拖动分隔条调整,记忆到本地)。下限 340,上限取视口 62% 与 760 的较小值。
  const [splitW, setSplitW] = useState(() => {
    try {
      const v = Number(localStorage.getItem('tm.splitw')) || 440
      return Math.max(340, Math.min(760, window.innerWidth / displayScale() * 0.62, v))
    } catch { return 440 }
  })
  const splitWRef = useRef(splitW)
  splitWRef.current = splitW
  useEffect(() => {
    const clamp = () => setSplitW(value => Math.max(340, Math.min(760, window.innerWidth / displayScale() * 0.62, value)))
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])
  function onDividerDown(e: React.PointerEvent) {
    e.preventDefault()
    const startX = e.clientX, startW = splitWRef.current
    const maxW = Math.min(760, window.innerWidth / displayScale() * 0.62)
    const move = (ev: PointerEvent) => setSplitW(Math.max(340, Math.min(maxW, startW + (ev.clientX - startX) / displayScale())))
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      try { localStorage.setItem('tm.splitw', String(Math.round(splitWRef.current))) } catch { /* 忽略 */ }
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  // 手势切歌:在非交互区域横向划动。左滑(右→左,dx<0)下一首,右滑(左→右,dx>0)上一首(与常见 App 一致)。
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)
  function onNpPointerDown(e: React.PointerEvent) {
    swipedRef.current = false // 每次新交互开始就复位:触屏划动后不产生点击,否则标志会残留吞掉下一次点击
    const t = e.target as HTMLElement
    // 排除按钮/滑块/分隔条/操作排,避免与点击、拖动进度/音量/分隔条冲突
    if (t.closest('button, input, .np-divider, .np-actions')) { swipeStart.current = null; return }
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  function onNpPointerUp(e: React.PointerEvent) {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) { // 横向为主的明显划动
      swipedRef.current = true
      if (dx > 0) p.prev(); else p.next()
    }
  }
  function onNpClickCapture(e: React.MouseEvent) {
    // 划动后抑制紧随的点击(桌面端划动会补发一次 click),避免误触歌词跳转
    if (swipedRef.current) { e.stopPropagation(); e.preventDefault(); swipedRef.current = false }
  }
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
    if (flipTimer.current) window.clearTimeout(flipTimer.current) // 取消上一次动画的清理,避免它在本次动画中途剥掉 transition/transform 导致 snap
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return // 晕动敏感:直接切,不做飞行动画
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'))
    els.forEach((el) => {
      const f = first.get(el.dataset.flip!)
      if (!f) return
      const l = el.getBoundingClientRect()
      const dx = (f.left - l.left) / displayScale(), dy = (f.top - l.top) / displayScale()
      const sx = l.width ? f.width / l.width : 1, sy = l.height ? f.height / l.height : 1
      el.style.willChange = 'transform' // 仅动画期间加,避免常驻改变 fixed 定位基准
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
      const clear = () => els.forEach((el) => { el.style.transition = ''; el.style.transformOrigin = ''; el.style.willChange = '' })
      flipTimer.current = window.setTimeout(clear, 560)
    })
  }, [layout])

  const lines = useMemo(() => {
    const main = parseLrc(p.lrc)
    const trans = parseLrc(p.tlyric)
    if (!trans.length) return main
    const map = new Map(trans.map((t) => [t.timeMs, t.text]))
    return main.map((l) => ({ ...l, trans: map.get(l.timeMs) }))
  }, [p.lrc, p.tlyric])
  const active = getCurrentLineIndex(lines, currentMs + lyricOffset)
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
    <div ref={npRef} className={`np ${layout} ${open ? 'open' : ''} ${layout === 'split' && splitW < 430 ? 'ctl-sm' : ''}`}
      style={{ ['--splitw' as string]: `${splitW}px` }} aria-hidden={!open}
      onPointerDown={onNpPointerDown} onPointerUp={onNpPointerUp} onClickCapture={onNpClickCapture}>
      <button className={`np-layout-toggle tap iconbtn ${layout === 'split' ? 'on' : ''}`} onClick={toggleLayout} aria-label="切换分栏布局"><Icon name="layout" size={22} /></button>
      {layout === 'split' && (
        <div className="np-divider" onPointerDown={onDividerDown} role="separator" aria-label="拖动调整歌词区宽度">
          <span className="np-handle"><Icon name="resizeLR" size={18} /></span>
        </div>
      )}
      <div className="np-top" data-flip="top">
        {/* 黑胶唱片:播放时唱片旋转、唱臂落下;暂停时停在当前角度、唱臂抬起(同网易云) */}
        {/* 换碟期间唱臂抬起,新唱片到位后再落下 */}
        <div className={`vinyl ${p.isPlaying && !leaving ? 'playing' : ''}`} onClick={enterDiagnostics}>
          {leaving && (
            <div key={leaving.key} className={`vinyl-slot leave-${leaving.dir}`} aria-hidden="true">
              <div className="vinyl-disc still" style={{ transform: leaving.transform === 'none' ? undefined : leaving.transform }}>
                {leaving.cover && <img className="vinyl-cover" src={leaving.cover} alt="" draggable={false} />}
              </div>
            </div>
          )}
          <div key={cur.id} className={`vinyl-slot ${slideDir ? `enter-${slideDir}` : ''}`}>
            <div ref={discRef} className="vinyl-disc">
              {cur.cover && <img className="vinyl-cover" src={cur.cover} alt="" draggable={false} />}
            </div>
          </div>
          <svg className="vinyl-arm" viewBox="0 0 60 120" aria-hidden="true">
            <path d="M46 14 L46 64 L30 98" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="22" y="94" width="14" height="20" rx="3" transform="rotate(26 29 104)" fill="currentColor" />
            <circle cx="46" cy="14" r="11" fill="var(--vinyl-pivot)" />
            <circle cx="46" cy="14" r="4.5" fill="currentColor" />
          </svg>
        </div>
        <div className="np-title">{cur.name}</div>
        <div className="np-artist">{cur.artist}</div>
        {(netInterrupted || stalled) && (
          <div className={`np-status ${netInterrupted ? 'net' : ''}`}>{netInterrupted ? '网络中断,恢复后自动继续' : '缓冲中…'}</div>
        )}
        <div className="np-actions">
          <button className={`tap iconbtn ${p.isLiked(cur.id) ? 'liked' : ''}`} onClick={() => p.toggleLike(cur.id)} aria-label="红心">
            <Icon name={p.isLiked(cur.id) ? 'heartFilled' : 'heart'} size={22} />
          </button>
          {p.radar && <button className="tap iconbtn" onClick={p.trashFm} aria-label="不喜欢"><Icon name="trash" size={22} /></button>}
          {cur.artistId > 0 && <button className="tap iconbtn" onClick={() => onOpenArtist(cur.artistId)} aria-label="歌手"><Icon name="artist" size={22} /></button>}
          {cur.albumId > 0 && <button className="tap iconbtn" onClick={() => onOpenAlbum(cur.albumId)} aria-label="所属专辑"><Icon name="album" size={22} /></button>}
          <button className="tap iconbtn" onClick={() => setShowQueue(true)} aria-label="播放队列"><Icon name="queue" size={22} /></button>
          <button className={`tap iconbtn trans-btn ${hasTrans && showTrans ? 'on' : ''}`} onClick={toggleTrans} disabled={!hasTrans} aria-label="翻译">译</button>
        </div>
      </div>

      <div ref={lyricsRef} className="np-lyrics" data-flip="lyrics">
        {open && (
          <div className="np-lyric-fade" key={cur.id}>
            {p.pureMusic
              ? <div className="np-nolyric">纯音乐 · 请欣赏</div>
              : lines.length === 0
                ? <div className="np-nolyric">暂无歌词</div>
                : <LyricsView lines={displayLines} activeIndex={active} onSeek={(ms) => p.seek(Math.max(0, ms - lyricOffset))} />}
          </div>
        )}
      </div>

      <div className="np-bottom" data-flip="bottom">
        <div className="np-progress">
          <span className="np-time">{fmt(currentMs)}</span>
          <div className="np-seek-wrap">
            <div className="np-seek-base" />
            <div className="np-seek-buffered" style={{ width: `${durationMs > 0 ? Math.min(100, (bufferedMs / durationMs) * 100) : 0}%` }} />
            <div className="np-seek-played" style={{ width: `${durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0}%` }} />
            <input className="np-seek" type="range" min={0} max={Math.max(durationMs, 1)}
              value={Math.min(currentMs, durationMs)} onChange={(e) => p.seek(Number(e.target.value))} />
          </div>
          <span className="np-time">{fmt(durationMs)}</span>
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

      {open && lines.length > 0 && (
        <div className="np-fontsize">
          <button className="tap iconbtn" onClick={() => changeLyricScale(-0.1)} disabled={lyricScale <= 0.6} aria-label="歌词字号减小">字－</button>
          <button className="tap iconbtn" onClick={() => changeLyricScale(0.1)} disabled={lyricScale >= 1.8} aria-label="歌词字号增大">字＋</button>
          <button className="tap iconbtn" onClick={() => changeLyricOffset(lyricOffset - OFFSET_STEP)} disabled={lyricOffset <= -OFFSET_LIMIT} aria-label="歌词延后0.5秒">延后</button>
          {lyricOffset !== 0 && <button className="tap iconbtn lyric-offset" onClick={() => changeLyricOffset(0)} aria-label="歌词时间复位">{formatOffset(lyricOffset)}</button>}
          <button className="tap iconbtn" onClick={() => changeLyricOffset(lyricOffset + OFFSET_STEP)} disabled={lyricOffset >= OFFSET_LIMIT} aria-label="歌词提前0.5秒">提前</button>
        </div>
      )}

      {showQueue && <QueueView onClose={() => setShowQueue(false)} />}
      {open && <DiagnosticPanel />}
    </div>
  )
}
