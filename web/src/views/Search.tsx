import { useState } from 'react'
import { search, searchAlbums, searchArtists, searchPlaylists, type Song, type Card } from '../api'
import { SongList } from '../components/SongList'
import { CardGrid } from '../components/CardGrid'
import { loadHistory, addHistory, clearHistory } from '../ui/searchHistory'

const TYPES: [string, string][] = [['song', '单曲'], ['playlist', '歌单'], ['album', '专辑'], ['artist', '歌手']]

export function Search({ onOpenAlbum, onOpenArtist, onOpenPlaylist }: {
  onOpenAlbum: (id: number) => void
  onOpenArtist: (id: number) => void
  onOpenPlaylist: (id: number, name: string) => void
}) {
  const [kw, setKw] = useState('')
  const [type, setType] = useState('song')
  const [songs, setSongs] = useState<Song[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [history, setHistory] = useState(loadHistory())
  const [searched, setSearched] = useState(false)

  async function run(q: string, t: string) {
    if (!q.trim()) return
    addHistory(q); setHistory(loadHistory()); setSearched(true); setKw(q)
    if (t === 'song') { setSongs(await search(q)); setCards([]) }
    else {
      setSongs([])
      const fn = t === 'album' ? searchAlbums : t === 'artist' ? searchArtists : searchPlaylists
      setCards(await fn(q))
    }
  }
  function switchType(t: string) { setType(t); if (kw.trim()) run(kw, t) }

  return (
    <div className="view">
      <div className="search-bar">
        <input className="search-input" value={kw} onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(kw, type)} placeholder="搜索歌曲 / 歌单 / 专辑 / 歌手" />
        <button className="tap search-go" onClick={() => run(kw, type)}>搜索</button>
      </div>

      {!searched && history.length > 0 && (
        <div className="search-hist">
          <div className="hist-head"><span>搜索历史</span>
            <button className="tap hist-clear" onClick={() => { clearHistory(); setHistory([]) }}>清空</button>
          </div>
          <div className="hist-chips">
            {history.map((h) => <span key={h} className="hist-chip tap" onClick={() => run(h, type)}>{h}</span>)}
          </div>
        </div>
      )}

      {searched && (
        <>
          <div className="search-types">
            {TYPES.map(([k, label]) => (
              <span key={k} className={`stype tap ${type === k ? 'on' : ''}`} onClick={() => switchType(k)}>{label}</span>
            ))}
          </div>
          {type === 'song'
            ? <SongList songs={songs} />
            : <CardGrid cards={cards} onPick={(c) => type === 'album' ? onOpenAlbum(c.id) : type === 'artist' ? onOpenArtist(c.id) : onOpenPlaylist(c.id, c.name)} />}
        </>
      )}
    </div>
  )
}
