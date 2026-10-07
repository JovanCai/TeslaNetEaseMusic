import { randomChinaIP } from './cnip.js'

// 只放行前端实际用到的接口。代理会注入登录态,不设白名单的话拿到地址的人可以调任意接口(退出登录、改资料、发评论等)。
export const ALLOWED_PATHS = new Set([
  '/song/url/v1', '/lyric', '/login/status',
  '/recommend/songs', '/personal_fm', '/fm_trash', '/scrobble',
  '/playlist/track/all', '/user/playlist', '/personalized', '/toplist',
  '/cloudsearch', '/search/suggest',
  '/likelist', '/like', '/album', '/artists',
  '/dj/sublist', '/dj/recommend', '/dj/program',
])

export function apiProxy({ ncmBase, store, regionUnlock = false, allowed = ALLOWED_PATHS }) {
  return async (req, res) => {
    if (!allowed.has(req.path)) return res.status(403).json({ error: 'forbidden', path: req.path })
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
