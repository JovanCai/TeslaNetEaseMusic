export interface ReplayGain { gain?: number; peak?: number }
// Keep native media playback (including background playback). Attenuate loud
// tracks; never exceed the user's volume or amplify beyond native volume=1.
export function normalizationFactor(data?: ReplayGain): number {
  if (typeof data?.gain !== 'number' || !Number.isFinite(data.gain)) return 1
  const factor = Math.min(1, 10 ** (Math.max(-30, Math.min(30, data.gain)) / 20))
  return typeof data.peak === 'number' && Number.isFinite(data.peak) && data.peak > 0
    ? Math.min(factor, 1 / data.peak) : factor
}
export function loadNormalization() {
  try { return localStorage.getItem('tm.normalize') !== '0' } catch { return true }
}
