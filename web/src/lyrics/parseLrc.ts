export interface LyricLine { timeMs: number; text: string }

const TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return []
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(TIME_RE, '').trim()
    if (!text) continue
    let m: RegExpExecArray | null
    TIME_RE.lastIndex = 0
    while ((m = TIME_RE.exec(raw)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0
      out.push({ timeMs: min * 60000 + sec * 1000 + frac, text })
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}

export function getCurrentLineIndex(lines: LyricLine[], currentMs: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].timeMs <= currentMs) { ans = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return ans
}
