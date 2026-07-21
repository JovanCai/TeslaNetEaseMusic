import { describe, it, expect, vi, afterEach } from 'vitest'
import { sessionApi } from './session'

afterEach(() => vi.restoreAllMocks())

describe('sessionApi', () => {
  it('qrCheck POST 到 /session/qr/check 并回传结果', async () => {
    const f = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: 803, loggedIn: true }) })
    vi.stubGlobal('fetch', f)
    const r = await sessionApi.qrCheck('K')
    expect(f.mock.calls[0][0]).toBe('/session/qr/check')
    expect(r).toEqual({ code: 803, loggedIn: true })
  })
  it('status GET /session/status', async () => {
    const f = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ loggedIn: false }) })
    vi.stubGlobal('fetch', f)
    expect(await sessionApi.status()).toEqual({ loggedIn: false })
    expect(f.mock.calls[0][0]).toBe('/session/status')
  })
})
