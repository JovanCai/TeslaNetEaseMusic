import { describe, it, expect } from 'vitest'
import { playerReducer, initialPlayerState } from './PlayerContext'

const songs = [
  { id: 1, name: 'a', artist: 'x', cover: '', albumId: 0, artistId: 0 },
  { id: 2, name: 'b', artist: 'y', cover: '', albumId: 0, artistId: 0 },
  { id: 3, name: 'c', artist: 'z', cover: '', albumId: 0, artistId: 0 },
]
const play = (start: number, base = initialPlayerState) =>
  playerReducer(base, { type: 'playList', songs, start })

describe('playerReducer', () => {
  it('playList 顺序模式:order 恒等、pos=start、playToken 递增', () => {
    const s = play(1)
    expect(s.queue).toHaveLength(3)
    expect(s.order).toEqual([0, 1, 2])
    expect(s.pos).toBe(1)
    expect(s.isPlaying).toBe(true)
    expect(s.playToken).toBe(initialPlayerState.playToken + 1)
  })

  it('cycleRepeat 循环 off→all→one→off', () => {
    let s = { ...initialPlayerState }
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('all')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('one')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('off')
  })

  it('next 到末尾 off 停止', () => {
    let s = play(2)
    s = playerReducer(s, { type: 'next' })
    expect(s.pos).toBe(2); expect(s.isPlaying).toBe(false)
  })

  it('next 到末尾 all 回到开头', () => {
    let s = play(2)
    s = playerReducer(s, { type: 'cycleRepeat' }) // → all
    s = playerReducer(s, { type: 'next' })
    expect(s.pos).toBe(0); expect(s.isPlaying).toBe(true)
  })

  it('repeat=one:next 保持当前并递增 playToken(触发重放)', () => {
    let s = play(1)
    s = playerReducer(s, { type: 'cycleRepeat' }) // → all
    s = playerReducer(s, { type: 'cycleRepeat' }) // → one
    const before = s.playToken
    s = playerReducer(s, { type: 'next' })
    expect(s.pos).toBe(1)
    expect(s.isPlaying).toBe(true)
    expect(s.playToken).toBe(before + 1)
  })

  it('shuffle 开启:当前曲打头、order 是全排列、后续走乱序顺序', () => {
    let s = play(1)                                   // pos=1 → 当前 queue 下标 1
    s = playerReducer(s, { type: 'setShuffle', on: true })
    expect(s.shuffle).toBe(true)
    expect(s.order[0]).toBe(1)                        // 当前曲仍在最前
    expect([...s.order].sort()).toEqual([0, 1, 2])    // 全排列
    expect(s.pos).toBe(0)
    const before = s.pos
    s = playerReducer(s, { type: 'next' })
    expect(s.pos).toBe(before + 1)                    // 沿乱序 order 前进
  })

  it('shuffle 关闭:恢复恒等顺序且当前曲不变', () => {
    let s = playerReducer(play(2), { type: 'setShuffle', on: true })
    s = playerReducer(s, { type: 'setShuffle', on: false })
    expect(s.order).toEqual([0, 1, 2])
    expect(s.order[s.pos]).toBe(2)                    // 当前仍是 queue 下标 2
  })

  it('startRadar:进入雷达模式并从头播', () => {
    const s = playerReducer(initialPlayerState, { type: 'startRadar', songs })
    expect(s.radar).toBe(true)
    expect(s.pos).toBe(0)
    expect(s.isPlaying).toBe(true)
    expect(s.order).toEqual([0, 1, 2])
  })

  it('appendSongs:队列与顺序续接、当前位置不变', () => {
    let s = playerReducer(initialPlayerState, { type: 'startRadar', songs })
    const more = [{ id: 9, name: 'd', artist: 'w', cover: '', albumId: 0, artistId: 0 }]
    s = playerReducer(s, { type: 'appendSongs', songs: more })
    expect(s.queue).toHaveLength(4)
    expect(s.order).toEqual([0, 1, 2, 3])
    expect(s.pos).toBe(0)
  })

  it('playList 会退出雷达模式', () => {
    let s = playerReducer(initialPlayerState, { type: 'startRadar', songs })
    s = playerReducer(s, { type: 'playList', songs, start: 0 })
    expect(s.radar).toBe(false)
  })

  const d = { id: 9, name: 'd', artist: 'w', cover: '', albumId: 0, artistId: 0 }

  it('enqueue 空队列直接开始播放', () => {
    const s = playerReducer(initialPlayerState, { type: 'enqueue', song: d })
    expect(s.queue).toHaveLength(1)
    expect(s.pos).toBe(0)
    expect(s.isPlaying).toBe(true)
  })
  it('enqueueNext 插入当前之后', () => {
    let s = play(0) // order [0,1,2], pos 0
    s = playerReducer(s, { type: 'enqueueNext', song: d })
    expect(s.queue).toHaveLength(4)
    expect(s.order[1]).toBe(3) // 新歌 queue 下标 3 插到 pos0 之后
  })
  it('enqueue 加到队尾', () => {
    let s = play(0)
    s = playerReducer(s, { type: 'enqueue', song: d })
    expect(s.order[s.order.length - 1]).toBe(3)
  })
  it('jumpTo 跳到指定位置并播放', () => {
    let s = play(0)
    s = playerReducer(s, { type: 'jumpTo', pos: 2 })
    expect(s.pos).toBe(2)
    expect(s.isPlaying).toBe(true)
  })
  it('removeAt 移除当前之前的曲,pos 前移', () => {
    let s = play(2) // pos 2
    s = playerReducer(s, { type: 'removeAt', pos: 0 })
    expect(s.order).toEqual([1, 2])
    expect(s.order[s.pos]).toBe(2) // 当前仍是原来那首
  })
  it('removeAt 移除当前曲,同位置变为下一首', () => {
    let s = play(0) // order [0,1,2], pos 0
    s = playerReducer(s, { type: 'removeAt', pos: 0 })
    expect(s.order).toEqual([1, 2])
    expect(s.pos).toBe(0)
    expect(s.order[s.pos]).toBe(1)
  })
})
