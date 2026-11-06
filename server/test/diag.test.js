import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagRouter } from '../src/diag.js'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'diag-')) })

function makeApp(now = () => new Date('2026-11-07T10:00:00.000Z')) {
  const app = express()
  app.use('/diag', diagRouter({ dir, now }))
  app.use(express.json()) // 全局 json 在后面:大日志不会被它的 100kb 上限拦掉
  return app
}

describe('diagRouter', () => {
  it('保存到诊断目录,返回文件名,并可下载', async () => {
    const app = makeApp()
    const res = await request(app).post('/diag/upload').send({ text: '你好 log' })
    expect(res.body).toEqual({ name: 'diag-2026-11-07T10-00-00-000Z.log', url: '/diag/files/diag-2026-11-07T10-00-00-000Z.log' })
    expect(readFileSync(join(dir, res.body.name), 'utf8')).toBe('你好 log')
    expect((await request(app).get(res.body.url)).text).toBe('你好 log')
  })

  it('接受超过 100kb 的日志;空日志 400;非法文件名 404', async () => {
    const app = makeApp()
    expect((await request(app).post('/diag/upload').send({ text: 'a'.repeat(500_000) })).status).toBe(200)
    expect((await request(app).post('/diag/upload').send({ text: '  ' })).status).toBe(400)
    expect((await request(app).get('/diag/files/..%2Fcookie')).status).toBe(404)
  })

  it('只保留最近 30 份', async () => {
    let t = Date.parse('2026-11-07T00:00:00Z')
    const app = makeApp(() => new Date((t += 1000)))
    for (let i = 0; i < 33; i++) await request(app).post('/diag/upload').send({ text: `log ${i}` })
    expect(readdirSync(dir)).toHaveLength(30)
  })
})
