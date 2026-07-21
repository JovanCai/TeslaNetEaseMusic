import { describe, it, expect } from 'vitest'
import { randomChinaIP } from '../src/cnip.js'

const LEADING = new Set([58, 61, 116, 117, 119, 120, 122, 171, 182, 210, 223])

describe('randomChinaIP', () => {
  it('是合法 IPv4', () => {
    for (let i = 0; i < 50; i++) {
      const ip = randomChinaIP()
      const parts = ip.split('.').map(Number)
      expect(parts).toHaveLength(4)
      expect(parts.every((p) => p >= 0 && p <= 255)).toBe(true)
    }
  })
  it('首段落在预置的中国大陆段内', () => {
    for (let i = 0; i < 50; i++) {
      expect(LEADING.has(Number(randomChinaIP().split('.')[0]))).toBe(true)
    }
  })
})
