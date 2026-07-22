import { useEffect, useState } from 'react'
import { getUserPlaylists, getLoginStatus } from '../api'
import { CardGrid } from '../components/CardGrid'

export function Playlists({ onOpenPlaylist }: { onOpenPlaylist: (id: number, name: string) => void }) {
  const [lists, setLists] = useState<{ id: number; name: string; cover: string; count: number }[]>([])

  useEffect(() => {
    getLoginStatus().then((s) => { if (s.uid) getUserPlaylists(s.uid).then(setLists).catch(() => {}) })
  }, [])

  return (
    <div className="view">
      <h2 className="view-title neon-text">我的歌单</h2>
      <CardGrid
        cards={lists.map((l) => ({ id: l.id, name: l.name, cover: l.cover, sub: `${l.count} 首` }))}
        onPick={(c) => onOpenPlaylist(c.id, c.name)}
      />
    </div>
  )
}
