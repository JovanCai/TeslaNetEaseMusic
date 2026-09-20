import { diagnostic, mediaFingerprint } from './diagnostics'

// A page image probe is not an acknowledgement from the system media card.
// Always give the browser the new artwork immediately, including in background.
export function createArtworkPublisher(song: { id: number; name: string; artist: string; cover: string }) {
  let disposed = false
  let started = false
  let artwork: MediaImage[] = []
  let image: HTMLImageElement | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  const title = song.artist ? `${song.name} · ${song.artist}` : song.name
  const publish = (reason: string) => {
    if (disposed || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: song.artist, album: song.artist, artwork })
      diagnostic('metadata.set', { song: song.id, reason, cover: mediaFingerprint(song.cover), submitted: mediaFingerprint(artwork[0]?.src ?? '') })
    } catch { diagnostic('metadata.failed', { song: song.id, reason }) }
  }
  const scheduleRetry = () => {
    clearTimeout(retry)
    // Leave the browser time to download artwork. Reassigning metadata on every
    // immediate playing/image event can cancel an in-flight native image fetch.
    retry = setTimeout(() => publish('artwork-retry'), 5000)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') { publish('visible'); scheduleRetry() }
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
          const resized = new URL(original.href)
          resized.searchParams.set('param', '512y512')
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
      clearTimeout(timeout); clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisible)
      if (image) image.onload = image.onerror = null
    },
  }
}
