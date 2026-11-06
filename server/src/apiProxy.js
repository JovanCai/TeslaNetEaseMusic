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

// 网易云接口服务会识别这些查询参数,改变它发请求的方式:proxy 让请求走任意代理、cookie 替换登录态、
// realIP/randomCNIP 伪造来源 IP、ua 换 UA。前端从不传它们,一律去掉(区域解锁的 realIP 由下面服务端自己加)。
const STRIPPED_PARAMS = ['proxy', 'cookie', 'realIP', 'randomCNIP', 'ua']

export function apiProxy({ ncmBase, store, regionUnlock = false, allowed = ALLOWED_PATHS }) {
  return async (req, res) => {
    if (!allowed.has(req.path)) return res.status(403).json({ error: 'forbidden', path: req.path })
    const cookie = store.read()
    const headers = {}
    if (cookie) headers.Cookie = `MUSIC_U=${cookie}`
    const params = new URL(req.originalUrl, 'http://local').searchParams
    for (const key of [...params.keys()]) if (STRIPPED_PARAMS.includes(key)) params.delete(key)
    if (regionUnlock) params.set('realIP', randomChinaIP())
    const qs = params.toString()
    const url = `${ncmBase}${req.path}${qs ? `?${qs}` : ''}`
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
