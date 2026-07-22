import type { Card } from '../api'

export function CardGrid({ cards, onPick }: { cards: Card[]; onPick: (c: Card) => void }) {
  return (
    <div className="pl-grid">
      {cards.map((c) => (
        <div key={c.id} className="pl-card glass tap" onClick={() => onPick(c)}>
          {c.cover && <img src={c.cover} className="pl-cover" alt="" loading="lazy" />}
          <div className="pl-name">{c.name}</div>
          <div className="pl-count">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
