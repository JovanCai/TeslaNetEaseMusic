const BASE = '/api'

export async function getSongUrl(id: number): Promise<{ id: number; url: string | null }> {
  // 区域解锁(realIP)由后端按需自动注入,前端无需传参。
  const r = await fetch(`${BASE}/song/url/v1?id=${id}&level=exhigh`)
  if (!r.ok) throw new Error(`song/url ${r.status}`)
  const j: any = await r.json()
  const raw: string | null = j?.data?.[0]?.url ?? null
  // 网易云常返回 http:// 地址;车机走 https 时 http 音频会被当混合内容拦掉,统一升级为 https。
  return { id, url: raw ? raw.replace(/^http:\/\//, 'https://') : null }
}

export async function getLyric(id: number): Promise<{ lrc: string; tlyric: string; pureMusic: boolean }> {
  const r = await fetch(`${BASE}/lyric?id=${id}`)
  if (!r.ok) throw new Error(`lyric ${r.status}`)
  const j: any = await r.json()
  return { lrc: j?.lrc?.lyric ?? '', tlyric: j?.tlyric?.lyric ?? '', pureMusic: !!j?.pureMusic }
}

export interface Song { id: number; name: string; artist: string; cover: string }

// 网易云封面常返回 http://,车机走 https 时会被混合内容拦掉,统一升级为 https。
const toHttps = (u: string) => u.replace(/^http:\/\//, 'https://')

function toSong(r: any): Song {
  const ar = r.ar ?? r.artists ?? []
  const al = r.al ?? r.album ?? {}
  return { id: r.id, name: r.name, artist: ar[0]?.name ?? '', cover: toHttps(al.picUrl ?? '') }
}

async function getJson(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
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

export async function getUserPlaylists(uid: number): Promise<{ id: number; name: string; cover: string; count: number }[]> {
  const j = await getJson(`/user/playlist?uid=${uid}&limit=60`)
  return (j?.playlist ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: toHttps(p.coverImgUrl ?? ''), count: p.trackCount ?? 0 }))
}

export async function getLoginStatus(): Promise<{ loggedIn: boolean; uid: number | null; nickname: string | null }> {
  const j = await getJson('/login/status')
  const prof = j?.data?.profile
  return { loggedIn: !!prof, uid: prof?.userId ?? null, nickname: prof?.nickname ?? null }
}
