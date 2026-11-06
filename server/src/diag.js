import express, { Router } from 'express'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// 车机诊断日志上传。
// - 配置了 GITHUB_GIST_TOKEN:存成私密(secret)Gist,返回 Gist 地址,手机/电脑登录 GitHub 就能看到
// - 无论是否配置,都在数据卷里留一份(最多 KEEP 份),可通过 /diag/files/<名字> 下载(同样受访问密码保护)
const KEEP = 30
const MAX_BYTES = 2 * 1024 * 1024
const NAME_RE = /^diag-[0-9TZ-]+\.log$/

export function diagRouter({ dir, token = '', fetchImpl = fetch, now = () => new Date() }) {
  const r = Router()
  r.use(express.json({ limit: MAX_BYTES })) // 日志比普通请求大得多,单独放宽(全局 json 只有 100kb)

  r.post('/upload', async (req, res) => {
    const text = req.body?.text
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: '日志为空' })
    const name = `diag-${now().toISOString().replace(/[:.]/g, '-')}.log`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, name), text, 'utf8')
      const old = readdirSync(dir).filter((f) => NAME_RE.test(f)).sort()
      for (const f of old.slice(0, Math.max(0, old.length - KEEP))) unlinkSync(join(dir, f))
    } catch (e) {
      if (!token) return res.status(500).json({ error: `保存失败: ${e}` })
    }
    if (!token) return res.json({ url: `/diag/files/${name}`, where: 'server' })
    try {
      const g = await fetchImpl('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'TeslaNetEaseMusic',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ description: `TeslaNetEaseMusic 播放诊断 ${name}`, public: false, files: { [name]: { content: text } } }),
      })
      const j = await g.json().catch(() => ({}))
      if (!g.ok || !j?.html_url) {
        // Gist 失败(token 过期/权限不足)时退回服务器上的那份,不让这次记录白费
        return res.json({ url: `/diag/files/${name}`, where: 'server', warning: `GitHub ${g.status}: ${j?.message ?? ''}` })
      }
      res.json({ url: j.html_url, where: 'gist' })
    } catch (e) {
      res.json({ url: `/diag/files/${name}`, where: 'server', warning: String(e) })
    }
  })

  r.get('/files/:name', (req, res) => {
    const { name } = req.params
    const path = join(dir, name)
    if (!NAME_RE.test(name) || !existsSync(path)) return res.status(404).json({ error: 'not found' })
    res.type('text/plain; charset=utf-8').send(readFileSync(path, 'utf8'))
  })

  return r
}
