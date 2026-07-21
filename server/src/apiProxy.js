export function apiProxy({ ncmBase, store }) {
  return async (req, res) => {
    const cookie = store.read()
    const headers = {}
    if (cookie) headers.Cookie = `MUSIC_U=${cookie}`
    try {
      const upstream = await fetch(`${ncmBase}${req.url}`, { headers })
      const body = await upstream.text()
      res.status(upstream.status)
      res.set('content-type', upstream.headers.get('content-type') || 'application/json')
      res.send(body)
    } catch (e) {
      res.status(502).json({ error: 'upstream', detail: String(e) })
    }
  }
}
