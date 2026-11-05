import { createContext, useContext } from 'react'
import type { Song } from '../api'
import type { PlayerState } from './playerReducer'

// 播放器 context 与读取它的 hooks;PlayerProvider(PlayerContext.tsx)负责提供值。

export interface PlayerValue extends PlayerState {
  normalize: boolean; setNormalize: (value: boolean) => void
  current: Song | null; volume: number
  queueSongs: Song[]
  playList: (songs: Song[], start: number) => void
  startRadar: () => void
  toggle: () => void; next: () => void; prev: () => void; seek: (ms: number) => void
  setVolume: (v: number) => void
  setShuffle: (on: boolean) => void; cycleRepeat: () => void
  isLiked: (id: number) => boolean; toggleLike: (id: number) => void
  jumpTo: (pos: number) => void; removeAt: (pos: number) => void
  enqueueNext: (song: Song) => void; enqueue: (song: Song) => void
  trashFm: () => void
  quality: string; setQuality: (id: string) => void
  lowData: boolean; setLowData: (v: boolean) => void
}
export const Ctx = createContext<PlayerValue | null>(null)
// 播放进度单独一个 context:每秒 4 次的 currentMs 更新只让用到进度的组件(播放页/迷你条)重渲染,
// 其余 usePlayer 消费方(队列 200 行等)不受牵连。
export const ProgressCtx = createContext<{ currentMs: number; durationMs: number; bufferedMs: number; stalled: boolean; netInterrupted: boolean }>({ currentMs: 0, durationMs: 0, bufferedMs: 0, stalled: false, netInterrupted: false })

export function usePlayer(): PlayerValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlayer must be used within PlayerProvider')
  return v
}

export function usePlayerProgress() {
  return useContext(ProgressCtx)
}
