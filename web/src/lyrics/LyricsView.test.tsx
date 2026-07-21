import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LyricsView } from './LyricsView'

const lines = [{ timeMs: 0, text: 'l0' }, { timeMs: 1000, text: 'l1' }, { timeMs: 2000, text: 'l2' }]

describe('LyricsView', () => {
  it('渲染全部歌词行', () => {
    render(<LyricsView lines={lines} activeIndex={1} />)
    expect(screen.getByText('l0')).toBeInTheDocument()
    expect(screen.getByText('l2')).toBeInTheDocument()
  })
  it('仅当前行标记为 active', () => {
    render(<LyricsView lines={lines} activeIndex={1} />)
    expect(screen.getByText('l1').getAttribute('data-active')).toBe('true')
    expect(screen.getByText('l0').getAttribute('data-active')).toBe('false')
  })
  it('无歌词时显示占位', () => {
    render(<LyricsView lines={[]} activeIndex={-1} />)
    expect(screen.getByText('暂无歌词')).toBeInTheDocument()
  })
})
