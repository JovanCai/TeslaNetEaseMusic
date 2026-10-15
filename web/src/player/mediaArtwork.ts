import { diagnostic, mediaFingerprint } from './diagnostics'

// 同一张封面的几个等价尺寸(网易云 CDN 按 param 缩放)。纠正时轮换使用,保证每次提交的 URL 都不同。
const VARIANTS = ['512y512', '500y500', '480y480']
// 换曲后的纠正时刻:起播后 5s 一次,弱网下旧封面下得慢,20s 再兜底一次
const RETRY_DELAYS = [5000, 20000]

// A page image probe is not an acknowledgement from the system media card.
// Always give the browser the new artwork immediately, including in background.
//
// 为什么纠正时必须换 URL:Chromium 收到与当前完全相同的 metadata/artwork 会直接忽略(不通知车机卡片),
// 而且换曲时不会取消上一首还在下载的封面——上一首的图晚到就会盖掉新封面,之后原样重发也纠正不回来。
// 换一个等价尺寸的 URL,Chromium 会当作封面变了重新下载,最后一次下载一定是当前歌曲的。
export function createArtworkPublisher(song: { id: number; name: string; artist: string; cover: string }) {
  let disposed = false
  let started = false
  let artwork: MediaImage[] = []
  let image: HTMLImageElement | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let retries: ReturnType<typeof setTimeout>[] = []
  let resized: URL | undefined // 可换尺寸的封面地址;降级用原图后为 undefined(原图不保证支持缩放参数)
  let variant = 0
  const title = song.artist ? `${song.name} · ${song.artist}` : song.name
  const publish = (reason: string) => {
    if (disposed || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: song.artist, album: song.artist, artwork })
      diagnostic('metadata.set', { song: song.id, reason, cover: mediaFingerprint(song.cover), submitted: mediaFingerprint(artwork[0]?.src ?? '') })
    } catch { diagnostic('metadata.failed', { song: song.id, reason }) }
  }
  const variantSrc = (n: number) => {
    const u = new URL(resized!.href)
    u.searchParams.set('param', VARIANTS[n % VARIANTS.length])
    return u.href
  }
  // 换成下一个等价尺寸再提交,强制浏览器重新下载当前封面
  const refresh = (reason: string) => {
    if (resized) artwork = [{ src: variantSrc(++variant) }]
    publish(reason)
  }
  const clearRetries = () => { retries.forEach(clearTimeout); retries = [] }
  const scheduleRetry = () => {
    clearRetries()
    // Leave the browser time to download artwork. Reassigning metadata on every
    // immediate playing/image event can cancel an in-flight native image fetch.
    retries = RETRY_DELAYS.map((ms) => setTimeout(() => refresh('artwork-retry'), ms))
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') { refresh('visible'); scheduleRetry() }
  }
  const load = (url: string, fallback?: string) => {
    image = new Image()
    const candidate = image
    let settled = false
    const finish = (ok: boolean) => {
      if (settled || disposed) return
      settled = true
      clearTimeout(timeout)
      candidate.onload = candidate.onerror = null
      diagnostic(ok ? 'artwork.loaded' : 'artwork.failed', { song: song.id, source: mediaFingerprint(url), width: candidate.naturalWidth, height: candidate.naturalHeight })
      if (!ok && fallback) {
        // Keep a real URL submitted even if neither page probe completes.
        resized = undefined
        artwork = [{ src: fallback }]
        publish('artwork-fallback')
        load(fallback)
        scheduleRetry()
      }
      // Success needs no immediate re-publication: the system already has this
      // URL. Failure must not erase it or gate the browser's own image request.
    }
    candidate.onload = () => finish(candidate.naturalWidth > 0 && candidate.naturalHeight > 0)
    candidate.onerror = () => finish(false)
    timeout = setTimeout(() => finish(false), 8000)
    candidate.src = url
  }
  return {
    sync() {
      if (disposed) return
      document.title = `${song.name} - ${song.artist}`
      if (started) { scheduleRetry(); return }
      started = true
      let probe: { url: string; fallback?: string } | undefined
      if (song.cover) {
        try {
          const original = new URL(song.cover, document.baseURI)
          if (original.protocol === 'http:') original.protocol = 'https:'
          resized = new URL(original.href)
          resized.searchParams.set('param', VARIANTS[0])
          artwork = [{ src: resized.href }]
          probe = { url: resized.href, fallback: resized.href !== original.href ? original.href : undefined }
        } catch { diagnostic('artwork.invalid', { song: song.id }) }
      }
      publish('track-change')
      document.addEventListener('visibilitychange', onVisible)
      scheduleRetry()
      if (probe && 'mediaSession' in navigator) load(probe.url, probe.fallback)
    },
    dispose() {
      disposed = true
      clearTimeout(timeout); clearRetries()
      document.removeEventListener('visibilitychange', onVisible)
      if (image) image.onload = image.onerror = null
    },
  }
}
