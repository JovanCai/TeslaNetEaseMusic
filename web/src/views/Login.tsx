import { useEffect, useRef, useState } from 'react'
import { sessionApi } from '../session'

export function Login({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let key = ''
    let stopped = false

    // 取二维码;失败(如后端刚启动还没就绪)返回 false,由调用方重试。
    async function freshQr(): Promise<boolean> {
      try {
        const k = await sessionApi.qrKey()
        key = k.unikey ?? ''
        if (!key) return false
        const c = await sessionApi.qrCreate(key)
        if (!c.qrimg) return false
        setQr(c.qrimg)
        return true
      } catch {
        return false
      }
    }

    ;(async () => {
      // 初次取码重试到成功(应对 ncm-api 启动慢)
      while (!stopped && !(await freshQr())) {
        await new Promise((r) => setTimeout(r, 1500))
      }
      timer.current = window.setInterval(async () => {
        try {
          if (!key) { await freshQr(); return }
          const r = await sessionApi.qrCheck(key)
          if (r.loggedIn) { window.clearInterval(timer.current); onDone() }
          else if (r.code === 800) { await freshQr() } // 二维码过期,刷新
        } catch { /* 忽略,下次轮询再试 */ }
      }, 2000)
    })()

    return () => { stopped = true; window.clearInterval(timer.current) }
  }, [onDone])

  return (
    <div className="login">
      <h1 className="neon-text">TeslaNetEaseMusic</h1>
      <p className="login-tip">用手机网易云 App 扫码登录</p>
      {qr
        ? <img className="login-qr glass" src={qr} alt="登录二维码" />
        : <p className="login-tip">二维码加载中…</p>}
    </div>
  )
}
