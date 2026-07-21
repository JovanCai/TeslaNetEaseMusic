import { useEffect, useState } from 'react'
import { getDailySongs, type Song } from '../api'
import { SongList } from '../components/SongList'

export function Daily() {
  const [songs, setSongs] = useState<Song[]>([])
  useEffect(() => { getDailySongs().then(setSongs).catch(() => {}) }, [])
  return (
    <div className="view">
      <h2 className="view-title neon-text">每日推荐</h2>
      <SongList songs={songs} />
    </div>
  )
}
