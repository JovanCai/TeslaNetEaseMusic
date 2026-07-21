import { describe, it, expect } from 'vitest'
import { parseLrc, getCurrentLineIndex } from './parseLrc'

describe('parseLrc', () => {
  it('解析基本时间戳', () => {
    expect(parseLrc('[00:01.00]hello\n[00:03.50]world')).toEqual([
      { timeMs: 1000, text: 'hello' },
      { timeMs: 3500, text: 'world' },
    ])
  })
  it('忽略元数据行与空行', () => {
    expect(parseLrc('[ti:Song]\n[ar:X]\n\n[00:02.00]a')).toEqual([{ timeMs: 2000, text: 'a' }])
  })
  it('一行多时间戳拆成多行并排序', () => {
    expect(parseLrc('[00:05.00][00:01.00]repeat')).toEqual([
      { timeMs: 1000, text: 'repeat' },
      { timeMs: 5000, text: 'repeat' },
    ])
  })
  it('支持两位毫秒', () => {
    expect(parseLrc('[01:02.5]x')).toEqual([{ timeMs: 62500, text: 'x' }])
  })
})

describe('getCurrentLineIndex', () => {
  const lines = [{ timeMs: 1000, text: 'a' }, { timeMs: 3000, text: 'b' }, { timeMs: 5000, text: 'c' }]
  it('早于首行返回 -1', () => expect(getCurrentLineIndex(lines, 0)).toBe(-1))
  it('区间内取上一行', () => expect(getCurrentLineIndex(lines, 3500)).toBe(1))
  it('正好命中', () => expect(getCurrentLineIndex(lines, 5000)).toBe(2))
  it('晚于末行取末行', () => expect(getCurrentLineIndex(lines, 9999)).toBe(2))
  it('空歌词返回 -1', () => expect(getCurrentLineIndex([], 100)).toBe(-1))
})
