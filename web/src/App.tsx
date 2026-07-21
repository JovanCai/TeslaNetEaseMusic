import { useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Playlists } from './views/Playlists'
import { Search } from './views/Search'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  return (
    <div className="shell">
      <main className="content">
        {tab === 'daily' && <Daily />}
        {tab === 'playlists' && <Playlists />}
        {tab === 'search' && <Search />}
      </main>
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={setTab} />
      {showNP && <NowPlaying onClose={() => setShowNP(false)} />}
    </div>
  )
}
