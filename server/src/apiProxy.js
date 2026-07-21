import { randomChinaIP } from './cnip.js'

export function apiProxy({ ncmBase, store, regionUnlock = false }) {
  return async (req, res) => {
    const cookie = store.read()
    const headers = {}
    if (cookie) headers.Cookie = `MUSIC_U=${cookie}`
    let url = `${ncmBase}${req.url}`
    if (regionUnlock) {
      url += (url.includes('?') ? '&' : '?') + 'realIP=' + randomChinaIP()
    }
    try {
      const upstream = await fetch(url, { headers })
      const body = await upstream.text()
      res.status(upstream.status)
      res.set('content-type', upstream.headers.get('content-type') || 'application/json')
      res.send(body)
    } catch (e) {
      res.status(502).json({ error: 'upstream', detail: String(e) })
    }
  }
}
