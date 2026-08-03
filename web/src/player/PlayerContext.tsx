import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextIndex, prevIndex, buildShuffleOrder, type Repeat } from './queue'
import { getSongUrl, getLyric, getPersonalFm, getLikedIds, setLike, getLoginStatus, type Song } from '../api'
import { useAudio } from './useAudio'
import { requestWakeLock } from './wakeLock'
import { loadPersisted, savePersisted } from './persist'
import { toast } from '../ui/toast'
import { loadQuality, saveQuality } from '../ui/quality'

export type { Song }
export interface PlayerState {
  queue: Song[]
  order: number[]   // 播放顺序:queue 下标的排列
  pos: number       // order 中的当前位置;-1 表示无
  isPlaying: boolean
  shuffle: boolean
  repeat: Repeat
  lrc: string
  tlyric: string
  pureMusic: boolean
  radar: boolean    // 私人FM 模式:接近队尾时自动续接下一批
  playToken: number // 递增以强制(重新)加载当前曲(支持单曲循环重放)
}
export const initialPlayerState: PlayerState = {
  queue: [], order: [], pos: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '', tlyric: '', pureMusic: false, radar: false, playToken: 0,
}
type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'startRadar'; songs: Song[] } | { type: 'appendSongs'; songs: Song[] }
  | { type: 'toggle' } | { type: 'next' } | { type: 'ended' } | { type: 'prev' } | { type: 'stop' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string; tlyric: string; pureMusic: boolean }
  | { type: 'jumpTo'; pos: number } | { type: 'removeAt'; pos: number }
  | { type: 'enqueueNext'; song: Song } | { type: 'enqueue'; song: Song }
  | { type: 'reload' }

const identity = (n: number) => Array.from({ length: n }, (_, i) => i)
const curQueueIndex = (s: PlayerState) => (s.pos >= 0 ? s.order[s.pos] : -1)
const RADAR_CAP = 150, RADAR_KEEP_BEHIND = 40 // 私人FM 队列上限与保留的已播条数

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': {
      const order = s.shuffle ? buildShuffleOrder(a.songs.length, a.start) : identity(a.songs.length)
      const pos = s.shuffle ? 0 : a.start
      return { ...s, queue: a.songs, order, pos, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'startRadar':
      return { ...s, queue: a.songs, order: identity(a.songs.length), pos: 0, isPlaying: true, shuffle: false, radar: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    case 'appendSongs': {
      const start = s.queue.length
      const appended = a.songs.map((_, i) => start + i)
      const combined = [...s.queue, ...a.songs]
      const order = [...s.order, ...appended]
      // 私人FM 长时间累积会撑爆内存/localStorage:超上限时裁掉已播的前段并重映射下标(radar 非乱序,order 连续)
      if (combined.length > RADAR_CAP && s.pos > RADAR_KEEP_BEHIND) {
        const cut = s.pos - RADAR_KEEP_BEHIND
        const kept = order.slice(cut)
        const remap = new Map<number, number>()
        const queue = kept.map((qi, ni) => { remap.set(qi, ni); return combined[qi] })
        return { ...s, queue, order: kept.map((qi) => remap.get(qi)!), pos: s.pos - cut }
      }
      return { ...s, queue: combined, order }
    }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'stop': return { ...s, isPlaying: false }
    case 'ended': { // 自动续播(曲终):遵循单曲循环=重播当前
      const p = nextIndex(s.order.length, s.pos, s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'next': { // 手动下一首 / 跳过死歌:单曲循环下也要真正前进(one 视作 all)
      const p = nextIndex(s.order.length, s.pos, s.repeat === 'one' ? 'all' : s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'prev': {
      const p = prevIndex(s.order.length, s.pos)
      return { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 } // 与 next 一致:暂停时按上一首也恢复播放
    }
    case 'setShuffle': {
      const cur = curQueueIndex(s)
      if (cur < 0) return { ...s, shuffle: a.on } // 空闲:只切标志,不用 queue.length 重建 order(否则会复活已删歌/污染空闲态)
      const members = s.order // 当前在播队列的 queue 下标集合(已删除的不在其中)
      if (a.on) {
        const rest = members.filter((i) => i !== cur)
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]] }
        return { ...s, shuffle: true, order: [cur, ...rest], pos: 0 }
      }
      const order = [...members].sort((x, y) => x - y) // 关闭:剩余曲目按自然(队列)顺序
      return { ...s, shuffle: false, order, pos: order.indexOf(cur) }
    }
    case 'cycleRepeat': {
      const order: Repeat[] = ['off', 'all', 'one']
      return { ...s, repeat: order[(order.indexOf(s.repeat) + 1) % 3] }
    }
    case 'setLrc': return { ...s, lrc: a.lrc, tlyric: a.tlyric, pureMusic: a.pureMusic }
    case 'reload': return { ...s, playToken: s.playToken + 1, lrc: '', tlyric: '', pureMusic: false }
    case 'jumpTo':
      if (a.pos < 0 || a.pos >= s.order.length) return s
      return { ...s, pos: a.pos, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    case 'removeAt': {
      if (a.pos < 0 || a.pos >= s.order.length) return s
      const order = s.order.slice(0, a.pos).concat(s.order.slice(a.pos + 1))
      if (order.length === 0) // 清空:保留 shuffle/repeat/radar 等设置,不静默重置
        return { ...initialPlayerState, queue: s.queue, shuffle: s.shuffle, repeat: s.repeat, radar: s.radar, playToken: s.playToken + 1 }
      if (a.pos < s.pos) return { ...s, order, pos: s.pos - 1 }
      if (a.pos === s.pos) { // 移除的是当前曲:同位置变为下一首,重载但保持原播放/暂停态
        const pos = Math.min(s.pos, order.length - 1)
        return { ...s, order, pos, lrc: '', tlyric: '', pureMusic: false, isPlaying: s.isPlaying, playToken: s.playToken + 1 }
      }
      return { ...s, order } // 移除的在当前之后,不影响播放
    }
    case 'enqueueNext': {
      const idx = s.queue.length
      const queue = [...s.queue, a.song]
      if (s.order.length === 0) return { ...s, queue, order: [idx], pos: 0, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
      const order = s.order.slice(0, s.pos + 1).concat([idx], s.order.slice(s.pos + 1)) // pos=-1 时插到最前
      return { ...s, queue, order }
    }
    case 'enqueue': {
      const idx = s.queue.length
      const queue = [...s.queue, a.song]
      if (s.order.length === 0) return { ...s, queue, order: [idx], pos: 0, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
      return { ...s, queue, order: [...s.order, idx] }
    }
    default: return s
  }
}

interface PlayerValue extends PlayerState {
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
  quality: string; setQuality: (id: string) => void
}
const Ctx = createContext<PlayerValue | null>(null)
// 播放进度单独一个 context:每秒 4 次的 currentMs 更新只让用到进度的组件(播放页/迷你条)重渲染,
// 其余 usePlayer 消费方(队列 200 行等)不受牵连。
const ProgressCtx = createContext<{ currentMs: number; durationMs: number; bufferedMs: number; stalled: boolean; netInterrupted: boolean }>({ currentMs: 0, durationMs: 0, bufferedMs: 0, stalled: false, netInterrupted: false })

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => loadPersisted())
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState, (init) =>
    boot ? { ...init, queue: boot.queue, order: boot.order, pos: boot.pos, shuffle: boot.shuffle, repeat: boot.repeat, radar: boot.radar } : init)

  const isPlayingRef = useRef(state.isPlaying)
  isPlayingRef.current = state.isPlaying
  const queueLenRef = useRef(state.queue.length)
  queueLenRef.current = state.queue.length
  const skipRef = useRef(0)
  const loadedOkRef = useRef(true) // 当前曲是否成功拿到可播地址;false 时按播放会自动跳过
  const preloadedRef = useRef<{ id: number; url: string } | null>(null) // 已预取并缓冲的下一首
  const preloadTokenRef = useRef(-1) // 保证每首只预载一次
  const playedRef = useRef(0)        // 当前曲已播到的位置(ms)
  const durationRef = useRef(0)
  const curUrlRef = useRef('')       // 当前曲已加载的地址(断网续播时重载用)
  const interruptedRef = useRef<{ url: string; ms: number } | null>(null) // 中途断网:保住的地址+断点
  const pauseRef = useRef<() => void>(() => {})
  const [netInterrupted, setNetInterrupted] = useState(false) // UI:网络中断,恢复后自动继续

  // 跳过播不了的歌:连续失败超过队列长度就停,避免死循环
  const advanceAfterUnplayable = useCallback(() => {
    skipRef.current += 1
    if (skipRef.current < queueLenRef.current) { toast('这首暂时播不了,已跳过'); dispatch({ type: 'next' }) }
    else { skipRef.current = 0; toast('队列里的歌暂时都放不了'); dispatch({ type: 'stop' }) }
  }, [])

  // 曲终自动续播;但若远未到真实时长(播到缓冲末尾就"结束"),多半是断网,当作中断而非前进
  const handleEnded = useCallback(() => {
    if (durationRef.current > 0 && playedRef.current < durationRef.current - 3000 && curUrlRef.current) {
      interruptedRef.current = { url: curUrlRef.current, ms: playedRef.current }
      setNetInterrupted(true)
      return
    }
    dispatch({ type: 'ended' })
  }, [])

  const handleError = useCallback((e: MediaError | null) => {
    if (interruptedRef.current) return // 已在中断/重连中:继续等,别跳
    if (playedRef.current > 1500 && curUrlRef.current) { // 本来播得好好的、只是中途断网 → 保住这首,等网络恢复续播
      interruptedRef.current = { url: curUrlRef.current, ms: playedRef.current }
      pauseRef.current()
      setNetInterrupted(true)
      toast('网络中断,恢复后自动继续')
      return
    }
    // 从没播出来 → 不可用,跳过(带提示)
    loadedOkRef.current = false
    if (!isPlayingRef.current) return
    const msg = e?.code === 2 ? '网络错误' : e?.code === 3 ? '解码失败' : e?.code === 4 ? '音源不可用' : '播放出错'
    toast(`${msg},已跳过`)
    advanceAfterUnplayable()
  }, [advanceAfterUnplayable])

  const { load, play, pause, seek, setVolume, preload, swapToPreloaded, reloadFrom, currentMs, durationMs, bufferedMs, stalled, volume } = useAudio(handleEnded, handleError, boot?.volume ?? 1)
  const qi = curQueueIndex(state)
  const current = qi >= 0 ? state.queue[qi] : null
  playedRef.current = currentMs
  durationRef.current = durationMs
  pauseRef.current = pause
  const seekRef = useRef(seek); seekRef.current = seek
  const setVolRef = useRef(setVolume); setVolRef.current = setVolume
  const reloadFromRef = useRef(reloadFrom); reloadFromRef.current = reloadFrom
  const seekStable = useCallback((ms: number) => seekRef.current(ms), [])
  const setVolumeStable = useCallback((v: number) => setVolRef.current(v), [])
  // 断网续播:网络恢复(online 事件/定时重试/按播放)时,重载并 seek 回断点续播
  const attemptResume = useCallback(() => {
    const it = interruptedRef.current
    if (!it || !isPlayingRef.current) return
    reloadFromRef.current(it.url, it.ms)
  }, [])

  // 持久化:队列/顺序/位置/设置/音量变化时写入(不含播放进度)
  useEffect(() => {
    savePersisted({ queue: state.queue, order: state.order, pos: state.pos, shuffle: state.shuffle, repeat: state.repeat, radar: state.radar, volume })
  }, [state.queue, state.order, state.pos, state.shuffle, state.repeat, state.radar, volume])

  // 取播放地址(关键)与歌词(尽力而为,失败不连累播放)
  useEffect(() => {
    if (!current) return
    interruptedRef.current = null; setNetInterrupted(false); playedRef.current = 0 // 换曲:清掉上一首的断网状态
    let cancelled = false
    ;(async () => {
      // 下一首已预载并缓冲在备用元素:直接切过去,复用字节、不重新下载
      const pre = preloadedRef.current
      if (pre && pre.id === current.id && swapToPreloaded(pre.url)) {
        preloadedRef.current = null
        curUrlRef.current = pre.url
        loadedOkRef.current = true
        skipRef.current = 0
        if (isPlayingRef.current) { requestWakeLock(); play().catch(() => {}) }
        getLyric(current.id)
          .then((lyric) => { if (!cancelled) dispatch({ type: 'setLrc', lrc: lyric.lrc, tlyric: lyric.tlyric, pureMusic: lyric.pureMusic }) })
          .catch(() => { if (!cancelled) dispatch({ type: 'setLrc', lrc: '', tlyric: '', pureMusic: false }) })
        return
      }
      let url: string | null = null
      try { url = (await getSongUrl(current.id, loadQuality())).url }
      catch {
        if (!cancelled && isPlayingRef.current) advanceAfterUnplayable()
        return
      }
      if (cancelled) return
      if (url) {
        curUrlRef.current = url
        loadedOkRef.current = true
        skipRef.current = 0
        load(url)
        if (isPlayingRef.current) { requestWakeLock(); play().catch(() => {}) }
      } else {
        loadedOkRef.current = false
        if (isPlayingRef.current) advanceAfterUnplayable()
      }
      // 歌词单独取:超时/失败只是没歌词,不该把能播的歌当成播不了跳掉
      getLyric(current.id)
        .then((lyric) => { if (!cancelled) dispatch({ type: 'setLrc', lrc: lyric.lrc, tlyric: lyric.tlyric, pureMusic: lyric.pureMusic }) })
        .catch(() => { if (!cancelled) dispatch({ type: 'setLrc', lrc: '', tlyric: '', pureMusic: false }) })
    })()
    return () => { cancelled = true }
  }, [state.playToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (state.isPlaying) {
      if (interruptedRef.current) attemptResume() // 断网中按播放:尝试从断点续播
      else if (loadedOkRef.current) play().catch(() => {})
      else advanceAfterUnplayable() // 按播放时当前曲不可用(如恢复态遇到下架歌)→ 跳到能播的
    } else pause()
  }, [state.isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // 网络恢复(online 事件)或中断期间定时,自动尝试续播;播到断点之后就清掉中断态
  useEffect(() => {
    const on = () => attemptResume()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [attemptResume])
  useEffect(() => {
    if (!netInterrupted) return
    const t = window.setInterval(() => attemptResume(), 6000) // online 事件不可靠时的兜底重试
    return () => window.clearInterval(t)
  }, [netInterrupted, attemptResume])
  useEffect(() => {
    const it = interruptedRef.current
    if (it && currentMs > it.ms + 300) { interruptedRef.current = null; setNetInterrupted(false); skipRef.current = 0 } // 已续上
  }, [currentMs])

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

  // 弱网韧性:当前曲播放几秒后,预取下一首地址并用备用元素缓冲字节。切歌/曲终时直接切到备用元素
  // (复用缓冲、不重新下载),更快更不易卡。单曲循环/无下一首不预载。
  useEffect(() => {
    if (!state.isPlaying || durationMs <= 0) return
    if (preloadTokenRef.current === state.playToken) return // 每首只预载一次
    if (currentMs < 5000) return // 播了几秒(用户大概率会继续听)后再预载,给当前曲的缓冲让路
    preloadTokenRef.current = state.playToken
    const np = nextIndex(state.order.length, state.pos, state.repeat)
    if (np < 0 || np === state.pos) return // 无下一首 / 单曲循环
    const nextSong = state.queue[state.order[np]]
    if (!nextSong || preloadedRef.current?.id === nextSong.id) return
    getSongUrl(nextSong.id, loadQuality()).then((r) => {
      if (!r.url) return
      preloadedRef.current = { id: nextSong.id, url: r.url }
      preload(r.url) // 用备用元素缓冲下一首的字节
    }).catch(() => {})
  }, [currentMs, durationMs, state.isPlaying, state.playToken, state.pos, state.order, state.queue, state.repeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session 媒体键:只注册一次,逐个 try/catch —— 某个动作在车机内核不支持而抛错时,
  // 不会中断后面动作的注册(此前 prev/next 就是被中途抛错拖累而未注册、按键变灰)。
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try { ms.setActionHandler(action, handler) } catch { /* 该动作不支持则跳过 */ }
    }
    set('play', () => { if (!isPlayingRef.current) dispatch({ type: 'toggle' }) })
    set('pause', () => { if (isPlayingRef.current) dispatch({ type: 'toggle' }) })
    set('previoustrack', () => dispatch({ type: 'prev' }))
    set('nexttrack', () => dispatch({ type: 'next' }))
    set('seekto', (d) => { if (d.seekTime != null) seekRef.current(d.seekTime * 1000) })
  }, [])

  // Media Session 元数据:封面 + 歌名。车机媒体卡片副标题被浏览器占用来显示页面 URL、
  // 不渲染 artist 字段,所以把歌手并进标题行,保证车机上能看到歌手名。
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (!current) { ms.metadata = null; document.title = 'TeslaNetEaseMusic'; return }
    const cover = current.cover
    const title = current.artist ? `${current.name} · ${current.artist}` : current.name
    try {
      ms.metadata = new MediaMetadata({
        title,
        artist: current.artist,
        album: current.artist, // 冗余兜底:部分车机副标题取 album
        artwork: cover
          ? [128, 256, 512].map((s) => ({ src: `${cover}?param=${s}y${s}`, sizes: `${s}x${s}`, type: 'image/jpeg' }))
          : [],
      })
    } catch { /* 老内核不支持 MediaMetadata 则跳过 */ }
    document.title = `${current.name} - ${current.artist}`
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused'
  }, [state.isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return
    if (durationMs > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: durationMs / 1000, position: Math.min(currentMs, durationMs) / 1000 })
      } catch { /* 忽略 */ }
    }
  }, [currentMs, durationMs])

  // 音质:持久化选择,切换后重载当前曲以新音质取地址
  const [quality, setQualityState] = useState(loadQuality())
  const setQuality = useCallback((id: string) => { setQualityState(id); saveQuality(id); dispatch({ type: 'reload' }) }, [])

  // 红心(“我喜欢的音乐”):加载红心列表,提供 isLiked / toggleLike(乐观更新+失败回滚并提示)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    getLoginStatus()
      .then((s) => (s.uid ? getLikedIds(s.uid) : []))
      .then((ids) => setLikedIds(new Set(ids)))
      .catch(() => {})
  }, [])
  const isLiked = useCallback((id: number) => likedIds.has(id), [likedIds])
  const toggleLike = useCallback((id: number) => {
    const like = !likedIds.has(id)
    setLikedIds((prev) => { const n = new Set(prev); if (like) n.add(id); else n.delete(id); return n })
    setLike(id, like).catch(() => {
      setLikedIds((prev) => { const n = new Set(prev); if (like) n.delete(id); else n.add(id); return n })
      toast('红心操作失败,请稍后再试')
    })
  }, [likedIds])

  const queueSongs = useMemo(() => state.order.map((i) => state.queue[i]), [state.order, state.queue])
  const progress = useMemo(() => ({ currentMs, durationMs, bufferedMs, stalled, netInterrupted }), [currentMs, durationMs, bufferedMs, stalled, netInterrupted])
  // value 不含 currentMs/durationMs,依赖项在进度 tick 时都不变 → 引用稳定,usePlayer 消费方不会每秒重渲染 4 次
  const value = useMemo<PlayerValue>(() => ({
    ...state, current, volume, queueSongs, quality, setQuality,
    isLiked, toggleLike,
    jumpTo: (pos) => dispatch({ type: 'jumpTo', pos }),
    removeAt: (pos) => dispatch({ type: 'removeAt', pos }),
    enqueueNext: (song) => { dispatch({ type: 'enqueueNext', song }); toast('已设为下一首') },
    enqueue: (song) => { dispatch({ type: 'enqueue', song }); toast('已加入队列') },
    playList: (songs, start) => dispatch({ type: 'playList', songs, start }),
    startRadar: () => { getPersonalFm().then((songs) => { if (songs.length) dispatch({ type: 'startRadar', songs }) }).catch(() => {}) },
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    seek: seekStable, setVolume: setVolumeStable,
    setShuffle: (on) => dispatch({ type: 'setShuffle', on }),
    cycleRepeat: () => dispatch({ type: 'cycleRepeat' }),
  }), [state, current, volume, queueSongs, quality, setQuality, isLiked, toggleLike, seekStable, setVolumeStable])

  return (
    <Ctx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </Ctx.Provider>
  )
}

export function usePlayer(): PlayerValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlayer must be used within PlayerProvider')
  return v
}

export function usePlayerProgress() {
  return useContext(ProgressCtx)
}
