import { describe, it, expect, beforeEach } from 'vitest'
import { loadLowData, saveLowData, loadQuality, LOW_LEVEL, QUALITIES } from './quality'

describe('省流模式(lowdata)持久化', () => {
  beforeEach(() => localStorage.clear())

  it('默认关闭', () => {
    expect(loadLowData()).toBe(false)
  })

  it('保存后可读回,存的是 0/1 而非 true/false', () => {
    saveLowData(true)
    expect(localStorage.getItem('tm.lowdata')).toBe('1')
    expect(loadLowData()).toBe(true)
    saveLowData(false)
    expect(localStorage.getItem('tm.lowdata')).toBe('0')
    expect(loadLowData()).toBe(false)
  })

  it('LOW_LEVEL 是最低档且确实在音质表里', () => {
    expect(LOW_LEVEL).toBe('standard')
    expect(QUALITIES[0].id).toBe(LOW_LEVEL) // 表里第一档就是最低码率
  })

  it('省流与用户选的音质互不覆盖(各自独立的 key)', () => {
    saveLowData(true)
    expect(loadQuality()).toBe('exhigh') // 默认音质不受省流开关影响
    expect(loadLowData()).toBe(true)
  })
})
