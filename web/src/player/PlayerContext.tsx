import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { nextIndex, prevIndex, type Repeat } from './queue'
import { getSongUrl, getLyric } from '../api'
import { useAudio } from './useAudio'

export interface Song { id: number; name: string; artist: string; cover: string }
export interface PlayerState {
  queue: Song[]; index: number; isPlaying: boolean; shuffle: boolean; repeat: Repeat; lrc: string
}
export const initialPlayerState: PlayerState = {
  queue: [], index: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '',
}
type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'toggle' } | { type: 'next' } | { type: 'prev' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string }

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': return { ...s, queue: a.songs, index: a.start, isPlaying: true, lrc: '' }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'next': {
      const i = nextIndex(s.queue.length, s.index, s.repeat)
      return i < 0 ? { ...s, isPlaying: false } : { ...s, index: i, isPlaying: true, lrc: '' }
    }
    case 'prev': return { ...s, index: prevIndex(s.queue.length, s.index), lrc: '' }
    case 'setShuffle': return { ...s, shuffle: a.on }
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
  const current = state.index >= 0 ? state.queue[state.index] : null

  useEffect(() => {
    if (!current) return
    let cancelled = false
    ;(async () => {
      const realIP = (import.meta.env.VITE_REAL_IP as string) || undefined
      const [song, lyric] = await Promise.all([getSongUrl(current.id, realIP), getLyric(current.id)])
      if (cancelled) return
      dispatch({ type: 'setLrc', lrc: lyric.lrc })
      if (song.url) await play(song.url)
      else dispatch({ type: 'next' })
    })()
    return () => { cancelled = true }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
