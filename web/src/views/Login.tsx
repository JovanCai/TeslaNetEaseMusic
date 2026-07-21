import { useEffect, useRef, useState } from 'react'
import { sessionApi } from '../session'

export function Login({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let key = ''
    async function freshQr() {
      const k = await sessionApi.qrKey()
      key = k.unikey ?? ''
      const c = await sessionApi.qrCreate(key)
      setQr(c.qrimg ?? '')
    }
    ;(async () => {
      await freshQr()
      timer.current = window.setInterval(async () => {
        const r = await sessionApi.qrCheck(key)
        if (r.loggedIn) { window.clearInterval(timer.current); onDone() }
        else if (r.code === 800) { await freshQr() } // 二维码过期,刷新
      }, 2000)
    })()
    return () => window.clearInterval(timer.current)
  }, [onDone])

  return (
    <div className="login">
      <h1 className="neon-text">tesla-music</h1>
      <p className="login-tip">用手机网易云 App 扫码登录</p>
      {qr && <img className="login-qr glass" src={qr} alt="登录二维码" />}
    </div>
  )
}
