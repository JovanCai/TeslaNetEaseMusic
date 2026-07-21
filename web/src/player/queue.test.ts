import { describe, it, expect } from 'vitest'
import { nextIndex, prevIndex, buildShuffleOrder } from './queue'

describe('nextIndex', () => {
  it('普通前进', () => expect(nextIndex(3, 0, 'off')).toBe(1))
  it('末尾 off 返回 -1', () => expect(nextIndex(3, 2, 'off')).toBe(-1))
  it('末尾 all 回到 0', () => expect(nextIndex(3, 2, 'all')).toBe(0))
  it('单曲 one 停在原地', () => expect(nextIndex(3, 1, 'one')).toBe(1))
})
describe('prevIndex', () => {
  it('普通后退', () => expect(prevIndex(3, 2)).toBe(1))
  it('首个后退夹在 0', () => expect(prevIndex(3, 0)).toBe(0))
})
describe('buildShuffleOrder', () => {
  it('current 打头且是全排列', () => {
    const order = buildShuffleOrder(4, 2)
    expect(order[0]).toBe(2)
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})
