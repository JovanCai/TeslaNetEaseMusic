import { useEffect, useState } from 'react'
import { THEMES, AUTO, systemScheme, loadThemePref, setThemePref, applyResolvedTheme, ensureSunTimes } from '../ui/themes'
import { DISPLAY_SCALES, loadDisplayScale, setDisplayScale } from '../ui/displayScale'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from './Icon'

export function ThemePicker() {
  const player = usePlayer()
  const [scale, setScale] = useState(loadDisplayScale)
  const [open, setOpen] = useState(false)
  const [pref, setPref] = useState(loadThemePref())

  // 打开面板时隐藏右侧快速滑块,避免从面板边露出
  useEffect(() => {
    document.body.classList.toggle('picker-open', open)
    return () => document.body.classList.remove('picker-open')
  }, [open])

  // 自动模式:车机给了深浅偏好就跟车机(日夜变化即时响应、不联网);车机不给再回退日出日落(定时重算)
  useEffect(() => {
    applyResolvedTheme()
    if (pref !== AUTO) return
    if (systemScheme() != null && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const on = () => applyResolvedTheme() // 车机日夜模式一变就同时切
      mq.addEventListener('change', on)
      return () => mq.removeEventListener('change', on)
    }
    let alive = true
    const tick = () => { ensureSunTimes().then(() => { if (alive) applyResolvedTheme() }) }
    tick()
    const t = window.setInterval(tick, 60_000) // 当日已缓存则直接返回,仅跨日会真正联网
    return () => { alive = false; window.clearInterval(t) }
  }, [pref])

  function pick(id: string) {
    setThemePref(id)
    setPref(id)
    setOpen(false)
  }

  return (
    <>
      <button className="theme-btn tap" onClick={() => setOpen((o) => !o)} aria-label="主题与界面大小">
        <Icon name="palette" size={24} />
      </button>
      {open && (
        <>
          <div className="theme-mask" onClick={() => setOpen(false)} />
          <div className="theme-pop glass">
            <div className="display-size">
              <strong>界面大小</strong>
              <div className="display-options">
                {DISPLAY_SCALES.map(value => (
                  <button key={value} className="tap" aria-pressed={scale === value}
                    onClick={() => { setDisplayScale(value); setScale(value) }}>
                    {Math.round(value * 100)}%
                  </button>
                ))}
              </div>
              <small>车机显示过大时调小；100% 恢复默认</small>
            </div>
            <div className="display-size">
              <button className="normalize-toggle tap" aria-pressed={player.normalize}
                onClick={() => player.setNormalize(!player.normalize)}>
                音量平衡：{player.normalize ? '开' : '关'}
              </button>
              <small>降低过响歌曲的音量；无响度数据时保持原音量</small>
            </div>
            <div className={`theme-row tap ${pref === AUTO ? 'on' : ''}`} onClick={() => pick(AUTO)}>
              <span className="theme-swatch theme-swatch-auto" />
              <span className="theme-name">自动 · 跟随车机昼夜</span>
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
