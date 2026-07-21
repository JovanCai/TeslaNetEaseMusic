import type { Song } from '../api'
import type { Repeat } from './queue'

const KEY = 'tm.player.v1'

export interface Persisted {
  queue: Song[]
  order: number[]
  pos: number
  shuffle: boolean
  repeat: Repeat
  radar: boolean
  volume: number
}

export function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!Array.isArray(p?.queue) || !Array.isArray(p?.order)) return null
    return p as Persisted
  } catch {
    return null
  }
}

export function savePersisted(p: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 配额超限等,忽略 */
  }
}
