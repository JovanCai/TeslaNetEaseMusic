import { useState } from 'react'
import { usePlayer } from '../player/PlayerContext'
import { QUALITIES, qualityName } from '../ui/quality'

export function QualityPicker() {
  const p = usePlayer()
  const [open, setOpen] = useState(false)

  return (
    <div className="quality">
      <button className="tap quality-btn" onClick={() => setOpen((o) => !o)}>
        音质 · {p.lowData ? '省流' : qualityName(p.quality)}
      </button>
      {open && (
        <>
          <div className="quality-mask" onClick={() => setOpen(false)} />
          <div className="quality-pop glass">
            <div className={`quality-row lowdata tap ${p.lowData ? 'on' : ''}`}
              onClick={() => p.setLowData(!p.lowData)}>
              省流模式 · 弱网{p.lowData ? ' ✓' : ''}
            </div>
            <div className="quality-sep" />
            {QUALITIES.map((q) => {
              const on = !p.lowData && p.quality === q.id
              return (
                <div key={q.id} className={`quality-row tap ${on ? 'on' : ''}`}
                  onClick={() => { p.setQuality(q.id); setOpen(false) }}>
                  {q.name}{on ? ' ✓' : ''}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
