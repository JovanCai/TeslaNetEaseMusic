import express, { Router } from 'express'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// 车机诊断日志上传:存到服务器的诊断目录(docker-compose 把它挂到项目下的 diagnostics/,宿主机上直接能看)。
// 最多保留 KEEP 份;也可通过 /diag/files/<名字> 下载(同样受访问密码保护)。
const KEEP = 30
const MAX_BYTES = 2 * 1024 * 1024
const NAME_RE = /^diag-[0-9TZ-]+\.log$/

export function diagRouter({ dir, now = () => new Date() }) {
  const r = Router()
  r.use(express.json({ limit: MAX_BYTES })) // 日志比普通请求大得多,单独放宽(全局 json 只有 100kb)

  r.post('/upload', (req, res) => {
    const text = req.body?.text
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: '日志为空' })
    const name = `diag-${now().toISOString().replace(/[:.]/g, '-')}.log`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, name), text, 'utf8')
      const old = readdirSync(dir).filter((f) => NAME_RE.test(f)).sort()
      for (const f of old.slice(0, Math.max(0, old.length - KEEP))) unlinkSync(join(dir, f))
    } catch (e) {
      return res.status(500).json({ error: `保存失败: ${e}` })
    }
    res.json({ name, url: `/diag/files/${name}` })
  })

  r.get('/files/:name', (req, res) => {
    const { name } = req.params
    const path = join(dir, name)
    if (!NAME_RE.test(name) || !existsSync(path)) return res.status(404).json({ error: 'not found' })
    res.type('text/plain; charset=utf-8').send(readFileSync(path, 'utf8'))
  })

  return r
}
