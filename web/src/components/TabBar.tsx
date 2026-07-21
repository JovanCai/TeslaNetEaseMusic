const TABS: [string, string][] = [['daily', '日推'], ['playlists', '歌单'], ['search', '搜索']]

export function TabBar({ tab, onTab }: { tab: string; onTab: (t: string) => void }) {
  return (
    <nav className="tabbar glass">
      {TABS.map(([k, label]) => (
        <div key={k} className={`tap tabbtn ${tab === k ? 'active' : ''}`} onClick={() => onTab(k)}>{label}</div>
      ))}
    </nav>
  )
}
