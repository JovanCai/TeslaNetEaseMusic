import { diagnostic, mediaFingerprint } from './diagnostics'

// Image loading and platform artwork updates happen asynchronously. Keep a
// publisher per track so a late image result cannot restore the previous cover.
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
      if (!ok) { if (fallback) load(fallback); return }
      artwork = [{ src: url, sizes: `${candidate.naturalWidth}x${candidate.naturalHeight}` }]
      publish('artwork-ready')
      // A bounded retry gives the platform time to adopt the new audio element.
      retry = setTimeout(() => publish('artwork-retry'), 1000)
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
      if (started) { publish('playing'); return }
      started = true
      // Publish the new title without artwork first, explicitly removing old art.
      publish('track-change')
      if (!song.cover || !('mediaSession' in navigator)) return
      try {
        const original = new URL(song.cover, document.baseURI)
        if (original.protocol === 'http:') original.protocol = 'https:'
        const resized = new URL(original.href)
        resized.searchParams.set('param', '512y512')
        load(resized.href, resized.href !== original.href ? original.href : undefined)
      } catch { diagnostic('artwork.invalid', { song: song.id }) }
    },
    dispose() {
      disposed = true
      clearTimeout(timeout); clearTimeout(retry)
      if (image) image.onload = image.onerror = null
    },
  }
}
