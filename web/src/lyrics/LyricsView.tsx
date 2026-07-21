import { useEffect, useRef } from 'react'
import type { LyricLine } from './parseLrc'

export function LyricsView({ lines, activeIndex }: { lines: LyricLine[]; activeIndex: number }) {
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
          >
            {l.text}
          </p>
        )
      })}
    </div>
  )
}
