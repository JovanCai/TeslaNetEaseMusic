import { describe, it, expect } from 'vitest'
import { playerReducer, initialPlayerState } from './PlayerContext'

const songs = [
  { id: 1, name: 'a', artist: 'x', cover: '' },
  { id: 2, name: 'b', artist: 'y', cover: '' },
  { id: 3, name: 'c', artist: 'z', cover: '' },
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
})
