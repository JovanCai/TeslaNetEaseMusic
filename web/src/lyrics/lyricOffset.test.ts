import { describe, it, expect, beforeEach } from 'vitest'
import { getLyricOffset, setLyricOffset, formatOffset, OFFSET_LIMIT } from './lyricOffset'

beforeEach(() => localStorage.clear())

describe('lyricOffset', () => {
  it('按歌记忆,默认 0', () => {
    expect(getLyricOffset(1)).toBe(0)
    setLyricOffset(1, 500)
    expect(getLyricOffset(1)).toBe(500)
    expect(getLyricOffset(2)).toBe(0)
  })
  it('归零时删除记录;超出上限被夹住', () => {
    setLyricOffset(1, 500)
    setLyricOffset(1, 0)
    expect(localStorage.getItem('tm.lyricoffset')).toBe('{}')
    expect(setLyricOffset(1, 99_999)).toBe(OFFSET_LIMIT)
  })
  it('超过条数上限时丢弃最久未改的', () => {
    for (let i = 1; i <= 301; i++) setLyricOffset(i, 500)
    expect(getLyricOffset(1)).toBe(0)
    expect(getLyricOffset(301)).toBe(500)
  })
  it('格式化', () => {
    expect(formatOffset(1500)).toBe('+1.5s')
    expect(formatOffset(-500)).toBe('−0.5s')
    expect(formatOffset(0)).toBe('±0.0s')
  })
})
