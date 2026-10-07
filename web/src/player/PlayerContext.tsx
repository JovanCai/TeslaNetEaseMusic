import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextIndex, prevIndex, buildShuffleOrder, reshuffle, type Repeat } from './queue'
import { getSongUrl, getLyric, getPersonalFm, getLikedIds, setLike, getLoginStatus, scrobble, fmTrash, type Song } from '../api'
import { useAudio } from './useAudio'
import { diagnostic, mediaFingerprint } from './diagnostics'
import type { ReplayGain } from './normalization'
import { createArtworkPublisher } from './mediaArtwork'
import { requestWakeLock } from './wakeLock'
import { loadPersisted, savePersisted } from './persist'
import { toast } from '../ui/toast'
import { loadQuality, saveQuality, loadLowData, saveLowData, LOW_LEVEL, levelsAtOrBelow, qualityName } from '../ui/quality'

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

const identity = (n: number) => Array.from({ length: n }, (_, i) => i)
const curQueueIndex = (s: PlayerState) => (s.pos >= 0 ? s.order[s.pos] : -1)
const RADAR_CAP = 150, RADAR_KEEP_BEHIND = 40 // 私人FM 队列上限与保留的已播条数
const RECOVER_AFTER_MS = 90_000 // 自动降档后,稳定这么久不卡 → 自动升回音质

// 随机播放与网易云 App 一致:放完一轮不停,重新洗牌继续(否则不开循环时整张歌单放完就停了)
const endOfShuffleRound = (s: PlayerState) => s.shuffle && !s.radar && s.order.length > 0 && s.pos === s.order.length - 1
const startNewShuffleRound = (s: PlayerState): PlayerState =>
  ({ ...s, order: reshuffle(s.order, s.order[s.pos]), pos: 0, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 })

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
      if (s.repeat !== 'one' && endOfShuffleRound(s)) return startNewShuffleRound(s)
      const p = nextIndex(s.order.length, s.pos, s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'next': { // 手动下一首 / 跳过死歌:单曲循环下也要真正前进(one 视作 all)
      if (endOfShuffleRound(s)) return startNewShuffleRound(s)
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
  const preloadedRef = useRef<{ id: number; url: string; gain: ReplayGain; level: string } | null>(null) // 仅预取地址，不创建第二个媒体元素
  const preloadTokenRef = useRef(-1) // 保证每首只预载一次
  const playedRef = useRef(0)        // 当前曲已播到的位置(ms)
  const curUrlRef = useRef('')       // 当前曲已加载的地址(断网续播时重载用)
  const curIdRef = useRef(-1)        // 当前曲 id(换音质重载用)
  const interruptedRef = useRef<{ url: string; ms: number } | null>(null) // 中途断网:保住的地址+断点
  const pauseRef = useRef<() => void>(() => {})
  const [netInterrupted, setNetInterrupted] = useState(false) // UI:网络中断,恢复后自动继续
  const [lowData, setLowDataState] = useState(loadLowData())  // 省流模式(弱网强制最低码率)
  const lowDataRef = useRef(lowData); lowDataRef.current = lowData
  const lowDataAutoRef = useRef(false) // 当前省流是"自动降档"触发的吗(自动的只存内存、会话级;手动的写 localStorage)
  const lastStallAtRef = useRef(0)   // 最后一次真·卡顿时间戳(升回计时用)
  const stallCountRef = useRef(0)    // 当前曲卡顿次数(在线时反复卡→自动开省流)
  // 听歌记录:累计当前曲「真正在播」的时长(拖进度不算),换曲/关页时达标就上报网易云
  const listenRef = useRef<{ id: number; sourceId: number; ms: number; durMs: number } | null>(null)
  const lastTickRef = useRef(0)
  const flushListen = useCallback((beacon = false) => {
    const l = listenRef.current
    listenRef.current = null
    if (l && (l.ms >= 30_000 || (l.durMs > 0 && l.ms >= Math.min(l.durMs / 2, 30_000) && l.ms >= 10_000)))
      scrobble(l.id, l.sourceId, Math.round(l.ms / 1000), beacon)
  }, [])

  // 跳过播不了的歌:连续失败超过队列长度就停,避免死循环
  const advanceAfterUnplayable = useCallback(() => {
    skipRef.current += 1
    if (skipRef.current < queueLenRef.current) { toast('这首暂时播不了,已跳过'); dispatch({ type: 'next' }) }
    else { skipRef.current = 0; toast('队列里的歌暂时都放不了'); dispatch({ type: 'stop' }) }
  }, [])

  // 曲终自动续播;但若远未到真实时长(播到缓冲末尾就"结束"),多半是断网,当作中断而非前进。
  // 用元素结束时的实时 pos/dur(useAudio 传入),不用 playedRef —— 后台/导航时 timeupdate 被节流,快照会停更导致误判。
  const handleEnded = useCallback((posMs: number, durMs: number) => {
    diagnostic('queue.ended', { posMs, durMs })
    if (durMs > 0 && posMs < durMs - 3000 && curUrlRef.current) {
      interruptedRef.current = { url: curUrlRef.current, ms: posMs }
      setNetInterrupted(true)
      return
    }
    dispatch({ type: 'ended' })
  }, [])

  const handleError = useCallback((e: MediaError | null) => {
    if (interruptedRef.current) return // 已在中断/重连中:继续等,别跳
    // 网络类错误(code 2 或未知)= 不是这首歌的问题;中途断网(已播 >1.5s)同理 → 保住这首,等恢复续播,别跳
    const networkish = e == null || e.code === 2
    if (curUrlRef.current && (networkish || playedRef.current > 1500)) {
      interruptedRef.current = { url: curUrlRef.current, ms: playedRef.current }
      pauseRef.current()
      setNetInterrupted(true)
      toast(playedRef.current > 1500 ? '网络中断,恢复后自动继续' : '网络不好,恢复后重试')
      return
    }
    // 解码失败/音源不可用 → 这首真播不了,跳过(带提示)
    loadedOkRef.current = false
    if (!isPlayingRef.current) return
    const msg = e?.code === 3 ? '解码失败' : e?.code === 4 ? '音源不可用' : '播放出错'
    toast(`${msg},已跳过`)
    advanceAfterUnplayable()
  }, [advanceAfterUnplayable])

  const qi = curQueueIndex(state)
  const current = qi >= 0 ? state.queue[qi] : null
  useEffect(() => {
    const report = () => diagnostic('queue.state', { song: current?.id ?? -1, pos: state.pos, token: state.playToken, playing: state.isPlaying, count: state.order.length, repeat: state.repeat, cover: mediaFingerprint(current?.cover ?? ''), submitted: mediaFingerprint(navigator.mediaSession?.metadata?.artwork[0]?.src ?? '') })
    report()
    window.addEventListener('tm-diagnostic-snapshot', report)
    return () => window.removeEventListener('tm-diagnostic-snapshot', report)
  }, [current, state.pos, state.playToken, state.isPlaying, state.order.length, state.repeat])
  // Media Session 元数据:封面 + 歌名。车机媒体卡片副标题被浏览器占用来显示页面 URL、
  // 不渲染 artist 字段,所以把歌手并进标题行,保证车机上能看到歌手名。
  const artworkPublisher = useRef<ReturnType<typeof createArtworkPublisher> | null>(null)
  const syncMediaMetadata = useCallback(() => artworkPublisher.current?.sync(), [])
  // Install the publisher before the track load effect. Cleanup cancels both
  // pending image results and delayed platform refreshes when the track changes.
  useEffect(() => {
    if (!current) {
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
      document.title = 'TeslaNetEaseMusic'
      artworkPublisher.current = null
      return
    }
    const publisher = createArtworkPublisher(current)
    artworkPublisher.current = publisher
    publisher.sync()
    return () => { publisher.dispose(); artworkPublisher.current = null }
  }, [current])
  const handlePlayRejected = useCallback((error: unknown) => {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'UnknownError'
    // 不再吞掉起播失败并保持“播放中”，否则系统播放键也无法重新启动。
    dispatch({ type: 'stop' })
    toast(name === 'NotAllowedError' ? '浏览器阻止了自动播放，请点播放继续' : '播放启动失败，请点播放重试')
    console.warn('[player] play rejected', { name, visibility: document.visibilityState })
  }, [])
  const { normalize, setNormalize, load, play, pause, seek, setVolume, reloadFrom, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume } = useAudio(handleEnded, handleError, boot?.volume ?? 1, syncMediaMetadata, handlePlayRejected)
  playedRef.current = currentMs
  pauseRef.current = pause
  const seekRef = useRef(seek); seekRef.current = seek
  const normRef = useRef(setNormalize); normRef.current = setNormalize
  const setNormalizeStable = useCallback((v: boolean) => normRef.current(v), [])
  const setVolRef = useRef(setVolume); setVolRef.current = setVolume
  const reloadFromRef = useRef(reloadFrom); reloadFromRef.current = reloadFrom
  const seekStable = useCallback((ms: number) => seekRef.current(ms), [])
  const setVolumeStable = useCallback((v: number) => setVolRef.current(v), [])
  // 断网续播:网络恢复(online 事件/定时重试/按播放)时,重载并 seek 回断点续播
  const attemptResume = useCallback(() => {
    const it = interruptedRef.current
    if (!it || !isPlayingRef.current) return
    reloadFromRef.current(it.url, it.ms, true) // 断网续播:本来就在播,恢复后自动继续
  }, [])
  // 有效码率:省流模式强制最低,否则用用户选的音质
  const effectiveLevel = () => (lowDataRef.current ? LOW_LEVEL : loadQuality())
  // 换音质/切省流:以新码率重新取地址,从当前位置续播(不从头重来)
  const applyQualityChange = useCallback(() => {
    const id = curIdRef.current
    if (id < 0) return
    const pos = playedRef.current
    interruptedRef.current = null; setNetInterrupted(false); stallCountRef.current = 0 // 换档重新观察,别带着切档前的卡顿计数
    getSongUrl(id, effectiveLevel()).then((r) => {
      if (id !== curIdRef.current) return
      if (r.url) { curUrlRef.current = r.url; reloadFromRef.current(r.url, pos, isPlayingRef.current, r) } // 暂停时换音质不自动播
    }).catch(() => {})
  }, [])
  // 手动开关省流(UI 用):写 localStorage、跨重启保留,并清掉"自动"标记(手动优先)
  const setLowData = useCallback((v: boolean) => {
    lowDataRef.current = v; setLowDataState(v); lowDataAutoRef.current = false
    saveLowData(v)
    applyQualityChange()
  }, [applyQualityChange])
  // 弱网自动降档(会话级,不写 localStorage):当前曲正卡,立即降码率从断点续播救场
  const enterLowDataAuto = useCallback(() => {
    lowDataRef.current = true; setLowDataState(true); lowDataAutoRef.current = true
    applyQualityChange()
  }, [applyQualityChange])
  // 网络转好自动升回:只改状态,不打断当前播放——当前曲省流放完,下一首自然恢复音质
  const exitLowDataAuto = useCallback(() => {
    lowDataRef.current = false; setLowDataState(false); lowDataAutoRef.current = false
    stallCountRef.current = 0
  }, [])

  // 持久化:队列/顺序/位置/设置/音量变化时写入(不含播放进度)
  useEffect(() => {
    savePersisted({ queue: state.queue, order: state.order, pos: state.pos, shuffle: state.shuffle, repeat: state.repeat, radar: state.radar, volume })
  }, [state.queue, state.order, state.pos, state.shuffle, state.repeat, state.radar, volume])

  // 取播放地址(关键)与歌词(尽力而为,失败不连累播放)
  useEffect(() => {
    if (!current) return
    diagnostic('track.load', { song: current.id, token: state.playToken })
    interruptedRef.current = null; setNetInterrupted(false); playedRef.current = 0; stallCountRef.current = 0; curIdRef.current = current.id // 换曲:清掉上一首的断网/卡顿状态
    flushListen() // 上一首(含单曲循环的上一遍)听够了就上报
    listenRef.current = { id: current.id, sourceId: current.albumId, ms: 0, durMs: 0 }; lastTickRef.current = 0
    let cancelled = false
    ;(async () => {
      // 复用预取的地址，但始终在原音频元素上播放，避免后台启用第二个元素。
      const pre = preloadedRef.current
      if (pre && pre.id === current.id && pre.level === effectiveLevel()) {
        load(pre.url, pre.gain)
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
      // 取地址:当前音质取不到音源(url=null,如网易缺该档无损/Hi-Res 源)时,自动逐级降档找有源的,别直接判"放不出"
      const want = effectiveLevel()
      let url: string | null = null
      let gain: ReplayGain | undefined
      let usedLevel = want
      try {
        for (const lv of levelsAtOrBelow(want)) {
          const r = await getSongUrl(current.id, lv)
          diagnostic('track.url', { song: current.id, level: lv, available: !!r.url, cancelled })
          if (cancelled) return
          if (r.url) { url = r.url; gain = r; usedLevel = lv; break }
        }
      } catch {
        diagnostic('track.url-failed', { song: current.id, cancelled })
        // 取地址失败(已内部超时+重试仍不通)= 网络问题,不是这首歌的问题。别逐首跳,提示后停下(return 不前进)等用户重试。
        if (!cancelled && isPlayingRef.current) toast('网络不好,加载失败,请稍后重试')
        return
      }
      if (cancelled) return
      if (url) {
        curUrlRef.current = url
        loadedOkRef.current = true
        skipRef.current = 0
        if (usedLevel !== want) toast(`这首无「${qualityName(want)}」音源,已用${qualityName(usedLevel)}播放`) // 降档告知
        load(url, gain)
        if (isPlayingRef.current) { requestWakeLock(); play().catch(() => {}) }
      } else {
        // 降到最低档仍拿不到地址 → 这首真放不出,跳过
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

  // 累计收听时长:只认正常播放的小步前进(<3s),拖动进度/换曲时的跳变不计
  useEffect(() => {
    const l = listenRef.current
    const d = currentMs - lastTickRef.current
    lastTickRef.current = currentMs
    if (!l || !isPlayingRef.current || l.id !== curIdRef.current) return
    if (d > 0 && d < 3000) l.ms += d
    if (durationMs > 0) l.durMs = durationMs
  }, [currentMs, durationMs])
  useEffect(() => {
    const onHide = () => flushListen(true)
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flushListen])

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
  // 弱网自动降音质(会话级):在线播放中当前曲反复卡顿(≥2次)→ 自动开省流,当前曲以低码率从断点续播
  useEffect(() => {
    if (stallSeq === 0 || !navigator.onLine) return // 初始;离线是断网续播的事,降码率无济于事
    lastStallAtRef.current = Date.now() // 每次真·卡顿都记下(即便已在省流,用于推迟"升回")
    if (!isPlayingRef.current || lowDataRef.current) return
    stallCountRef.current += 1
    if (stallCountRef.current >= 2) {
      stallCountRef.current = 0
      toast('网络较差,已自动切到省流音质')
      enterLowDataAuto()
    }
  }, [stallSeq]) // eslint-disable-line react-hooks/exhaustive-deps
  // 网络转好自动升回:仅针对"自动降档"(手动开的省流不动),稳定 RECOVER_AFTER_MS 不卡且在线播放中 → 升回
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!lowDataAutoRef.current || !isPlayingRef.current || !navigator.onLine) return
      if (Date.now() - lastStallAtRef.current < RECOVER_AFTER_MS) return
      toast('网络已恢复,音质自动升回')
      exitLowDataAuto()
    }, 5000)
    return () => window.clearInterval(t)
  }, [exitLowDataAuto])

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

  // 提前取下一首地址，减少后台续播的请求等待；不预载第二个音频元素。
  useEffect(() => {
    if (!state.isPlaying || durationMs <= 0) return
    if (preloadTokenRef.current === state.playToken) return // 每首只预载一次
    if (currentMs < 5000) return // 播了几秒(用户大概率会继续听)后再预载,给当前曲的缓冲让路
    preloadTokenRef.current = state.playToken
    const np = nextIndex(state.order.length, state.pos, state.repeat)
    if (np < 0 || np === state.pos) return // 无下一首 / 单曲循环
    const nextSong = state.queue[state.order[np]]
    if (!nextSong || preloadedRef.current?.id === nextSong.id) return
    const token = state.playToken, level = effectiveLevel()
    getSongUrl(nextSong.id, level).then((r) => {
      if (!r.url || preloadTokenRef.current !== token || curIdRef.current !== current?.id) return
      preloadedRef.current = { id: nextSong.id, url: r.url, gain: r, level }
    }).catch(() => {})
  }, [currentMs, durationMs, state.isPlaying, state.playToken, state.pos, state.order, state.queue, state.repeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session 媒体键:只注册一次,逐个 try/catch —— 某个动作在车机内核不支持而抛错时,
  // 不会中断后面动作的注册(此前 prev/next 就是被中途抛错拖累而未注册、按键变灰)。
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try { ms.setActionHandler(action, details => { diagnostic('media.action', { action }); handler(details) }) } catch { /* 该动作不支持则跳过 */ }
    }
    set('play', () => { if (!isPlayingRef.current) dispatch({ type: 'toggle' }) })
    set('pause', () => { if (isPlayingRef.current) dispatch({ type: 'toggle' }) })
    set('previoustrack', () => dispatch({ type: 'prev' }))
    set('nexttrack', () => dispatch({ type: 'next' }))
    set('seekto', (d) => { if (d.seekTime != null) seekRef.current(d.seekTime * 1000) })
  }, [])

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
  // 手动选具体音质:关掉省流模式,以新码率从当前位置续播
  const setQuality = useCallback((id: string) => {
    setQualityState(id); saveQuality(id)
    if (lowDataRef.current) { lowDataRef.current = false; setLowDataState(false); lowDataAutoRef.current = false; saveLowData(false) }
    applyQualityChange()
  }, [applyQualityChange])

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
    ...state, normalize, setNormalize: setNormalizeStable, current, volume, queueSongs, quality, setQuality, lowData, setLowData,
    isLiked, toggleLike,
    jumpTo: (pos) => dispatch({ type: 'jumpTo', pos }),
    removeAt: (pos) => dispatch({ type: 'removeAt', pos }),
    enqueueNext: (song) => { dispatch({ type: 'enqueueNext', song }); toast('已设为下一首') },
    enqueue: (song) => { dispatch({ type: 'enqueue', song }); toast('已加入队列') },
    trashFm: () => {
      if (!state.radar || !current) return
      listenRef.current = null // 不喜欢的歌不记入听歌记录
      dispatch({ type: 'next' })
      fmTrash(current.id).then(() => toast('已减少此类推荐')).catch(() => toast('操作失败,请稍后再试'))
    },
    playList: (songs, start) => dispatch({ type: 'playList', songs, start }),
    startRadar: () => { getPersonalFm().then((songs) => { if (songs.length) dispatch({ type: 'startRadar', songs }) }).catch(() => {}) },
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    seek: seekStable, setVolume: setVolumeStable,
    setShuffle: (on) => dispatch({ type: 'setShuffle', on }),
    cycleRepeat: () => dispatch({ type: 'cycleRepeat' }),
  }), [state, normalize, setNormalizeStable, current, volume, queueSongs, quality, setQuality, lowData, setLowData, isLiked, toggleLike, seekStable, setVolumeStable])

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
