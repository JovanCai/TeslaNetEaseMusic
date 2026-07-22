import { useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Playlists } from './views/Playlists'
import { Search } from './views/Search'
import { Login } from './views/Login'
import { AlbumView } from './views/AlbumView'
import { ArtistView } from './views/ArtistView'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import { FastScroll } from './components/FastScroll'
import { ThemePicker } from './components/ThemePicker'
import { Toaster } from './components/Toaster'
import { sessionApi } from './session'
import { getLoginStatus } from './api'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [artistId, setArtistId] = useState<number | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let stop = false
    async function check() {
      try {
        const s = await getLoginStatus() // 真实登录态(命中网易云),能发现 cookie 过期
        if (!stop) setAuthed(s.loggedIn)
      } catch {
        try { const s = await sessionApi.status(); if (!stop) setAuthed(s.loggedIn) } // 暂时不可达:退回 cookie 判断,避免误判登出
        catch { if (!stop) setAuthed(false) }
      }
    }
    check()
    const t = window.setInterval(check, 5 * 60 * 1000) // 定期复查,处理中途过期
    return () => { stop = true; window.clearInterval(t) }
  }, [])

  function goTab(t: string) { setAlbumId(null); setArtistId(null); setTab(t) } // 切换标签时离开专辑/歌手页

  if (authed === null) return <div className="shell" />
  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <div className="shell">
      <main className="content">
        {albumId != null
          ? <AlbumView key={`album-${albumId}`} albumId={albumId} onClose={() => setAlbumId(null)} />
          : artistId != null
            ? <ArtistView key={`artist-${artistId}`} artistId={artistId} onClose={() => setArtistId(null)} />
            : (
              <div key={tab} className="view-anim">
                {tab === 'daily' && <Daily />}
                {tab === 'playlists' && <Playlists />}
                {tab === 'search' && <Search />}
              </div>
            )}
      </main>
      <ThemePicker />
      <Toaster />
      <FastScroll />
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={goTab} />
      <NowPlaying open={showNP} onClose={() => setShowNP(false)}
        onOpenAlbum={(id) => { setShowNP(false); setArtistId(null); setAlbumId(id) }}
        onOpenArtist={(id) => { setShowNP(false); setAlbumId(null); setArtistId(id) }} />
    </div>
  )
}
