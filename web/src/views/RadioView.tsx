import { useEffect, useState } from 'react'
import { getRadioPrograms, type Card, type Song } from '../api'
import { SongList } from '../components/SongList'
import { usePlayer } from '../player/PlayerContext'
import { Icon } from '../components/Icon'

// 排序按电台记忆:有声书/连载通常要正序(从第一集听),新闻类播客倒序(最新在前)
const ascKey = (id: number) => `tm.radioasc.${id}`
function loadAsc(id: number): boolean {
  try { return localStorage.getItem(ascKey(id)) === '1' } catch { return false }
}

export function RadioView({ radio, onClose }: { radio: Card; onClose: () => void }) {
  const p = usePlayer()
  const [asc, setAsc] = useState(() => loadAsc(radio.id))
  const [programs, setPrograms] = useState<Song[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let stale = false
    setPrograms(null); setLoading(true)
    getRadioPrograms(radio.id, 0, asc)
      .then((r) => { if (!stale) { setPrograms(r.songs); setMore(r.more) } })
      .catch(() => { if (!stale) setPrograms([]) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [radio.id, asc])

  function loadMore() {
    if (!programs || loading) return
    setLoading(true)
    getRadioPrograms(radio.id, programs.length, asc)
      .then((r) => { setPrograms((cur) => [...(cur ?? []), ...r.songs]); setMore(r.more) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  function toggleAsc() {
    const v = !asc
    setAsc(v)
    try { localStorage.setItem(ascKey(radio.id), v ? '1' : '0') } catch { /* 忽略 */ }
  }

  return (
    <div className="view sub-anim">
      <button className="tap back-btn" onClick={onClose}>← 返回</button>
      <div className="album-head">
        {radio.cover && <img className="album-cover" src={radio.cover} alt="" />}
        <div className="album-meta">
          <h2 className="view-title neon-text">{radio.name}</h2>
          <div className="detail-actions">
            <button className="tap play-all" disabled={!programs?.length} onClick={() => programs && p.playList(programs, 0)}>
              <Icon name="play" size={22} /> 播放全部
            </button>
            <button className="tap play-shuffle" onClick={toggleAsc}>{asc ? '正序' : '最新在前'}</button>
          </div>
        </div>
      </div>
      {programs && <SongList songs={programs} />}
      {programs?.length === 0 && !loading && <p className="login-tip">暂无节目</p>}
      {more && (
        <button className="tap play-shuffle load-more" disabled={loading} onClick={loadMore}>{loading ? '加载中…' : '加载更多'}</button>
      )}
    </div>
  )
}
