import { useEffect, useState } from 'react'

interface Item { id: number; msg: string }
let seq = 0

export function Toaster() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    function onToast(e: Event) {
      const msg = (e as CustomEvent<string>).detail
      const id = ++seq
      setItems((xs) => [...xs, { id, msg }])
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2600)
    }
    window.addEventListener('tm-toast', onToast)
    return () => window.removeEventListener('tm-toast', onToast)
  }, [])
  if (!items.length) return null
  return (
    <div className="toaster">
      {items.map((it) => <div key={it.id} className="toast glass">{it.msg}</div>)}
    </div>
  )
}
