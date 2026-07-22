export const QUALITIES = [
  { id: 'standard', name: '标准' },
  { id: 'higher', name: '较高' },
  { id: 'exhigh', name: '极高' },
  { id: 'lossless', name: '无损' },
  { id: 'hires', name: 'Hi-Res' },
] as const

const KEY = 'tm.quality'

export function loadQuality(): string {
  try { return localStorage.getItem(KEY) || 'exhigh' } catch { return 'exhigh' }
}
export function saveQuality(id: string): void {
  try { localStorage.setItem(KEY, id) } catch { /* 忽略 */ }
}
export function qualityName(id: string): string {
  return QUALITIES.find((q) => q.id === id)?.name ?? '极高'
}
