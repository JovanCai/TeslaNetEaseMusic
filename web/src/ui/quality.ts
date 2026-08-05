export const QUALITIES = [
  { id: 'standard', name: '标准' },
  { id: 'higher', name: '较高' },
  { id: 'exhigh', name: '极高' },
  { id: 'lossless', name: '无损' },
  { id: 'hires', name: 'Hi-Res' },
] as const

const KEY = 'tm.quality'
const LOW_KEY = 'tm.lowdata'
export const LOW_LEVEL = 'standard' // 省流模式用的最低码率(128k,文件小 ~10 倍)

export function loadQuality(): string {
  try { return localStorage.getItem(KEY) || 'exhigh' } catch { return 'exhigh' }
}
export function saveQuality(id: string): void {
  try { localStorage.setItem(KEY, id) } catch { /* 忽略 */ }
}
// 省流模式(弱网):开启后强制最低码率,忽略上面选的音质
export function loadLowData(): boolean {
  try { return localStorage.getItem(LOW_KEY) === '1' } catch { return false }
}
export function saveLowData(v: boolean): void {
  try { localStorage.setItem(LOW_KEY, v ? '1' : '0') } catch { /* 忽略 */ }
}
export function qualityName(id: string): string {
  return QUALITIES.find((q) => q.id === id)?.name ?? '极高'
}
