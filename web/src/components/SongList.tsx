import type { Song } from '../api'
import { usePlayer } from '../player/PlayerContext'

export function SongList({ songs }: { songs: Song[] }) {
  const p = usePlayer()
  return (
    <div className="song-list">
      {songs.map((s, i) => (
        <div key={s.id} className="song-row tap" onClick={() => p.playList(songs, i)}>
          {s.cover && <img src={s.cover} className="song-cover" alt="" loading="lazy" />}
          <div className="song-meta">
            <div className="song-name">{s.name}</div>
            <div className="song-artist">{s.artist}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
