import { useEffect, useRef, useState } from 'react'
import { search, searchAlbums, searchArtists, searchPlaylists, searchRadios, searchSuggest, type Song, type Card } from '../api'
import { SongList } from '../components/SongList'
import { CardGrid } from '../components/CardGrid'
import { loadHistory, addHistory, clearHistory } from '../ui/searchHistory'

const TYPES: [string, string][] = [['song', '单曲'], ['playlist', '歌单'], ['album', '专辑'], ['artist', '歌手'], ['radio', '播客']]

export function Search({ onOpenAlbum, onOpenArtist, onOpenPlaylist, onOpenRadio }: {
  onOpenAlbum: (id: number) => void
  onOpenArtist: (id: number) => void
  onOpenPlaylist: (id: number, name: string) => void
  onOpenRadio: (radio: Card) => void
}) {
  const [kw, setKw] = useState('')
  const [type, setType] = useState('song')
  const [songs, setSongs] = useState<Song[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [history, setHistory] = useState(loadHistory())
  const [searched, setSearched] = useState(false)
  const [suggests, setSuggests] = useState<string[]>([])
  const [typing, setTyping] = useState(false) // 用户正在输入(而非刚执行完搜索)时才显示联想
  const suggestSeq = useRef(0)

  // 输入停顿 250ms 后取联想词;旧请求的结果晚到会被序号丢弃
  useEffect(() => {
    const q = kw.trim()
    const seq = ++suggestSeq.current
    if (!typing || !q) { setSuggests([]); return }
    const t = window.setTimeout(() => {
      searchSuggest(q).then((words) => { if (seq === suggestSeq.current) setSuggests(words.filter((w) => w !== q)) }).catch(() => {})
    }, 250)
    return () => window.clearTimeout(t)
  }, [kw, typing])

  async function run(q: string, t: string) {
    if (!q.trim()) return
    addHistory(q); setHistory(loadHistory()); setSearched(true); setKw(q); setTyping(false)
    if (t === 'song') { setSongs(await search(q)); setCards([]) }
    else {
      setSongs([])
      const fn = t === 'album' ? searchAlbums : t === 'artist' ? searchArtists : t === 'radio' ? searchRadios : searchPlaylists
      setCards(await fn(q))
    }
  }
  function switchType(t: string) { setType(t); if (kw.trim()) run(kw, t) }
  function pick(c: Card) {
    if (type === 'album') onOpenAlbum(c.id)
    else if (type === 'artist') onOpenArtist(c.id)
    else if (type === 'radio') onOpenRadio(c)
    else onOpenPlaylist(c.id, c.name)
  }

  return (
    <div className="view">
      <div className="search-bar">
        <input className="search-input" value={kw} onChange={(e) => { setKw(e.target.value); setTyping(true) }}
          onKeyDown={(e) => e.key === 'Enter' && run(kw, type)} placeholder="搜索歌曲 / 歌单 / 专辑 / 歌手 / 播客" />
        <button className="tap search-go" onClick={() => run(kw, type)}>搜索</button>
      </div>

      {suggests.length > 0 && (
        <div className="search-suggest glass">
          {suggests.map((w) => <div key={w} className="suggest-row tap" onClick={() => run(w, type)}>{w}</div>)}
        </div>
      )}

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
            : <CardGrid cards={cards} onPick={pick} />}
        </>
      )}
    </div>
  )
}
