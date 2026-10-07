import { useState } from 'react'
import { authApi } from '../session'

// 访问密码(部署时设置了 APP_PASSWORD 才会出现)。通过后服务端下发长期有效的 cookie,车机只需输一次。
export function Unlock() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!pw || busy) return
    setBusy(true); setMsg('')
    try {
      const r = await authApi.login(pw)
      if (r.ok) { window.location.reload(); return } // 重载:让播放器等各处用新凭证重新初始化
      setMsg(r.error === 'locked' ? '尝试次数过多,请 10 分钟后再试' : '密码不对')
    } catch {
      setMsg('连接失败,请稍后再试')
    }
    setBusy(false)
  }

  return (
    <div className="login">
      <h1 className="neon-text">TeslaNetEaseMusic</h1>
      <p className="login-tip">请输入访问密码</p>
      <div className="search-bar unlock-bar">
        <input className="search-input" type="password" value={pw} autoFocus
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="访问密码" />
        <button className="tap search-go" disabled={busy} onClick={submit}>进入</button>
      </div>
      {msg && <p className="login-tip unlock-msg">{msg}</p>}
    </div>
  )
}
