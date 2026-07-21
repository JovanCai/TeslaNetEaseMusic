import { useEffect, useState } from 'react'
import { getDailySongs, type Song } from '../api'
import { SongList } from '../components/SongList'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from '../components/Icon'

export function Daily() {
  const p = usePlayer()
  const [songs, setSongs] = useState<Song[]>([])
  useEffect(() => { getDailySongs().then(setSongs).catch(() => {}) }, [])
  return (
    <div className="view">
      <button className="tap radar-hero" onClick={p.startRadar}>
        <span className="radar-icon"><Icon name="radar" size={30} /></span>
        <span className="radar-text">
          <span className="radar-title">私人FM</span>
          <span className="radar-sub">随心播,一首接一首</span>
        </span>
        <span className="radar-play"><Icon name="play" size={22} /></span>
      </button>
      <h2 className="view-title neon-text">每日推荐</h2>
      <SongList songs={songs} />
    </div>
  )
}
