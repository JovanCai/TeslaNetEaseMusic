import { useEffect, useRef, useState } from 'react'
import './FastScroll.css'

/** 贴右侧的快速滚动滑块:列表够长才出现,按住拖动可快速定位整页(window)滚动。 */
export function FastScroll() {
  const [frac, setFrac] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setVisible(max > 400)
      setFrac(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const t = window.setInterval(update, 500) // 列表异步加载后高度变化时刷新
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.clearInterval(t) }
  }, [])

  function scrollToClientY(clientY: number) {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: f * max })
  }

  function onDown(e: React.PointerEvent) {
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    scrollToClientY(e.clientY)
  }
  function onMove(e: React.PointerEvent) { if (dragging) scrollToClientY(e.clientY) }
  function onUp(e: React.PointerEvent) { setDragging(false); (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) }

  if (!visible) return null
  return (
    <div className={`fastscroll ${dragging ? 'dragging' : ''}`} ref={trackRef}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="fastscroll-thumb" style={{ top: `calc(${frac} * (100% - 72px))` }} />
    </div>
  )
}
