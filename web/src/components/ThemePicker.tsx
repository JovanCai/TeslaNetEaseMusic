import { useEffect, useState } from 'react'
import { THEMES, AUTO, loadThemePref, setThemePref, applyResolvedTheme } from '../ui/themes'
import { Icon } from './Icon'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [pref, setPref] = useState(loadThemePref())

  // 打开面板时隐藏右侧快速滑块,避免从面板边露出
  useEffect(() => {
    document.body.classList.toggle('picker-open', open)
    return () => document.body.classList.remove('picker-open')
  }, [open])

  // 自动模式:定时重算,到点(白天↔夜间)自动切换深/浅
  useEffect(() => {
    applyResolvedTheme()
    if (pref !== AUTO) return
    const t = window.setInterval(applyResolvedTheme, 60_000)
    return () => window.clearInterval(t)
  }, [pref])

  function pick(id: string) {
    setThemePref(id)
    setPref(id)
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
            <div className={`theme-row tap ${pref === AUTO ? 'on' : ''}`} onClick={() => pick(AUTO)}>
              <span className="theme-swatch theme-swatch-auto" />
              <span className="theme-name">自动 · 跟随时间</span>
              {pref === AUTO && <span className="theme-check">✓</span>}
            </div>
            {THEMES.map((t) => (
              <div key={t.id} className={`theme-row tap ${pref === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>
                <span className="theme-swatch" data-theme={t.id} />
                <span className="theme-name">{t.name}</span>
                {pref === t.id && <span className="theme-check">✓</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
