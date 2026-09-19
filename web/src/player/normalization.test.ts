import { expect, it } from 'vitest'
import { normalizationFactor } from './normalization'
it('converts dB gain to amplitude and caps amplification and invalid metadata', () => {
  expect(normalizationFactor({ gain: -6.0206 })).toBeCloseTo(0.5)
  expect(normalizationFactor({ gain: 9 })).toBe(1)
  expect(normalizationFactor({ gain: 0, peak: 2 })).toBe(0.5)
  expect(normalizationFactor()).toBe(1)
  expect(normalizationFactor({ gain: NaN })).toBe(1)
  expect(normalizationFactor({ gain: -Infinity })).toBe(1)
})
