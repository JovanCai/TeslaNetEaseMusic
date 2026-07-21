import { useEffect, useState } from 'react'
import { getUserPlaylists, getPlaylistTracks, getLoginStatus, type Song } from '../api'
import { SongList } from '../components/SongList'

interface PlaylistSummary { id: number; name: string; cover: string; count: number }

export function Playlists() {
  const [lists, setLists] = useState<PlaylistSummary[]>([])
  const [tracks, setTracks] = useState<Song[] | null>(null)

  useEffect(() => {
    getLoginStatus().then((s) => { if (s.uid) getUserPlaylists(s.uid).then(setLists).catch(() => {}) })
  }, [])

  if (tracks) {
    return (
      <div className="view">
        <button className="tap back-btn" onClick={() => setTracks(null)}>← 返回歌单</button>
        <SongList songs={tracks} />
      </div>
    )
  }
  return (
    <div className="view">
      <h2 className="view-title neon-text">我的歌单</h2>
      <div className="pl-grid">
        {lists.map((pl) => (
          <div key={pl.id} className="pl-card glass tap" onClick={() => getPlaylistTracks(pl.id).then(setTracks).catch(() => {})}>
            {pl.cover && <img src={pl.cover} className="pl-cover" alt="" />}
            <div className="pl-name">{pl.name}</div>
            <div className="pl-count">{pl.count} 首</div>
          </div>
        ))}
      </div>
    </div>
  )
}
