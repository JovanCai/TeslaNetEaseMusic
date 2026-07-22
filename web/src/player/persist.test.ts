import { describe, it, expect, beforeEach } from 'vitest'
import { loadPersisted, savePersisted } from './persist'

const sample = {
  queue: [{ id: 1, name: 'a', artist: 'x', cover: '', albumId: 0 }],
  order: [0], pos: 0, shuffle: false, repeat: 'all' as const, radar: true, volume: 0.4,
}

beforeEach(() => localStorage.clear())

describe('persist', () => {
  it('无数据时返回 null', () => expect(loadPersisted()).toBeNull())
  it('存后能原样读回', () => {
    savePersisted(sample)
    expect(loadPersisted()).toEqual(sample)
  })
  it('损坏数据返回 null 而不抛错', () => {
    localStorage.setItem('tm.player.v1', '{not json')
    expect(loadPersisted()).toBeNull()
  })
  it('缺少 queue/order 结构视为无效', () => {
    localStorage.setItem('tm.player.v1', JSON.stringify({ volume: 1 }))
    expect(loadPersisted()).toBeNull()
  })
})
