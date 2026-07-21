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

export async function getLyric(id: number): Promise<{ lrc: string; tlyric: string }> {
  const r = await fetch(`${BASE}/lyric?id=${id}`)
  if (!r.ok) throw new Error(`lyric ${r.status}`)
  const j: any = await r.json()
  return { lrc: j?.lrc?.lyric ?? '', tlyric: j?.tlyric?.lyric ?? '' }
}
