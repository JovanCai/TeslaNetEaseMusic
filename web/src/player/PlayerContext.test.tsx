import { describe, it, expect } from 'vitest'
import { playerReducer, initialPlayerState } from './PlayerContext'

const songs = [
  { id: 1, name: 'a', artist: 'x', cover: '' },
  { id: 2, name: 'b', artist: 'y', cover: '' },
]

describe('playerReducer', () => {
  it('playList 设置队列并定位', () => {
    const s = playerReducer(initialPlayerState, { type: 'playList', songs, start: 1 })
    expect(s.queue).toHaveLength(2)
    expect(s.index).toBe(1)
    expect(s.isPlaying).toBe(true)
  })
  it('cycleRepeat 循环 off→all→one→off', () => {
    let s = { ...initialPlayerState }
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('all')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('one')
    s = playerReducer(s, { type: 'cycleRepeat' }); expect(s.repeat).toBe('off')
  })
  it('next 到末尾 off 保持并停', () => {
    let s = playerReducer(initialPlayerState, { type: 'playList', songs, start: 1 })
    s = playerReducer(s, { type: 'next' })
    expect(s.index).toBe(1); expect(s.isPlaying).toBe(false)
  })
})
