import { afterEach, expect, it } from 'vitest'
import { loadDisplayScale, setDisplayScale } from './displayScale'
afterEach(() => { localStorage.clear(); setDisplayScale(1) })
it('remembers scale and uses the expanded layout width for breakpoints', () => {
  const old = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
  setDisplayScale(0.7)
  expect(loadDisplayScale()).toBe(0.7)
  expect(document.documentElement.dataset.wide).toBe('true')
  setDisplayScale(1)
  expect(document.documentElement.dataset.wide).toBe('false')
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: old })
})
it('rejects corrupt stored scales', () => {
  localStorage.setItem('tm.displayScale', '0.01')
  expect(loadDisplayScale()).toBe(1)
  setDisplayScale(NaN)
  expect(loadDisplayScale()).toBe(1)
})
