type Name = 'play' | 'pause' | 'prev' | 'next' | 'shuffle' | 'repeat' | 'repeatOne' | 'chevronDown' | 'search' | 'volume' | 'radar' | 'palette' | 'heart' | 'heartFilled' | 'album' | 'queue' | 'plus' | 'artist'

const PATHS: Record<Name, React.ReactNode> = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  prev: <><path d="M18 6 8 12l10 6z" fill="currentColor" stroke="none" /><rect x="5" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none" /></>,
  next: <><path d="M6 6l10 6-10 6z" fill="currentColor" stroke="none" /><rect x="17" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none" /></>,
  shuffle: <><path d="M16 4h4v4" /><path d="M4 20 20 4" /><path d="M4 4l5 5" /><path d="M20 20h-4v-4" /><path d="M15 15l5 5" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  repeatOne: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><path d="M11 10h1v4" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l7-4" /></>,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" /><path d="M12 21a3 3 0 0 1 0-6 2 2 0 0 0 0-4" /></>,
  heart: <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5.5 5.5 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3 0 4.5 3 3 6-2.5 4.15-8.5 8.5-8.5 8.5z" />,
  heartFilled: <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5.5 5.5 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3 0 4.5 3 3 6-2.5 4.15-8.5 8.5-8.5 8.5z" fill="currentColor" stroke="none" />,
  album: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
  queue: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /><path d="M18 18l4-2.5-4-2.5z" fill="currentColor" stroke="none" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  artist: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
}

export function Icon({ name, size = 26 }: { name: Name; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
