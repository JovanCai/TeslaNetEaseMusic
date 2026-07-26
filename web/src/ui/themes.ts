export const THEMES = [
  { id: 'neon', name: '深空霓虹' },
  { id: 'crimson', name: '赤焰' },
  { id: 'aurora', name: '极光' },
  { id: 'sunset', name: '暮光' },
  { id: 'daylight', name: '浅色' },
] as const

const KEY = 'tm.theme'
const DARK_KEY = 'tm.darktheme'
export const AUTO = 'auto'

// 白天时段(本地时间):此区间用浅色,其余用深色。
// 改这里必须同步 index.html 的启动内联脚本(否则刷新时会先按旧逻辑闪一下)。
const DAY_START = 6
const DAY_END = 18

export function isDaytime(d = new Date()): boolean {
  const h = d.getHours()
  return h >= DAY_START && h < DAY_END
}

// 用户偏好:某个主题 id,或 'auto'
export function loadThemePref(): string {
  try { return localStorage.getItem(KEY) || 'neon' } catch { return 'neon' }
}

// 自动模式夜间使用的深色主题(记住用户上次挑的深色)
function loadDarkTheme(): string {
  try { return localStorage.getItem(DARK_KEY) || 'neon' } catch { return 'neon' }
}

// 把偏好解析成实际应用的主题 id
export function resolveTheme(pref = loadThemePref()): string {
  if (pref !== AUTO) return pref
  return isDaytime() ? 'daylight' : loadDarkTheme()
}

// 写入 <html data-theme>(仅应用,不改用户偏好)
export function applyResolvedTheme(): void {
  document.documentElement.dataset.theme = resolveTheme()
}

// 保存用户偏好并立即生效;选具体深色主题时记住它,供自动模式夜间沿用
export function setThemePref(pref: string): void {
  try {
    localStorage.setItem(KEY, pref)
    if (pref !== AUTO && pref !== 'daylight') localStorage.setItem(DARK_KEY, pref)
  } catch { /* 忽略 */ }
  applyResolvedTheme()
}
