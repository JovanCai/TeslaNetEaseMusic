const BASE = '/api'

export async function getSongUrl(id: number, realIP?: string): Promise<{ id: number; url: string | null }> {
  const p = new URLSearchParams({ id: String(id), level: 'exhigh' })
  if (realIP) p.set('realIP', realIP)
  const r = await fetch(`${BASE}/song/url/v1?${p}`)
  if (!r.ok) throw new Error(`song/url ${r.status}`)
  const j: any = await r.json()
  return { id, url: j?.data?.[0]?.url ?? null }
}

export async function getLyric(id: number): Promise<{ lrc: string; tlyric: string }> {
  const r = await fetch(`${BASE}/lyric?id=${id}`)
  if (!r.ok) throw new Error(`lyric ${r.status}`)
  const j: any = await r.json()
  return { lrc: j?.lrc?.lyric ?? '', tlyric: j?.tlyric?.lyric ?? '' }
}
