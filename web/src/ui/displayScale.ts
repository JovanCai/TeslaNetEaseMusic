export const DISPLAY_SCALES = [0.6, 0.7, 0.8, 0.9, 1] as const
export function loadDisplayScale() {
  try {
    const value = Number(localStorage.getItem('tm.displayScale'))
    return DISPLAY_SCALES.some(scale => scale === value) ? value : 1
  } catch { return 1 }
}
export function displayScale() {
  return Number(document.documentElement.style.getPropertyValue('--display-scale')) || 1
}
export function updateDisplayViewport() {
  const root = document.documentElement
  const scale = displayScale()
  root.style.setProperty('--app-height', `${window.innerHeight / scale}px`)
  root.dataset.wide = String(window.innerWidth / scale > 820)
  root.dataset.short = String(window.innerHeight / scale < 620)
}
export function setDisplayScale(value: number) {
  const scale = DISPLAY_SCALES.some(item => item === value) ? value : 1
  document.documentElement.style.setProperty('--display-scale', String(scale))
  try { localStorage.setItem('tm.displayScale', String(scale)) } catch { /* session-only if storage is unavailable */ }
  updateDisplayViewport()
  window.dispatchEvent(new Event('resize'))
}
export function initializeDisplayScale() {
  document.documentElement.style.setProperty('--display-scale', String(loadDisplayScale()))
  updateDisplayViewport()
  window.addEventListener('resize', updateDisplayViewport)
}
