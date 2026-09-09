import { useState } from 'react'
import { clearDiagnostics, setDiagnostics, useDiagnostics } from './diagnostics'
import './diagnostics.css'

export function DiagnosticPanel() {
  const { enabled, lines } = useDiagnostics()
  const [minimized, setMinimized] = useState(false)
  if (!enabled) return null
  return <aside className="diagnostic-panel" aria-label="播放诊断" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    <div className="diagnostic-tools">
      <strong>播放诊断 · {lines.length}/300</strong>
      <button onClick={() => setMinimized(!minimized)}>{minimized ? '展开日志' : '收起日志'}</button>
      {!minimized && <button onClick={clearDiagnostics}>清空日志</button>}
      <button onClick={() => setDiagnostics(false)}>退出诊断</button>
    </div>
    {!minimized && <>
      <p>收起后继续记录；退出或刷新后关闭并清空。仅记录本页，不上传。封面指纹仅代表网页提交的信息，无法读取车机控件实际显示。</p>
      <textarea aria-label="诊断日志" readOnly value={[...lines].reverse().join('\n')} spellCheck={false} />
    </>}
  </aside>
}
