// 歌词时间微调:按歌记忆偏移(ms)。正数 = 歌词提前显示(歌词慢了就点「提前」)。
const KEY = 'tm.lyricoffset'
const MAX_ENTRIES = 300
export const OFFSET_STEP = 500
export const OFFSET_LIMIT = 10_000

type Store = Record<string, number>

function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

export function getLyricOffset(songId: number): number {
  const v = load()[`s${songId}`]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function setLyricOffset(songId: number, ms: number): number {
  const v = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(ms / 100) * 100))
  const store = load()
  const k = `s${songId}` // 加前缀:纯数字键会按数值排序,破坏「按最近修改」的顺序
  delete store[k] // 删了再加,保证最近改过的排在最后,超量时先丢最久没动的
  if (v !== 0) store[k] = v
  const keys = Object.keys(store)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete store[old]
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* 忽略 */ }
  return v
}

export function formatOffset(ms: number): string {
  return `${ms > 0 ? '+' : ms < 0 ? '−' : '±'}${(Math.abs(ms) / 1000).toFixed(1)}s`
}
