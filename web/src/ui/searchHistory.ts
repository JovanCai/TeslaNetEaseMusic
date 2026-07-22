const KEY = 'tm.searchhist'

export function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
export function addHistory(q: string): void {
  q = q.trim()
  if (!q) return
  const list = [q, ...loadHistory().filter((x) => x !== q)].slice(0, 12)
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 忽略 */ }
}
export function clearHistory(): void {
  try { localStorage.removeItem(KEY) } catch { /* 忽略 */ }
}
