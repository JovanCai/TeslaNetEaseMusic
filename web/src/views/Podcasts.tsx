import { useEffect, useState } from 'react'
import { getMyRadios, getRecommendRadios, type Card } from '../api'
import { CardGrid } from '../components/CardGrid'

export function Podcasts({ onOpenRadio }: { onOpenRadio: (radio: Card) => void }) {
  const [mine, setMine] = useState<Card[]>([])
  const [recs, setRecs] = useState<Card[]>([])

  useEffect(() => {
    getMyRadios().then(setMine).catch(() => {})
    getRecommendRadios().then(setRecs).catch(() => {})
  }, [])

  return (
    <div className="view">
      {mine.length > 0 && (
        <>
          <h2 className="view-title neon-text">我的订阅</h2>
          <CardGrid cards={mine} onPick={onOpenRadio} />
        </>
      )}
      <h2 className={`view-title neon-text ${mine.length ? 'discover-gap' : ''}`}>推荐播客</h2>
      <CardGrid cards={recs} onPick={onOpenRadio} />
    </div>
  )
}
