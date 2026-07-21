import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { nextIndex, prevIndex, buildShuffleOrder, type Repeat } from './queue'
import { getSongUrl, getLyric, type Song } from '../api'
import { useAudio } from './useAudio'
import { requestWakeLock } from './wakeLock'

export type { Song }
export interface PlayerState {
  queue: Song[]
  order: number[]   // 播放顺序:queue 下标的排列
  pos: number       // order 中的当前位置;-1 表示无
  isPlaying: boolean
  shuffle: boolean
  repeat: Repeat
  lrc: string
  playToken: number // 递增以强制(重新)加载当前曲(支持单曲循环重放)
}
export const initialPlayerState: PlayerState = {
  queue: [], order: [], pos: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '', playToken: 0,
}
type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'toggle' } | { type: 'next' } | { type: 'prev' } | { type: 'stop' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string }

const identity = (n: number) => Array.from({ length: n }, (_, i) => i)
const curQueueIndex = (s: PlayerState) => (s.pos >= 0 ? s.order[s.pos] : -1)

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': {
      const order = s.shuffle ? buildShuffleOrder(a.songs.length, a.start) : identity(a.songs.length)
      const pos = s.shuffle ? 0 : a.start
      return { ...s, queue: a.songs, order, pos, isPlaying: true, lrc: '', playToken: s.playToken + 1 }
    }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'stop': return { ...s, isPlaying: false }
    case 'next': {
      const p = nextIndex(s.order.length, s.pos, s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', playToken: s.playToken + 1 }
    }
    case 'prev': {
      const p = prevIndex(s.order.length, s.pos)
      return { ...s, pos: p, lrc: '', playToken: s.playToken + 1 }
    }
    case 'setShuffle': {
      const cur = curQueueIndex(s)
      if (cur < 0) return { ...s, shuffle: a.on, order: identity(s.queue.length), pos: -1 }
      const order = a.on ? buildShuffleOrder(s.queue.length, cur) : identity(s.queue.length)
      const pos = a.on ? 0 : cur
      return { ...s, shuffle: a.on, order, pos } // 仅重排后续,不重启当前曲(不动 playToken)
    }
    case 'cycleRepeat': {
      const order: Repeat[] = ['off', 'all', 'one']
      return { ...s, repeat: order[(order.indexOf(s.repeat) + 1) % 3] }
    }
    case 'setLrc': return { ...s, lrc: a.lrc }
    default: return s
  }
}

interface PlayerValue extends PlayerState {
  current: Song | null; currentMs: number; durationMs: number
  playList: (songs: Song[], start: number) => void
  toggle: () => void; next: () => void; prev: () => void; seek: (ms: number) => void
  setShuffle: (on: boolean) => void; cycleRepeat: () => void
}
const Ctx = createContext<PlayerValue | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState)
  const handleEnded = useCallback(() => dispatch({ type: 'next' }), [])
  const { play, pause, resume, seek, currentMs, durationMs } = useAudio(handleEnded)
  const qi = curQueueIndex(state)
  const current = qi >= 0 ? state.queue[qi] : null
  const skipRef = useRef(0)

  useEffect(() => {
    if (!current) return
    let cancelled = false
    const advanceAfterUnplayable = () => {
      skipRef.current += 1
      if (skipRef.current < state.queue.length) dispatch({ type: 'next' })
      else { skipRef.current = 0; dispatch({ type: 'stop' }) }
    }
    ;(async () => {
      try {
        const realIP = (import.meta.env.VITE_REAL_IP as string) || undefined
        const [song, lyric] = await Promise.all([getSongUrl(current.id, realIP), getLyric(current.id)])
        if (cancelled) return
        dispatch({ type: 'setLrc', lrc: lyric.lrc })
        if (song.url) {
          skipRef.current = 0
          requestWakeLock()
          await play(song.url)
        } else {
          advanceAfterUnplayable()
        }
      } catch {
        if (!cancelled) advanceAfterUnplayable()
      }
    })()
    return () => { cancelled = true }
  }, [state.playToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    state.isPlaying ? resume() : pause()
  }, [state.isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: PlayerValue = {
    ...state, current, currentMs, durationMs,
    playList: (songs, start) => dispatch({ type: 'playList', songs, start }),
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    seek,
    setShuffle: (on) => dispatch({ type: 'setShuffle', on }),
    cycleRepeat: () => dispatch({ type: 'cycleRepeat' }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlayer(): PlayerValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlayer must be used within PlayerProvider')
  return v
}
