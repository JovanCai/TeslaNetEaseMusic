import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCookieStore } from '../src/cookieStore.js'

let store
beforeEach(() => { store = createCookieStore(join(mkdtempSync(join(tmpdir(), 'ck-')), 'cookie')) })

describe('cookieStore', () => {
  it('初始未登录', () => expect(store.status()).toEqual({ loggedIn: false }))
  it('写后可读且已登录', () => {
    store.write('abc123')
    expect(store.read()).toBe('abc123')
    expect(store.status()).toEqual({ loggedIn: true })
  })
  it('空值视为未登录', () => { store.write(''); expect(store.read()).toBeNull() })
})
