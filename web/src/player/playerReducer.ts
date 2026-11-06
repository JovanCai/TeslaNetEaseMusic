import { nextIndex, prevIndex, buildShuffleOrder, reshuffle, type Repeat } from './queue'
import type { Song } from '../api'

// 播放队列的纯状态逻辑(reducer)。与 PlayerProvider 分文件:组件文件只导出组件,保证 React 快速刷新可用。
export interface PlayerState {
  queue: Song[]
  order: number[]   // 播放顺序:queue 下标的排列
  pos: number       // order 中的当前位置;-1 表示无
  isPlaying: boolean
  shuffle: boolean
  repeat: Repeat
  lrc: string
  tlyric: string
  pureMusic: boolean
  radar: boolean    // 私人FM 模式:接近队尾时自动续接下一批
  playToken: number // 递增以强制(重新)加载当前曲(支持单曲循环重放)
}
export const initialPlayerState: PlayerState = {
  queue: [], order: [], pos: -1, isPlaying: false, shuffle: false, repeat: 'off', lrc: '', tlyric: '', pureMusic: false, radar: false, playToken: 0,
}
export type Action =
  | { type: 'playList'; songs: Song[]; start: number }
  | { type: 'startRadar'; songs: Song[] } | { type: 'appendSongs'; songs: Song[] }
  | { type: 'toggle' } | { type: 'next' } | { type: 'ended' } | { type: 'prev' } | { type: 'stop' } | { type: 'reload' }
  | { type: 'setShuffle'; on: boolean } | { type: 'cycleRepeat' }
  | { type: 'setLrc'; lrc: string; tlyric: string; pureMusic: boolean }
  | { type: 'jumpTo'; pos: number } | { type: 'removeAt'; pos: number }
  | { type: 'enqueueNext'; song: Song } | { type: 'enqueue'; song: Song }

const identity = (n: number) => Array.from({ length: n }, (_, i) => i)
export const curQueueIndex = (s: PlayerState) => (s.pos >= 0 ? s.order[s.pos] : -1)
const RADAR_CAP = 150, RADAR_KEEP_BEHIND = 40 // 私人FM 队列上限与保留的已播条数

// 随机播放与网易云 App 一致:放完一轮不停,重新洗牌继续(否则不开循环时整张歌单放完就停了)
const endOfShuffleRound = (s: PlayerState) => s.shuffle && !s.radar && s.order.length > 0 && s.pos === s.order.length - 1
const startNewShuffleRound = (s: PlayerState): PlayerState =>
  ({ ...s, order: reshuffle(s.order, s.order[s.pos]), pos: 0, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 })

export function playerReducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'playList': {
      const order = s.shuffle ? buildShuffleOrder(a.songs.length, a.start) : identity(a.songs.length)
      const pos = s.shuffle ? 0 : a.start
      return { ...s, queue: a.songs, order, pos, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'startRadar':
      return { ...s, queue: a.songs, order: identity(a.songs.length), pos: 0, isPlaying: true, shuffle: false, radar: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    case 'appendSongs': {
      const start = s.queue.length
      const appended = a.songs.map((_, i) => start + i)
      const combined = [...s.queue, ...a.songs]
      const order = [...s.order, ...appended]
      // 私人FM 长时间累积会撑爆内存/localStorage:超上限时裁掉已播的前段并重映射下标(radar 非乱序,order 连续)
      if (combined.length > RADAR_CAP && s.pos > RADAR_KEEP_BEHIND) {
        const cut = s.pos - RADAR_KEEP_BEHIND
        const kept = order.slice(cut)
        const remap = new Map<number, number>()
        const queue = kept.map((qi, ni) => { remap.set(qi, ni); return combined[qi] })
        return { ...s, queue, order: kept.map((qi) => remap.get(qi)!), pos: s.pos - cut }
      }
      return { ...s, queue: combined, order }
    }
    case 'toggle': return { ...s, isPlaying: !s.isPlaying }
    case 'stop': return { ...s, isPlaying: false }
    case 'reload': return s.pos < 0 ? s : { ...s, playToken: s.playToken + 1 } // 重新加载当前曲(取地址失败后网络恢复时重试)
    case 'ended': { // 自动续播(曲终):遵循单曲循环=重播当前
      if (s.repeat !== 'one' && endOfShuffleRound(s)) return startNewShuffleRound(s)
      const p = nextIndex(s.order.length, s.pos, s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'next': { // 手动下一首 / 跳过死歌:单曲循环下也要真正前进(one 视作 all)
      if (endOfShuffleRound(s)) return startNewShuffleRound(s)
      const p = nextIndex(s.order.length, s.pos, s.repeat === 'one' ? 'all' : s.repeat)
      return p < 0 ? { ...s, isPlaying: false } : { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    }
    case 'prev': {
      const p = prevIndex(s.order.length, s.pos)
      return { ...s, pos: p, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 } // 与 next 一致:暂停时按上一首也恢复播放
    }
    case 'setShuffle': {
      const cur = curQueueIndex(s)
      if (cur < 0) return { ...s, shuffle: a.on } // 空闲:只切标志,不用 queue.length 重建 order(否则会复活已删歌/污染空闲态)
      const members = s.order // 当前在播队列的 queue 下标集合(已删除的不在其中)
      if (a.on) {
        const rest = members.filter((i) => i !== cur)
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]] }
        return { ...s, shuffle: true, order: [cur, ...rest], pos: 0 }
      }
      const order = [...members].sort((x, y) => x - y) // 关闭:剩余曲目按自然(队列)顺序
      return { ...s, shuffle: false, order, pos: order.indexOf(cur) }
    }
    case 'cycleRepeat': {
      const order: Repeat[] = ['off', 'all', 'one']
      return { ...s, repeat: order[(order.indexOf(s.repeat) + 1) % 3] }
    }
    case 'setLrc': return { ...s, lrc: a.lrc, tlyric: a.tlyric, pureMusic: a.pureMusic }
    case 'jumpTo':
      if (a.pos < 0 || a.pos >= s.order.length) return s
      return { ...s, pos: a.pos, isPlaying: true, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
    case 'removeAt': {
      if (a.pos < 0 || a.pos >= s.order.length) return s
      const order = s.order.slice(0, a.pos).concat(s.order.slice(a.pos + 1))
      if (order.length === 0) // 清空:保留 shuffle/repeat/radar 等设置,不静默重置
        return { ...initialPlayerState, queue: s.queue, shuffle: s.shuffle, repeat: s.repeat, radar: s.radar, playToken: s.playToken + 1 }
      if (a.pos < s.pos) return { ...s, order, pos: s.pos - 1 }
      if (a.pos === s.pos) { // 移除的是当前曲:同位置变为下一首,重载但保持原播放/暂停态
        const pos = Math.min(s.pos, order.length - 1)
        return { ...s, order, pos, lrc: '', tlyric: '', pureMusic: false, isPlaying: s.isPlaying, playToken: s.playToken + 1 }
      }
      return { ...s, order } // 移除的在当前之后,不影响播放
    }
    case 'enqueueNext': {
      const idx = s.queue.length
      const queue = [...s.queue, a.song]
      if (s.order.length === 0) return { ...s, queue, order: [idx], pos: 0, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
      const order = s.order.slice(0, s.pos + 1).concat([idx], s.order.slice(s.pos + 1)) // pos=-1 时插到最前
      return { ...s, queue, order }
    }
    case 'enqueue': {
      const idx = s.queue.length
      const queue = [...s.queue, a.song]
      if (s.order.length === 0) return { ...s, queue, order: [idx], pos: 0, isPlaying: true, radar: false, lrc: '', tlyric: '', pureMusic: false, playToken: s.playToken + 1 }
      return { ...s, queue, order: [...s.order, idx] }
    }
    default: return s
  }
}
