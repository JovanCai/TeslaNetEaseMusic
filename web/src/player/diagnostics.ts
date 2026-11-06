import { useRef, useSyncExternalStore } from 'react'
import { AUTH_REQUIRED_EVENT } from '../api'

type Fields = Record<string, string | number | boolean | null>
// enabled:诊断面板是否打开;recording:是否正在记录。打开即开始记录,可暂停后上传。
let snapshot = { enabled: false, recording: false, lines: [] as string[], startedAt: 0 }
const MAX_LINES = 3000 // 弱网问题往往要录十几分钟才复现,条数给足
const listeners = new Set<() => void>()
let dispose: (() => void) | undefined
const emit = () => listeners.forEach(fn => fn())
export const diagnosticSnapshot = () => snapshot
export const useDiagnostics = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }, diagnosticSnapshot)

// Only explicitly selected fields are passed by callers: never response bodies, cookies or signed URLs.
export function diagnostic(event: string, fields: Fields = {}) {
  if (!snapshot.recording) return
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify({ visibility: document.visibilityState, ...fields })}`
  snapshot = { ...snapshot, lines: [...snapshot.lines.slice(-(MAX_LINES - 1)), line] }
  emit()
}

// Stable reference for comparing artwork/source changes without retaining the URL.
export function mediaFingerprint(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return value ? (hash >>> 0).toString(16) : 'none'
}

// 网络状况(浏览器支持时):有效网络类型、估算带宽、往返延迟
// 不在记录时直接返回空对象:调用方常把它展开进日志字段,没必要每次都读
export function connectionInfo(): Fields {
  return snapshot.recording ? readConnection() : {}
}
function readConnection(): Fields {
  try {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
    return { online: navigator.onLine, net: c?.effectiveType ?? null, downlink: c?.downlink ?? null, rtt: c?.rtt ?? null }
  } catch { return {} }
}

export function setDiagnostics(enabled: boolean) {
  dispose?.(); dispose = undefined
  snapshot = { enabled, recording: false, lines: [], startedAt: 0 }; emit()
  if (!enabled) return
  const bindings: Array<[EventTarget, string]> = [[document, 'visibilitychange'], [document, 'freeze'], [document, 'resume'], [window, 'online'], [window, 'offline'], [window, 'pageshow'], [window, 'pagehide']]
  const report = (e: Event) => diagnostic(`page.${e.type}`, connectionInfo())
  bindings.forEach(([target, event]) => target.addEventListener(event, report))
  dispose = () => bindings.forEach(([target, event]) => target.removeEventListener(event, report))
  setRecording(true)
}

export function setRecording(recording: boolean) {
  if (!snapshot.enabled || snapshot.recording === recording) return
  snapshot = { ...snapshot, recording, startedAt: recording && !snapshot.startedAt ? Date.now() : snapshot.startedAt }
  emit()
  if (recording) {
    diagnostic('diagnostics.recording', { version: 'playback-diagnostics-v2', ...connectionInfo() })
    window.dispatchEvent(new Event('tm-diagnostic-snapshot')) // 让各模块补记一次当前状态
  }
}
export function clearDiagnostics() { snapshot = { ...snapshot, lines: [], startedAt: snapshot.recording ? Date.now() : 0 }; emit() }

// 导出的完整文本:开头是环境信息,后面按时间顺序的日志
export function diagnosticReport(): string {
  const head = [
    '# TeslaNetEaseMusic 播放诊断',
    `导出时间: ${new Date().toISOString()}`,
    `开始记录: ${snapshot.startedAt ? new Date(snapshot.startedAt).toISOString() : '-'}`,
    `浏览器: ${navigator.userAgent}`,
    `屏幕: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
    `网络: ${JSON.stringify(readConnection())}`,
    `条数: ${snapshot.lines.length}`,
    '',
  ]
  return [...head, ...snapshot.lines].join('\n')
}

// 上传到服务端:保存在部署目录下的 diagnostics/ 里。返回文件名(在宿主机上按它找文件)。
export async function uploadDiagnostics(): Promise<{ name: string; url: string }> {
  const r = await fetch('/diag/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: diagnosticReport() }) })
  if (r.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.name) throw new Error(j?.error || `upload ${r.status}`)
  return { name: j.name, url: j.url }
}

export function useDiagnosticEntry(onEnter: () => void) {
  const taps = useRef({ count: 0, time: 0 })
  return () => {
    const now = Date.now()
    taps.current.count = now - taps.current.time > 1500 ? 1 : taps.current.count + 1
    taps.current.time = now
    if (taps.current.count === 8) { taps.current.count = 0; onEnter() }
  }
}
