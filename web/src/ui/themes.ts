export const THEMES = [
  { id: 'neon', name: '深空霓虹' },
  { id: 'crimson', name: '赤焰' },
  { id: 'aurora', name: '极光' },
  { id: 'sunset', name: '暮光' },
  { id: 'daylight', name: '浅色' },
] as const

const KEY = 'tm.theme'
const DARK_KEY = 'tm.darktheme'
const SUN_KEY = 'tm.suntimes'
export const AUTO = 'auto' // 自动:先跟车机深浅(prefers-color-scheme,与车机日夜同切),车机不给偏好再回退日出日落

// 车机/系统的深浅偏好:'dark'|'light';两者都不匹配(不支持/无偏好)返回 null → 交给日出日落兜底
export function systemScheme(): 'dark' | 'light' | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return null
}

// 取不到日出日落时的回退窗口(本地时间)。改这里要同步 index.html 的启动脚本。
const FALLBACK_DAY_START = 6
const FALLBACK_DAY_END = 18

function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function loadSun(): { d: string; rise: number; set: number } | null {
  try { return JSON.parse(localStorage.getItem(SUN_KEY) || 'null') } catch { return null }
}

// 是否白天:优先用当日真实日出日落(网络取得并缓存),取不到再回退固定窗口
export function isDaytime(): boolean {
  const st = loadSun()
  if (st && st.d === localDateStr()) { const n = Date.now(); return n >= st.rise && n < st.set }
  const h = new Date().getHours()
  return h >= FALLBACK_DAY_START && h < FALLBACK_DAY_END
}

// 取当日日出日落并缓存(按本地日期):IP 定位 → 日出日落接口。
// 已有当日缓存则跳过;失败静默(回退固定窗口)。仅自动模式下调用。
export async function ensureSunTimes(): Promise<void> {
  const st = loadSun()
  if (st && st.d === localDateStr()) return
  try {
    const loc = await fetch('https://ipwho.is/').then((r) => r.json())
    const lat = loc?.latitude, lng = loc?.longitude
    if (typeof lat !== 'number' || typeof lng !== 'number') return
    const s = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`).then((r) => r.json())
    if (s?.status !== 'OK') return
    const rise = Date.parse(s.results.sunrise), set = Date.parse(s.results.sunset)
    if (!rise || !set) return
    localStorage.setItem(SUN_KEY, JSON.stringify({ d: localDateStr(), rise, set }))
  } catch { /* 网络/CORS 失败:静默回退固定窗口 */ }
}

// 用户偏好:某个主题 id,或 'auto'。旧的 'auto-sys'(跟随车机)已并入统一的 'auto'
export function loadThemePref(): string {
  try {
    const v = localStorage.getItem(KEY) || 'neon'
    return v === 'auto-sys' ? AUTO : v
  } catch { return 'neon' }
}

// 自动模式夜间使用的深色主题(记住用户上次挑的深色)
function loadDarkTheme(): string {
  try { return localStorage.getItem(DARK_KEY) || 'neon' } catch { return 'neon' }
}

// 把偏好解析成实际应用的主题 id。自动:先看车机深浅,车机不给偏好再用日出日落
export function resolveTheme(pref = loadThemePref()): string {
  if (pref === AUTO) {
    const sys = systemScheme()
    if (sys) return sys === 'dark' ? loadDarkTheme() : 'daylight' // 车机给了偏好:优先跟车机
    return isDaytime() ? 'daylight' : loadDarkTheme()              // 车机不给:回退日出日落
  }
  return pref
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
