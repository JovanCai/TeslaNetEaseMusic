import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagRouter } from '../src/diag.js'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'diag-')) })

function makeApp(opts) {
  const app = express()
  app.use('/diag', diagRouter({ dir, now: () => new Date('2026-11-07T10:00:00.000Z'), ...opts }))
  app.use(express.json()) // 全局 json 在后面:大日志不会被它的 100kb 上限拦掉
  return app
}

describe('diagRouter', () => {
  it('没配 token:存到服务器并可下载', async () => {
    const app = makeApp({})
    const res = await request(app).post('/diag/upload').send({ text: 'hello log' })
    expect(res.body).toEqual({ url: '/diag/files/diag-2026-11-07T10-00-00-000Z.log', where: 'server' })
    const file = await request(app).get(res.body.url)
    expect(file.text).toBe('hello log')
  })

  it('配了 token:建私密 Gist,返回 Gist 地址', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ html_url: 'https://gist.github.com/u/1' }) }))
    const res = await request(makeApp({ token: 'T', fetchImpl })).post('/diag/upload').send({ text: 'x' })
    expect(res.body).toEqual({ url: 'https://gist.github.com/u/1', where: 'gist' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.github.com/gists')
    expect(init.headers.Authorization).toBe('Bearer T')
    expect(JSON.parse(init.body).public).toBe(false)
  })

  it('Gist 失败时退回服务器上的副本', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) }))
    const res = await request(makeApp({ token: 'T', fetchImpl })).post('/diag/upload').send({ text: 'x' })
    expect(res.body.where).toBe('server')
    expect(res.body.warning).toContain('401')
  })

  it('接受超过 100kb 的日志;空日志 400;非法文件名 404', async () => {
    const app = makeApp({})
    expect((await request(app).post('/diag/upload').send({ text: 'a'.repeat(500_000) })).status).toBe(200)
    expect((await request(app).post('/diag/upload').send({ text: '  ' })).status).toBe(400)
    expect((await request(app).get('/diag/files/..%2Fcookie')).status).toBe(404)
  })

  it('只保留最近 30 份', async () => {
    let t = Date.parse('2026-11-07T00:00:00Z')
    const app = express()
    app.use('/diag', diagRouter({ dir, now: () => new Date((t += 1000)) }))
    for (let i = 0; i < 33; i++) await request(app).post('/diag/upload').send({ text: `log ${i}` })
    expect(readdirSync(dir)).toHaveLength(30)
  })
})
