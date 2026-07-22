import { useEffect, useRef } from 'react'
import type { LyricLine } from './parseLrc'

export interface LyricLineEx extends LyricLine { trans?: string }

export function LyricsView({ lines, activeIndex, onSeek }: {
  lines: LyricLineEx[]
  activeIndex: number
  onSeek?: (ms: number) => void
}) {
  const activeRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  if (lines.length === 0) return <p className="lyrics-empty">暂无歌词</p>
  return (
    <div className="lyrics">
      {lines.map((l, i) => {
        const active = i === activeIndex
        return (
          <p
            key={i}
            ref={active ? activeRef : null}
            data-active={active}
            className={active ? 'line active' : 'line'}
            onClick={() => onSeek?.(l.timeMs)}
          >
            {l.text}
            {l.trans && <span className="line-trans">{l.trans}</span>}
          </p>
        )
      })}
    </div>
  )
}
