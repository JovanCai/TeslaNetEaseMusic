import { useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Playlists } from './views/Playlists'
import { Search } from './views/Search'
import { Login } from './views/Login'
import { AlbumView } from './views/AlbumView'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import { FastScroll } from './components/FastScroll'
import { ThemePicker } from './components/ThemePicker'
import { sessionApi } from './session'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => { sessionApi.status().then((s) => setAuthed(s.loggedIn)).catch(() => setAuthed(false)) }, [])

  function goTab(t: string) { setAlbumId(null); setTab(t) } // 切换标签时离开专辑页

  if (authed === null) return <div className="shell" />
  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <div className="shell">
      <main className="content">
        {albumId != null
          ? <AlbumView key={`album-${albumId}`} albumId={albumId} onClose={() => setAlbumId(null)} />
          : (
            <div key={tab} className="view-anim">
              {tab === 'daily' && <Daily />}
              {tab === 'playlists' && <Playlists />}
              {tab === 'search' && <Search />}
            </div>
          )}
      </main>
      <ThemePicker />
      <FastScroll />
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={goTab} />
      <NowPlaying open={showNP} onClose={() => setShowNP(false)}
        onOpenAlbum={(id) => { setShowNP(false); setAlbumId(id) }} />
    </div>
  )
}
