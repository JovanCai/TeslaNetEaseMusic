import { useEffect, useState } from 'react'
import { getAlbum, type Song } from '../api'
import { SongList } from '../components/SongList'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from '../components/Icon'

export function AlbumView({ albumId, onClose }: { albumId: number; onClose: () => void }) {
  const p = usePlayer()
  const [data, setData] = useState<{ name: string; cover: string; songs: Song[] } | null>(null)

  useEffect(() => { getAlbum(albumId).then(setData).catch(() => {}) }, [albumId])

  return (
    <div className="view sub-anim">
      <button className="tap back-btn" onClick={onClose}>← 返回</button>
      {data && (
        <>
          <div className="album-head">
            {data.cover && <img className="album-cover" src={data.cover} alt="" />}
            <div className="album-meta">
              <h2 className="view-title neon-text">{data.name}</h2>
              <button className="tap play-all" disabled={!data.songs.length} onClick={() => p.playList(data.songs, 0)}>
                <Icon name="play" size={22} /> 播放全部
              </button>
            </div>
          </div>
          <SongList songs={data.songs} />
        </>
      )}
    </div>
  )
}
