import { useState } from 'react'
import { search, type Song } from '../api'
import { SongList } from '../components/SongList'

export function Search() {
  const [kw, setKw] = useState('')
  const [songs, setSongs] = useState<Song[]>([])
  async function go() { if (kw.trim()) setSongs(await search(kw.trim())) }
  return (
    <div className="view">
      <div className="search-bar">
        <input className="search-input" value={kw} onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="搜索歌曲 / 歌手" />
        <button className="tap search-go" onClick={go}>搜索</button>
      </div>
      <SongList songs={songs} />
    </div>
  )
}
