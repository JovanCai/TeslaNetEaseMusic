import { useEffect, useState } from 'react'
import { getUserPlaylists, getPlaylistTracks, getLoginStatus, type Song } from '../api'
import { SongList } from '../components/SongList'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from '../components/Icon'

interface PlaylistSummary { id: number; name: string; cover: string; count: number }

export function Playlists() {
  const p = usePlayer()
  const [lists, setLists] = useState<PlaylistSummary[]>([])
  const [detail, setDetail] = useState<{ name: string; tracks: Song[] } | null>(null)

  useEffect(() => {
    getLoginStatus().then((s) => { if (s.uid) getUserPlaylists(s.uid).then(setLists).catch(() => {}) })
  }, [])

  function open(pl: PlaylistSummary) {
    getPlaylistTracks(pl.id).then((tracks) => setDetail({ name: pl.name, tracks })).catch(() => {})
  }

  if (detail) {
    return (
      <div key="detail" className="view sub-anim">
        <button className="tap back-btn" onClick={() => setDetail(null)}>← 返回歌单</button>
        <div className="detail-head">
          <h2 className="view-title neon-text">{detail.name}</h2>
          <div className="detail-actions">
            <button className="tap play-all" disabled={!detail.tracks.length} onClick={() => p.playList(detail.tracks, 0)}>
              <Icon name="play" size={22} /> 播放全部
            </button>
            <button className="tap play-shuffle" disabled={!detail.tracks.length}
              onClick={() => { p.setShuffle(true); p.playList(detail.tracks, 0) }}>
              <Icon name="shuffle" size={20} /> 随机
            </button>
          </div>
        </div>
        <SongList songs={detail.tracks} />
      </div>
    )
  }
  return (
    <div key="grid" className="view sub-anim">
      <h2 className="view-title neon-text">我的歌单</h2>
      <div className="pl-grid">
        {lists.map((pl) => (
          <div key={pl.id} className="pl-card glass tap" onClick={() => open(pl)}>
            {pl.cover && <img src={pl.cover} className="pl-cover" alt="" loading="lazy" />}
            <div className="pl-name">{pl.name}</div>
            <div className="pl-count">{pl.count} 首</div>
          </div>
        ))}
      </div>
    </div>
  )
}
