import { useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Playlists } from './views/Playlists'
import { Search } from './views/Search'
import { Login } from './views/Login'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import { FastScroll } from './components/FastScroll'
import { sessionApi } from './session'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => { sessionApi.status().then((s) => setAuthed(s.loggedIn)).catch(() => setAuthed(false)) }, [])

  if (authed === null) return <div className="shell" />
  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <div className="shell">
      <main className="content">
        {tab === 'daily' && <Daily />}
        {tab === 'playlists' && <Playlists />}
        {tab === 'search' && <Search />}
      </main>
      <FastScroll />
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={setTab} />
      {showNP && <NowPlaying onClose={() => setShowNP(false)} />}
    </div>
  )
}
