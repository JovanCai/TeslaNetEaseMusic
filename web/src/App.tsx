import { useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import { Daily } from './views/Daily'
import { Discover } from './views/Discover'
import { Playlists } from './views/Playlists'
import { Podcasts } from './views/Podcasts'
import { Search } from './views/Search'
import { Login } from './views/Login'
import { Unlock } from './views/Unlock'
import { AlbumView } from './views/AlbumView'
import { ArtistView } from './views/ArtistView'
import { PlaylistView } from './views/PlaylistView'
import { RadioView } from './views/RadioView'
import { MiniPlayer } from './player/MiniPlayer'
import { NowPlaying } from './player/NowPlaying'
import { FastScroll } from './components/FastScroll'
import { ThemePicker } from './components/ThemePicker'
import { Toaster } from './components/Toaster'
import { sessionApi, authApi } from './session'
import { getLoginStatus, AUTH_REQUIRED_EVENT, type Card } from './api'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [showNP, setShowNP] = useState(false)
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [artistId, setArtistId] = useState<number | null>(null)
  const [playlist, setPlaylist] = useState<{ id: number; name: string } | null>(null)
  const [radio, setRadio] = useState<Card | null>(null)
  const [locked, setLocked] = useState<boolean | null>(null) // 访问密码:null=检查中
  const [authed, setAuthed] = useState<boolean | null>(null)

  // 详情页互斥:打开一个就清掉其它
  const closeDetails = () => { setAlbumId(null); setArtistId(null); setPlaylist(null); setRadio(null) }
  const openAlbum = (id: number) => { closeDetails(); setAlbumId(id) }
  const openArtist = (id: number) => { closeDetails(); setArtistId(id) }
  const openPlaylist = (id: number, name: string) => { closeDetails(); setPlaylist({ id, name }) }
  const openRadio = (r: Card) => { closeDetails(); setRadio(r) }

  useEffect(() => {
    authApi.status().then((s) => setLocked(s.required && !s.ok)).catch(() => setLocked(false)) // 旧后端无 /auth:视为不需要密码
    const onAuthRequired = () => setLocked(true) // 任何接口返回 401(如改了密码)都切到输密码界面
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
  }, [])

  useEffect(() => {
    if (locked !== false) return
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
  }, [locked])

  function goTab(t: string) { closeDetails(); setTab(t) } // 切换标签时离开详情页

  if (locked) return <><Unlock /><ThemePicker /></>
  if (locked === null || authed === null) return <div className="shell" />
  if (!authed) return <><Login onDone={() => setAuthed(true)} /><ThemePicker /></>

  return (
    <div className="shell">
      <main className="content">
        {albumId != null
          ? <AlbumView key={`album-${albumId}`} albumId={albumId} onClose={() => setAlbumId(null)} />
          : artistId != null
            ? <ArtistView key={`artist-${artistId}`} artistId={artistId} onClose={() => setArtistId(null)} />
            : playlist != null
              ? <PlaylistView key={`pl-${playlist.id}`} id={playlist.id} name={playlist.name} onClose={() => setPlaylist(null)} />
              : radio != null
                ? <RadioView key={`radio-${radio.id}`} radio={radio} onClose={() => setRadio(null)} />
                : (
                  <div key={tab} className="view-anim">
                    {tab === 'daily' && <Daily />}
                    {tab === 'discover' && <Discover onOpenPlaylist={openPlaylist} />}
                    {tab === 'playlists' && <Playlists onOpenPlaylist={openPlaylist} />}
                    {tab === 'podcasts' && <Podcasts onOpenRadio={openRadio} />}
                    {tab === 'search' && <Search onOpenAlbum={openAlbum} onOpenArtist={openArtist} onOpenPlaylist={openPlaylist} onOpenRadio={openRadio} />}
                  </div>
                )}
      </main>
      <ThemePicker />
      <Toaster />
      <FastScroll />
      <MiniPlayer onExpand={() => setShowNP(true)} />
      <TabBar tab={tab} onTab={goTab} />
      <NowPlaying open={showNP} onClose={() => setShowNP(false)}
        onOpenAlbum={(id) => { setShowNP(false); openAlbum(id) }}
        onOpenArtist={(id) => { setShowNP(false); openArtist(id) }} />
    </div>
  )
}
