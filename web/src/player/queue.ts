export type Repeat = 'off' | 'all' | 'one'

export function nextIndex(len: number, index: number, repeat: Repeat): number {
  if (len === 0) return -1
  if (repeat === 'one') return index
  if (index + 1 < len) return index + 1
  return repeat === 'all' ? 0 : -1
}

export function prevIndex(len: number, index: number): number {
  if (len === 0) return -1
  return index > 0 ? index - 1 : 0
}

export function buildShuffleOrder(len: number, current: number): number[] {
  const rest = Array.from({ length: len }, (_, i) => i).filter((i) => i !== current)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [current, ...rest]
}

// 随机模式放完一轮:把同一批歌重新洗牌接着放。刚放完的那首不排在新一轮开头,避免连播同一首。
export function reshuffle(members: number[], justPlayed: number): number[] {
  const out = [...members]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  if (out.length > 1 && out[0] === justPlayed) { const k = 1 + Math.floor(Math.random() * (out.length - 1)); [out[0], out[k]] = [out[k], out[0]] }
  return out
}
