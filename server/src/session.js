import { Router } from 'express'

export function sessionRouter({ ncmBase, store, now = () => Date.now() }) {
  const r = Router()

  r.get('/status', (req, res) => res.json(store.status()))

  r.post('/qr/key', async (req, res) => {
    try {
      const j = await (await fetch(`${ncmBase}/login/qr/key?timestamp=${now()}`)).json()
      res.json({ unikey: j?.data?.unikey ?? null })
    } catch (e) { res.status(502).json({ error: 'upstream', detail: String(e) }) }
  })

  r.post('/qr/create', async (req, res) => {
    try {
      const key = encodeURIComponent(req.body?.key ?? '')
      const j = await (await fetch(`${ncmBase}/login/qr/create?key=${key}&qrimg=true&timestamp=${now()}`)).json()
      res.json({ qrimg: j?.data?.qrimg ?? null })
    } catch (e) { res.status(502).json({ error: 'upstream', detail: String(e) }) }
  })

  r.post('/qr/check', async (req, res) => {
    try {
      const key = encodeURIComponent(req.body?.key ?? '')
      const j = await (await fetch(`${ncmBase}/login/qr/check?key=${key}&timestamp=${now()}`)).json()
      if (j?.code === 803) {
        const m = /MUSIC_U=([^;]+)/.exec(j?.cookie || '')
        if (m) store.write(m[1])
      }
      res.json({ code: j?.code, loggedIn: store.status().loggedIn })
    } catch (e) { res.status(502).json({ error: 'upstream', detail: String(e) }) }
  })

  return r
}
