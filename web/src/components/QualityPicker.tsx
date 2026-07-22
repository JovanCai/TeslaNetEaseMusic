import { useState } from 'react'
import { usePlayer } from '../player/PlayerContext'
import { QUALITIES, qualityName } from '../ui/quality'

export function QualityPicker() {
  const p = usePlayer()
  const [open, setOpen] = useState(false)

  return (
    <div className="quality">
      <button className="tap quality-btn" onClick={() => setOpen((o) => !o)}>音质 · {qualityName(p.quality)}</button>
      {open && (
        <>
          <div className="quality-mask" onClick={() => setOpen(false)} />
          <div className="quality-pop glass">
            {QUALITIES.map((q) => (
              <div key={q.id} className={`quality-row tap ${p.quality === q.id ? 'on' : ''}`}
                onClick={() => { p.setQuality(q.id); setOpen(false) }}>
                {q.name}{p.quality === q.id ? ' ✓' : ''}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
