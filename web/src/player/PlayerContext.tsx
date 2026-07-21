import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextIndex, prevIndex, buildShuffleOrder, type Repeat } from './queue'
import { getSongUrl, getLyric, getPersonalFm, type Song } from '../api'
import { useAudio } from './useAudio'
import { requestWakeLock } from './wakeLock'
import { loadPersisted, savePersisted } from './persist'

export type { Song }
export interface PlayerState {
  queue: Song[]
  order: number[]   // 播放顺序:queue 下标的排列
  pos: number       // order 中的当前位置;-1 表示无
  isPlaying: boolean
  shuffle: boolean
  repeat: Repeat
  lrc: string
  pureMusic: boolean
  radar: boolean    // 私人FM 模式:接近队尾时自动续接下一批
  playToken: number // 递增以强制(重新)加载当前曲(支持单曲循环重放)
}
export const initialPlayerState: PlayerState = {
  queue: [], order: [], pos: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '', pureMusic: false, radar: false, playToken: 0,
}
type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'startRadar'; songs: Song[] } | { type: 'appendSongs'; songs: Song[] }
  | { type: 'toggle' } | { type: 'next' } | { type: 'prev' } | { type: 'stop' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string; pureMusic: boolean }

const identity = (n: number) => Array.from({ length: n }, (_, i) => i)
const curQueueIndex = (s: PlayerState) => (s.pos >= 0 ? s.order[s.pos] : -1)

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': {
      const order = s.shuffle ? buildShuffleOrder(a.songs.length, a.start) : identity(a.songs.length)
      const pos = s.shuffle ? 0 : a.start
      return { ...s, queue: a.songs, order, pos, isPlaying: true, radar: false, lrc: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'startRadar':
      return { ...s, queue: a.songs, order: identity(a.songs.length), pos: 0, isPlaying: true, shuffle: false, radar: true, lrc: '', pureMusic: false, playToken: s.playToken + 1 }
    case 'appendSongs': {
      const start = s.queue.length
      const appended = a.songs.map((_, i) => start + i)
      return { ...s, queue: [...s.queue, ...a.songs], order: [...s.order, ...appended] }
    }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'stop': return { ...s, isPlaying: false }
    case 'next': {
      const p = nextIndex(s.order.length, s.pos, s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'prev': {
      const p = prevIndex(s.order.length, s.pos)
      return { ...s, pos: p, lrc: '', pureMusic: false, playToken: s.playToken + 1 }
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
    case 'setLrc': return { ...s, lrc: a.lrc, pureMusic: a.pureMusic }
    default: return s
  }
}

interface PlayerValue extends PlayerState {
  current: Song | null; currentMs: number; durationMs: number; volume: number
  playList: (songs: Song[], start: number) => void
  startRadar: () => void
  toggle: () => void; next: () => void; prev: () => void; seek: (ms: number) => void
  setVolume: (v: number) => void
  setShuffle: (on: boolean) => void; cycleRepeat: () => void
}
const Ctx = createContext<PlayerValue | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => loadPersisted())
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState, (init) =>
    boot ? { ...init, queue: boot.queue, order: boot.order, pos: boot.pos, shuffle: boot.shuffle, repeat: boot.repeat, radar: boot.radar } : init)
  const handleEnded = useCallback(() => dispatch({ type: 'next' }), [])
  const { load, play, pause, seek, setVolume, currentMs, durationMs, volume } = useAudio(handleEnded, boot?.volume ?? 1)
  const qi = curQueueIndex(state)
  const current = qi >= 0 ? state.queue[qi] : null
  const skipRef = useRef(0)

  // 用 ref 读取最新 isPlaying:异步取到播放地址时决定是否立即播放(恢复态默认不播,等用户按播放)
  const isPlayingRef = useRef(state.isPlaying)
  isPlayingRef.current = state.isPlaying

  // 持久化:队列/顺序/位置/设置/音量变化时写入(不含播放进度)
  useEffect(() => {
    savePersisted({ queue: state.queue, order: state.order, pos: state.pos, shuffle: state.shuffle, repeat: state.repeat, radar: state.radar, volume })
  }, [state.queue, state.order, state.pos, state.shuffle, state.repeat, state.radar, volume])

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
        dispatch({ type: 'setLrc', lrc: lyric.lrc, pureMusic: lyric.pureMusic })
        if (song.url) {
          skipRef.current = 0
          load(song.url)
          if (isPlayingRef.current) { requestWakeLock(); play().catch(() => {}) }
        } else if (isPlayingRef.current) {
          advanceAfterUnplayable()
        }
      } catch {
        if (!cancelled && isPlayingRef.current) advanceAfterUnplayable()
      }
    })()
    return () => { cancelled = true }
  }, [state.playToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    state.isPlaying ? play().catch(() => {}) : pause()
  }, [state.isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // 私人FM:接近队尾时预取下一批,形成无限流
  const fetchingRef = useRef(false)
  useEffect(() => {
    if (!state.radar || state.pos < 0) return
    if (state.pos < state.order.length - 2 || fetchingRef.current) return
    fetchingRef.current = true
    getPersonalFm()
      .then((songs) => { if (songs.length) dispatch({ type: 'appendSongs', songs }) })
      .catch(() => {})
      .finally(() => { fetchingRef.current = false })
  }, [state.radar, state.pos, state.order.length])

  const value: PlayerValue = {
    ...state, current, currentMs, durationMs, volume,
    playList: (songs, start) => dispatch({ type: 'playList', songs, start }),
    startRadar: () => { getPersonalFm().then((songs) => { if (songs.length) dispatch({ type: 'startRadar', songs }) }).catch(() => {}) },
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    seek, setVolume,
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
