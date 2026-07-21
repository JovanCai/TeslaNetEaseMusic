const BASE = '/api'

export async function getSongUrl(id: number, realIP?: string): Promise<{ id: number; url: string | null }> {
  const p = new URLSearchParams({ id: String(id), level: 'exhigh' })
  if (realIP) p.set('realIP', realIP)
  const r = await fetch(`${BASE}/song/url/v1?${p}`)
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

function toSong(r: any): Song {
  const ar = r.ar ?? r.artists ?? []
  const al = r.al ?? r.album ?? {}
  return { id: r.id, name: r.name, artist: ar[0]?.name ?? '', cover: al.picUrl ?? '' }
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

export async function getPlaylistTracks(id: number): Promise<Song[]> {
  const j = await getJson(`/playlist/track/all?id=${id}&limit=200`)
  return (j?.songs ?? []).map(toSong)
}

export async function search(keywords: string): Promise<Song[]> {
  const j = await getJson(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&limit=30`)
  return (j?.result?.songs ?? []).map(toSong)
}

export async function getUserPlaylists(uid: number): Promise<{ id: number; name: string; cover: string; count: number }[]> {
  const j = await getJson(`/user/playlist?uid=${uid}&limit=60`)
  return (j?.playlist ?? []).map((p: any) => ({ id: p.id, name: p.name, cover: p.coverImgUrl ?? '', count: p.trackCount ?? 0 }))
}

export async function getLoginStatus(): Promise<{ loggedIn: boolean; uid: number | null; nickname: string | null }> {
  const j = await getJson('/login/status')
  const prof = j?.data?.profile
  return { loggedIn: !!prof, uid: prof?.userId ?? null, nickname: prof?.nickname ?? null }
}
