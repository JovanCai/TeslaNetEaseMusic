const BASE = '/api'

// 统一请求:加超时(默认 8s,弱网下不会无限转圈)与失败退避重试(默认 2 次)。
// 关键:闲置后后端到网易的连接会冷掉,第一发常失败;重试能自愈,避免上层把"暂时取不到"误判成"这首播不了"直接跳歌。
async function fetchJson(path: string, { timeout = 8000, retries = 2 } = {}): Promise<any> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const r = await fetch(`${BASE}${path}`, { signal: ctrl.signal })
      if (!r.ok) throw new Error(`${path} ${r.status}`)
      return await r.json()
    } catch (e) {
      lastErr = e
      if (attempt < retries) await new Promise((res) => setTimeout(res, 500 * (attempt + 1))) // 退避 0.5s / 1s
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

export async function getSongUrl(id: number, level = 'exhigh'): Promise<{ id: number; url: string | null }> {
  // 区域解锁(realIP)由后端按需自动注入,前端无需传参。
  const j: any = await fetchJson(`/song/url/v1?id=${id}&level=${level}`)
  const raw: string | null = j?.data?.[0]?.url ?? null
  // 网易云常返回 http:// 地址;车机走 https 时 http 音频会被当混合内容拦掉,统一升级为 https。
  return { id, url: raw ? raw.replace(/^http:\/\//, 'https://') : null }
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
