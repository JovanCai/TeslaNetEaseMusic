import { useEffect, useState } from 'react'
import { clearDiagnostics, diagnosticReport, setDiagnostics, setRecording, uploadDiagnostics, useDiagnostics } from './diagnostics'
import './diagnostics.css'

function elapsed(since: number, now: number) {
  if (!since) return '0:00'
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// 打开即开始记录;日志不实时刷屏,需要时点「查看日志」看一份定格的副本;复现后点「上传」。
export function DiagnosticPanel() {
  const { enabled, recording, lines, startedAt } = useDiagnostics()
  const [view, setView] = useState<string | null>(null) // 定格的日志副本
  const [upload, setUpload] = useState<{ state: 'idle' | 'busy' | 'done' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [recording])
  if (!enabled) return null

  async function doUpload() {
    setUpload({ state: 'busy', text: '' })
    try {
      const r = await uploadDiagnostics()
      setUpload({ state: 'done', text: `diagnostics/${r.name}` })
    } catch (e) {
      setUpload({ state: 'fail', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return <aside className="diagnostic-panel" aria-label="播放诊断" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    <div className="diagnostic-tools">
      <strong>{recording ? <><span className="diag-dot" />记录中 {elapsed(startedAt, now)}</> : '已暂停'} · {lines.length} 条</strong>
      <button onClick={() => setRecording(!recording)}>{recording ? '暂停记录' : '继续记录'}</button>
      <button onClick={doUpload} disabled={upload.state === 'busy' || lines.length === 0}>{upload.state === 'busy' ? '上传中…' : '上传日志'}</button>
      <button onClick={() => setView(view == null ? diagnosticReport() : null)}>{view == null ? '查看日志' : '收起日志'}</button>
      <button onClick={() => { clearDiagnostics(); setView(null); setUpload({ state: 'idle', text: '' }) }}>清空</button>
      <button onClick={() => setDiagnostics(false)}>退出诊断</button>
    </div>
    {upload.state === 'done' && <p className="diag-ok">已保存到服务器:<span className="diag-url">{upload.text}</span></p>}
    {upload.state === 'fail' && <p className="diag-fail">上传失败:{upload.text}</p>}
    {view == null
      ? <p>复现问题后点「上传日志」。收起播放页、切到地图都会继续记录;退出或刷新会清空。日志只含歌曲 id、播放状态和网络状况,不含登录信息。</p>
      : <textarea aria-label="诊断日志" readOnly value={view} spellCheck={false} />}
  </aside>
}
