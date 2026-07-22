import { useEffect, useState } from 'react'
import { getPlaylistTracks, type Song } from '../api'
import { SongList } from '../components/SongList'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from '../components/Icon'

export function PlaylistView({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const p = usePlayer()
  const [tracks, setTracks] = useState<Song[] | null>(null)

  useEffect(() => { getPlaylistTracks(id).then(setTracks).catch(() => {}) }, [id])

  return (
    <div className="view sub-anim">
      <button className="tap back-btn" onClick={onClose}>← 返回</button>
      <div className="detail-head">
        <h2 className="view-title neon-text">{name}</h2>
        <div className="detail-actions">
          <button className="tap play-all" disabled={!tracks?.length} onClick={() => tracks && p.playList(tracks, 0)}>
            <Icon name="play" size={22} /> 播放全部
          </button>
          <button className="tap play-shuffle" disabled={!tracks?.length}
            onClick={() => { if (tracks) { p.setShuffle(true); p.playList(tracks, 0) } }}>
            <Icon name="shuffle" size={20} /> 随机
          </button>
        </div>
      </div>
      {tracks && <SongList songs={tracks} />}
    </div>
  )
}
