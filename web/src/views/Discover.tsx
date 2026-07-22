import { useEffect, useState } from 'react'
import { getPersonalized, getToplists, type Card } from '../api'
import { CardGrid } from '../components/CardGrid'

export function Discover({ onOpenPlaylist }: { onOpenPlaylist: (id: number, name: string) => void }) {
  const [recs, setRecs] = useState<Card[]>([])
  const [tops, setTops] = useState<Card[]>([])

  useEffect(() => {
    getPersonalized().then(setRecs).catch(() => {})
    getToplists().then(setTops).catch(() => {})
  }, [])

  return (
    <div className="view">
      <h2 className="view-title neon-text">推荐歌单</h2>
      <CardGrid cards={recs} onPick={(c) => onOpenPlaylist(c.id, c.name)} />
      <h2 className="view-title neon-text discover-gap">排行榜</h2>
      <CardGrid cards={tops} onPick={(c) => onOpenPlaylist(c.id, c.name)} />
    </div>
  )
}
