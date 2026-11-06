import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextIndex } from './queue'
import { playerReducer, initialPlayerState, curQueueIndex } from './playerReducer'
import { Ctx, ProgressCtx, type PlayerValue } from './usePlayer'
import { getSongUrl, getLyric, getPersonalFm, getLikedIds, setLike, getLoginStatus, scrobble, fmTrash } from '../api'
import { useAudio, audioSnapshot } from './useAudio'
import { diagnostic, diagnosticSnapshot, connectionInfo, mediaFingerprint } from './diagnostics'
import type { ReplayGain } from './normalization'
import { createArtworkPublisher } from './mediaArtwork'
import { requestWakeLock } from './wakeLock'
import { loadPersisted, savePersisted } from './persist'
import { toast } from '../ui/toast'
import { loadQuality, saveQuality, loadLowData, saveLowData, LOW_LEVEL, levelsAtOrBelow, qualityName } from '../ui/quality'

const RECOVER_AFTER_MS = 90_000 // 自动降档后,稳定这么久不卡 → 自动升回音质
const RESCUE_AFTER_MS = 10_000  // 播放中持续缓冲这么久 → 当前曲立刻降码率救场

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
  const curLevelRef = useRef('')     // 当前曲实际在用的音质(可能因无源降档、省流而不同于设置)
  const loadingRef = useRef(false)   // 正在为当前曲取地址
  const loadFailedRef = useRef(false) // 当前曲取地址失败(网络问题):恢复后自动重试,而不是停在那里
  const resumingRef = useRef(false)  // 断网续播:正在换新地址,避免定时器叠加请求
  const earlyEndRef = useRef<number | null>(null) // 上次"提前结束"的位置:同一位置再次提前结束说明是时长估算偏差,别无限重试
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
    diagnostic('queue.ended', { posMs: Math.round(posMs), durMs: Math.round(durMs) })
    if (durMs > 0 && posMs < durMs - 3000 && curUrlRef.current) {
      // 从同一位置续播后又在原处"结束":文件其实放完了(时长估算偏大),当作曲终,否则会每 6 秒重试一次永远卡住
      if (earlyEndRef.current != null && Math.abs(earlyEndRef.current - posMs) < 2000) {
        earlyEndRef.current = null
        diagnostic('queue.early-end-accepted', { posMs: Math.round(posMs) })
      } else {
        earlyEndRef.current = posMs
        interruptedRef.current = { url: curUrlRef.current, ms: posMs }
        setNetInterrupted(true)
        return
      }
    }
    dispatch({ type: 'ended' })
  }, [])

  const handleError = useCallback((e: MediaError | null, posMs: number) => {
    diagnostic('audio.error-handled', { code: e?.code ?? 0, posMs: Math.round(posMs), interrupted: !!interruptedRef.current })
    if (interruptedRef.current) return // 已在中断/重连中:继续等,别跳
    // 网络类错误(code 2 或未知)= 不是这首歌的问题;中途断网(已播 >1.5s)同理 → 保住这首,等恢复续播,别跳
    // 断点用元素的实时位置:后台时 React 里的进度会落后好几秒
    const networkish = e == null || e.code === 2
    if (curUrlRef.current && (networkish || posMs > 1500)) {
      interruptedRef.current = { url: curUrlRef.current, ms: posMs }
      pauseRef.current()
      setNetInterrupted(true)
      toast(posMs > 1500 ? '网络中断,恢复后自动继续' : '网络不好,恢复后重试')
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
  const { normalize, setNormalize, load, play, pause, seek, setVolume, reloadFrom, holdForSwitch, positionMs, element, currentMs, durationMs, bufferedMs, stalled, stallSeq, volume } = useAudio(handleEnded, handleError, boot?.volume ?? 1, syncMediaMetadata, handlePlayRejected)
  playedRef.current = currentMs
  pauseRef.current = pause
  const seekRef = useRef(seek); seekRef.current = seek
  const normRef = useRef(setNormalize); normRef.current = setNormalize
  const setNormalizeStable = useCallback((v: boolean) => normRef.current(v), [])
  const setVolRef = useRef(setVolume); setVolRef.current = setVolume
  const reloadFromRef = useRef(reloadFrom); reloadFromRef.current = reloadFrom
  const positionRef = useRef(positionMs); positionRef.current = positionMs
  const seekStable = useCallback((ms: number) => seekRef.current(ms), [])
  const setVolumeStable = useCallback((v: number) => setVolRef.current(v), [])
  // 有效码率:省流模式强制最低,否则用用户选的音质
  const effectiveLevel = () => (lowDataRef.current ? LOW_LEVEL : loadQuality())
  // 断网续播:网络恢复(online 事件/定时重试/按播放)时,重载并 seek 回断点续播
  const attemptResume = useCallback(() => {
    if (!isPlayingRef.current) return
    if (loadFailedRef.current) { // 取地址就失败了:整首重新加载
      if (loadingRef.current) return
      loadFailedRef.current = false
      diagnostic('resume.reload-track', connectionInfo())
      dispatch({ type: 'reload' })
      return
    }
    const it = interruptedRef.current
    if (!it || resumingRef.current) return
    resumingRef.current = true
    const id = curIdRef.current
    diagnostic('resume.attempt', { song: id, ms: Math.round(it.ms), ...connectionInfo() })
    // 网易云播放地址有时效,长时间断网后旧地址会被拒(403),一直重试旧地址永远续不上:先换新地址,取不到再用旧的试
    getSongUrl(id, curLevelRef.current || effectiveLevel(), { timeout: 6000, retries: 0 })
      .then((r) => (r.url ? { url: r.url, gain: r as ReplayGain, fresh: true } : null))
      .catch(() => null)
      .then((fresh) => {
        resumingRef.current = false
        if (id !== curIdRef.current || interruptedRef.current !== it || !isPlayingRef.current) return
        const url = fresh?.url ?? it.url
        diagnostic('resume.reload', { song: id, ms: Math.round(it.ms), fresh: !!fresh })
        curUrlRef.current = url
        interruptedRef.current = { url, ms: it.ms }
        reloadFromRef.current(url, it.ms, true, fresh?.gain) // 断网续播:本来就在播,恢复后自动继续
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 换音质/切省流:以新码率重新取地址,从当前位置续播(不从头重来)
  const applyQualityChange = useCallback(() => {
    const id = curIdRef.current
    if (id < 0) return
    stallCountRef.current = 0 // 换档重新观察,别带着切档前的卡顿计数
    const level = effectiveLevel()
    getSongUrl(id, level).then((r) => {
      if (id !== curIdRef.current || !r.url) return
      // 位置在拿到新地址这一刻再取:弱网下取地址要好几秒,期间歌还在放,用发起时的位置会倒回去重放
      const pos = interruptedRef.current?.ms ?? positionRef.current()
      interruptedRef.current = null; setNetInterrupted(false)
      curUrlRef.current = r.url; curLevelRef.current = level
      diagnostic('quality.switch', { song: id, level, pos: Math.round(pos) })
      reloadFromRef.current(r.url, pos, isPlayingRef.current, r) // 暂停时换音质不自动播
    }).catch(() => {}) // 失败:保持原状(断网中的断点也保留,恢复后照常续播)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 手动开关省流(UI 用):写 localStorage、跨重启保留,并清掉"自动"标记(手动优先)
  const setLowData = useCallback((v: boolean) => {
    lowDataRef.current = v; setLowDataState(v); lowDataAutoRef.current = false
    saveLowData(v)
    applyQualityChange()
  }, [applyQualityChange])
  // 弱网自动降档(会话级,不写 localStorage)。默认只从下一首起生效:当前曲中途换成另一个码率的文件再跳转,
  // 跳转落点可能与实际声音错开(歌词随之错位)。只有当前曲真的卡死(见下方救场)才立刻换。
  const enterLowDataAuto = useCallback((switchNow: boolean) => {
    lowDataRef.current = true; setLowDataState(true); lowDataAutoRef.current = true
    diagnostic('lowdata.auto', { switchNow, ...connectionInfo() })
    preloadTokenRef.current = -1 // 已预取的下一首是高码率地址:按省流码率重新预取
    if (switchNow) applyQualityChange()
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
    const switching = curIdRef.current !== current.id // 换了一首(而不是单曲循环/重试同一首)
    diagnostic('track.load', { song: current.id, token: state.playToken, switching, ...connectionInfo() })
    interruptedRef.current = null; setNetInterrupted(false); playedRef.current = 0; stallCountRef.current = 0; curIdRef.current = current.id // 换曲:清掉上一首的断网/卡顿状态
    loadFailedRef.current = false; loadingRef.current = false; earlyEndRef.current = null; resumingRef.current = false
    flushListen() // 上一首(含单曲循环的上一遍)听够了就上报
    listenRef.current = { id: current.id, sourceId: current.albumId, ms: 0, durMs: 0 }; lastTickRef.current = 0
    let cancelled = false
    // 歌词单独取:超时/失败只是没歌词,不该把能播的歌当成播不了跳掉;弱网下失败了 5 秒后再试一次
    const fetchLyric = (attempt: number) => {
      getLyric(current.id)
        .then((lyric) => { if (!cancelled) dispatch({ type: 'setLrc', lrc: lyric.lrc, tlyric: lyric.tlyric, pureMusic: lyric.pureMusic }) })
        .catch(() => {
          diagnostic('lyric.failed', { song: current.id, attempt })
          if (cancelled) return
          if (attempt === 0) window.setTimeout(() => { if (!cancelled) fetchLyric(1) }, 5000)
          else dispatch({ type: 'setLrc', lrc: '', tlyric: '', pureMusic: false })
        })
    }
    ;(async () => {
      // 复用预取的地址，但始终在原音频元素上播放，避免后台启用第二个元素。
      const pre = preloadedRef.current
      if (pre && pre.id === current.id && pre.level === effectiveLevel()) {
        load(pre.url, pre.gain)
        preloadedRef.current = null
        curUrlRef.current = pre.url; curLevelRef.current = pre.level
        loadedOkRef.current = true
        skipRef.current = 0
        if (isPlayingRef.current) { requestWakeLock(); play().catch(() => {}) }
        fetchLyric(0)
        return
      }
      // 没有现成地址要现取:先停掉上一首。弱网下取地址要好几秒,旧歌继续放的话,新歌词会按旧歌的时间滚动
      if (switching) holdForSwitch()
      loadingRef.current = true
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
        if (!cancelled) loadingRef.current = false
        diagnostic('track.url-failed', { song: current.id, cancelled, ...connectionInfo() })
        // 取地址失败(已内部超时+重试仍不通)= 网络问题,不是这首歌的问题。别逐首跳;
        // 标记为待重试,网络恢复(online 事件 / 每 6 秒)自动重新加载这首
        if (!cancelled) {
          loadFailedRef.current = true
          setNetInterrupted(true)
          if (isPlayingRef.current) toast('网络不好,加载失败,恢复后自动重试')
        }
        return
      }
      if (cancelled) return
      loadingRef.current = false
      if (url) {
        curUrlRef.current = url; curLevelRef.current = usedLevel
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
      fetchLyric(0)
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
      if (interruptedRef.current || loadFailedRef.current) attemptResume() // 断网中/取地址失败后按播放:立刻重试
      else if (loadingRef.current) return // 地址还在取:取到后会自动开播。此时元素里还是上一首,不能直接 play
      else if (loadedOkRef.current) play().catch(() => {})
      else advanceAfterUnplayable() // 按播放时当前曲不可用(如恢复态遇到下架歌)→ 跳到能播的
    } else pause()
  }, [state.isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // 诊断:记录期间每 10 秒采样一次播放与网络状态(不记录时不做任何事)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!diagnosticSnapshot().recording) return
      diagnostic('sample', { song: curIdRef.current, playing: isPlayingRef.current, level: curLevelRef.current, lowData: lowDataRef.current, interrupted: !!interruptedRef.current, loadFailed: loadFailedRef.current, ...audioSnapshot(element), ...connectionInfo() })
    }, 10_000)
    return () => window.clearInterval(t)
  }, [element])

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
  // 弱网自动降音质(会话级):在线播放中当前曲反复卡顿(≥2次)→ 自动开省流,下一首起生效
  useEffect(() => {
    if (stallSeq === 0 || !navigator.onLine) return // 初始;离线是断网续播的事,降码率无济于事
    lastStallAtRef.current = Date.now() // 每次真·卡顿都记下(即便已在省流,用于推迟"升回")
    diagnostic('net.stall', { song: curIdRef.current, count: stallCountRef.current + 1, level: curLevelRef.current, ...audioSnapshot(element), ...connectionInfo() })
    if (!isPlayingRef.current || lowDataRef.current) return
    stallCountRef.current += 1
    if (stallCountRef.current >= 2) {
      stallCountRef.current = 0
      toast('网络较差,下一首起用省流音质')
      enterLowDataAuto(false)
    }
  }, [stallSeq]) // eslint-disable-line react-hooks/exhaustive-deps
  // 救场:播放中缓冲超过 10 秒仍没恢复(真卡死了)→ 当前曲立刻换省流码率,从当前位置续播
  useEffect(() => {
    if (!stalled || netInterrupted) return
    const t = window.setTimeout(() => {
      if (!isPlayingRef.current || !navigator.onLine || interruptedRef.current || loadingRef.current) return
      if (curLevelRef.current === LOW_LEVEL) return // 已经是最低码率,换了也没用
      diagnostic('net.rescue', { song: curIdRef.current, level: curLevelRef.current, ...audioSnapshot(element), ...connectionInfo() })
      toast('缓冲太久,已切到省流音质')
      if (!lowDataRef.current) enterLowDataAuto(true)
      else applyQualityChange()
    }, RESCUE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [stalled, netInterrupted]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const token = state.playToken, level = effectiveLevel()
    if (!nextSong || (preloadedRef.current?.id === nextSong.id && preloadedRef.current.level === level)) return
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
