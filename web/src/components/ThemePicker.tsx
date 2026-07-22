import { useState } from 'react'
import { THEMES, loadTheme, applyTheme } from '../ui/themes'
import { Icon } from './Icon'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(loadTheme())

  function pick(id: string) {
    applyTheme(id)
    setTheme(id)
    setOpen(false)
  }

  return (
    <>
      <button className="theme-btn tap" onClick={() => setOpen((o) => !o)} aria-label="主题">
        <Icon name="palette" size={24} />
      </button>
      {open && (
        <>
          <div className="theme-mask" onClick={() => setOpen(false)} />
          <div className="theme-pop glass">
            {THEMES.map((t) => (
              <div key={t.id} className={`theme-row tap ${theme === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>
                <span className="theme-swatch" data-theme={t.id} />
                <span className="theme-name">{t.name}</span>
                {theme === t.id && <span className="theme-check">✓</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
