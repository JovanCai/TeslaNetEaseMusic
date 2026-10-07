import type { ReplayGain } from './player/normalization'
const BASE = '/api'

// 统一请求:加超时(默认 8s,弱网下不会无限转圈)与失败退避重试(默认 2 次)。
// 关键:闲置后后端到网易的连接会冷掉,第一发常失败;重试能自愈,避免上层把"暂时取不到"误判成"这首播不了"直接跳歌。
// 设置了访问密码而未通过时,后端返回 401:广播给 App 切到输密码界面,且不重试。
export const AUTH_REQUIRED_EVENT = 'tm-auth-required'
export class AuthRequiredError extends Error {}

async function fetchJson(path: string, { timeout = 8000, retries = 2 } = {}): Promise<any> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const r = await fetch(`${BASE}${path}`, { signal: ctrl.signal })
      if (r.status === 401) { window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT)); throw new AuthRequiredError(path) }
      if (!r.ok) throw new Error(`${path} ${r.status}`)
      return await r.json()
    } catch (e) {
      lastErr = e
      if (e instanceof AuthRequiredError) break
      if (attempt < retries) await new Promise((res) => setTimeout(res, 500 * (attempt + 1))) // 退避 0.5s / 1s
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

export async function getSongUrl(id: number, level = 'exhigh'): Promise<{ id: number; url: string | null } & ReplayGain> {
  // 区域解锁(realIP)由后端按需自动注入,前端无需传参。
  const j: any = await fetchJson(`/song/url/v1?id=${id}&level=${level}`)
  const raw: string | null = j?.data?.[0]?.url ?? null
  // 网易云常返回 http:// 地址;车机走 https 时 http 音频会被当混合内容拦掉,统一升级为 https。
  return { id, url: raw ? raw.replace(/^http:\/\//, 'https://') : null,
    ...(typeof j?.data?.[0]?.gain === 'number' && Number.isFinite(j.data[0].gain) ? { gain: j.data[0].gain } : {}),
    ...(typeof j?.data?.[0]?.peak === 'number' && Number.isFinite(j.data[0].peak) ? { peak: j.data[0].peak } : {}),
  }
}

export async function getLyric(id: number): Promise<{ lrc: string; tlyric: string; pureMusic: boolean }> {
  const j: any = await fetchJson(`/lyric?id=${id}`)
  return { lrc: j?.lrc?.lyric ?? '', tlyric: j?.tlyric?.lyric ?? '', pureMusic: !!j?.pureMusic }
}

export interface Song { id: number; name: string; artist: string; cover: string; albumId: number; artistId: number }

// 网易云封面常返回 http://,车机走 https 时会被混合内容拦掉,统一升级为 https。
const toHttps = (u: string) => u.replace(/^http:\/\//, 'https://')

function toSong(r: any): Song {
  const ar = r.ar ?? r.artists ?? []
  const al = r.al ?? r.album ?? {}
  return { id: r.id, name: r.name, artist: ar[0]?.name ?? '', cover: toHttps(al.picUrl ?? ''), albumId: al.id ?? 0, artistId: ar[0]?.id ?? 0 }
}

async function getJson(path: string): Promise<any> {
  return fetchJson(path) // 复用超时+重试;所有列表/搜索/歌单请求一并获得弱网韧性
}

export async function getDailySongs(): Promise<Song[]> {
  const j = await getJson('/recommend/songs')
  return (j?.data?.dailySongs ?? []).map(toSong)
}

export async function getPersonalFm(): Promise<Song[]> {
  const j = await getJson('/personal_fm')
  return (j?.data ?? []).map(toSong)
}

export async function getPlaylistTracks(id: number): Promise<Song[]> {
  const PAGE = 1000
  const all: Song[] = []
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const j = await getJson(`/playlist/track/all?id=${id}&limit=${PAGE}&offset=${offset}`)
    const songs = (j?.songs ?? []).map(toSong)
    all.push(...songs)
    if (songs.length < PAGE) break // 最后一页,取全了
  }
  return all
}

export async function search(keywords: string): Promise<Song[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&limit=30`)
  return (j?.result?.songs ?? []).map(toSong)
}

export interface Card { id: number; name: string; cover: string; sub: string }

// 搜索建议:边打字边联想。车机打字费劲,失败就不显示,不重试。
export async function searchSuggest(keywords: string): Promise<string[]> {
  const j = await fetchJson(`/search/suggest?keywords=${encodeURIComponent(keywords)}&type=mobile`, { timeout: 4000, retries: 0 })
  const words: string[] = (j?.result?.allMatch ?? []).map((m: any) => m?.keyword).filter((k: unknown) => typeof k === 'string' && k)
  return [...new Set(words)].slice(0, 8)
}

export async function searchAlbums(keywords: string): Promise<Card[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&type=10&limit=30`)
  return (j?.result?.albums ?? []).map((a: any) => ({ id: a.id, name: a.name, cover: toHttps(a.picUrl ?? ''), sub: a.artist?.name ?? '' }))
}
export async function searchArtists(keywords: string): Promise<Card[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&type=100&limit=30`)
  return (j?.result?.artists ?? []).map((a: any) => ({ id: a.id, name: a.name, cover: toHttps(a.picUrl ?? a.img1v1Url ?? ''), sub: '歌手' }))
}
export async function searchPlaylists(keywords: string): Promise<Card[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&type=1000&limit=30`)
  return (j?.result?.playlists ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: toHttps(p.coverImgUrl ?? ''), sub: `${p.trackCount ?? 0} 首` }))
}

export async function getUserPlaylists(uid: number): Promise<{ id: number; name: string; cover: string; count: number }[]> {
  const j = await getJson(`/user/playlist?uid=${uid}&limit=60`)
  return (j?.playlist ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: toHttps(p.coverImgUrl ?? ''), count: p.trackCount ?? 0 }))
}

function fmtCount(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4) return `${Math.round(n / 1e4)}万`
  return String(n ?? '')
}

// 推荐歌单
export async function getPersonalized(): Promise<Card[]> {
  const j = await getJson('/personalized?limit=12')
  return (j?.result ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: toHttps(p.picUrl ?? ''), sub: fmtCount(p.playCount) + ' 播放' }))
}
// 排行榜
export async function getToplists(): Promise<Card[]> {
  const j = await getJson('/toplist')
  return (j?.list ?? []).map((l: any) => ({ id: l.id, name: l.name, cover: toHttps(l.coverImgUrl ?? ''), sub: l.updateFrequency ?? '' }))
}

export async function getLoginStatus(): Promise<{ loggedIn: boolean; uid: number | null; nickname: string | null }> {
  const j = await getJson('/login/status')
  const prof = j?.data?.profile
  return { loggedIn: !!prof, uid: prof?.userId ?? null, nickname: prof?.nickname ?? null }
}

// 红心歌曲 ID 列表(“我喜欢的音乐”)
export async function getLikedIds(uid: number): Promise<number[]> {
  const j = await getJson(`/likelist?uid=${uid}`)
  return j?.ids ?? []
}

// 红心/取消红心一首歌。逻辑失败(HTTP 200 但 code!=200,如会话过期/需验证)也抛错,供上层回滚。
export async function setLike(id: number, like: boolean): Promise<void> {
  const j = await getJson(`/like?id=${id}&like=${like}&timestamp=${Date.now()}`)
  if (j?.code !== 200) throw new Error(`like ${j?.code}`)
}

// 专辑详情:名称、封面、曲目
export async function getAlbum(id: number): Promise<{ name: string; cover: string; songs: Song[] }> {
  const j = await getJson(`/album?id=${id}`)
  return {
    name: j?.album?.name ?? '',
    cover: toHttps(j?.album?.picUrl ?? ''),
    songs: (j?.songs ?? []).map(toSong),
  }
}

// 歌手详情:名称、封面、热门歌曲
export async function getArtist(id: number): Promise<{ name: string; cover: string; songs: Song[] }> {
  const j = await getJson(`/artists?id=${id}`)
  const a = j?.artist ?? {}
  return {
    name: a.name ?? '',
    cover: toHttps(a.picUrl ?? a.img1v1Url ?? ''),
    songs: (j?.hotSongs ?? []).map(toSong),
  }
}

// 听歌记录上报:回传网易云,进入「最近播放」/听歌排行,推荐也会参考。
// beacon=true 用于页面关闭时(sendBeacon 在卸载时也能发出去)。
export function scrobble(id: number, sourceId: number, seconds: number, beacon = false): void {
  const path = `/scrobble?id=${id}&sourceid=${sourceId}&time=${seconds}&timestamp=${Date.now()}`
  if (beacon && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(`${BASE}${path}`)) return
  fetchJson(path, { retries: 1 }).catch(() => {})
}

// 私人FM「不喜欢」:减少此类推荐
export async function fmTrash(id: number): Promise<void> {
  const j = await fetchJson(`/fm_trash?id=${id}&timestamp=${Date.now()}`, { retries: 1 })
  if (j?.code !== 200) throw new Error(`fm_trash ${j?.code}`)
}

// 播客 / 有声书(网易云电台)
const radioCard = (r: any): Card => ({ id: r.id, name: r.name, cover: toHttps(r.picUrl ?? r.intervenePicUrl ?? ''), sub: r.programCount ? `${r.programCount} 期` : (r.dj?.nickname ?? '') })

export async function getMyRadios(): Promise<Card[]> {
  const j = await getJson('/dj/sublist?limit=60')
  return (j?.djRadios ?? []).map(radioCard)
}
export async function getRecommendRadios(): Promise<Card[]> {
  const j = await getJson('/dj/recommend')
  return (j?.djRadios ?? []).map(radioCard)
}
export async function searchRadios(keywords: string): Promise<Card[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&type=1009&limit=30`)
  return (j?.result?.djRadios ?? []).map(radioCard)
}

// 电台节目:节目的音频就是 mainSong,用它的 id 走正常的取地址/播放流程。
export async function getRadioPrograms(rid: number, offset: number, asc: boolean): Promise<{ songs: Song[]; more: boolean }> {
  const j = await getJson(`/dj/program?rid=${rid}&limit=100&offset=${offset}&asc=${asc}`)
  const songs: Song[] = (j?.programs ?? [])
    .map((p: any) => ({
      id: p.mainSong?.id ?? p.mainTrackId ?? 0, name: p.name ?? p.mainSong?.name ?? '',
      artist: p.radio?.name ?? p.dj?.nickname ?? '', cover: toHttps(p.coverUrl ?? p.radio?.picUrl ?? ''), albumId: 0, artistId: 0,
    }))
    .filter((s: Song) => s.id > 0)
  return { songs, more: !!j?.more }
}
