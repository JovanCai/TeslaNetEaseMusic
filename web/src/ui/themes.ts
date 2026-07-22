export const THEMES = [
  { id: 'neon', name: '深空霓虹' },
  { id: 'crimson', name: '赤焰' },
  { id: 'aurora', name: '极光' },
  { id: 'sunset', name: '暮光' },
  { id: 'daylight', name: '浅色' },
] as const

const KEY = 'tm.theme'

export function loadTheme(): string {
  try { return localStorage.getItem(KEY) || 'neon' } catch { return 'neon' }
}

export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = id
  try { localStorage.setItem(KEY, id) } catch { /* 忽略 */ }
}
