import { useRef, useSyncExternalStore } from 'react'

type Fields = Record<string, string | number | boolean | null>
let snapshot = { enabled: false, lines: [] as string[] }
const listeners = new Set<() => void>()
let dispose: (() => void) | undefined
const emit = () => listeners.forEach(fn => fn())
export const diagnosticSnapshot = () => snapshot
export const useDiagnostics = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }, diagnosticSnapshot)

// Only explicitly selected fields are passed by callers: never response bodies, cookies or signed URLs.
export function diagnostic(event: string, fields: Fields = {}) {
  if (!snapshot.enabled) return
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify({ visibility: document.visibilityState, ...fields })}`
  snapshot = { enabled: true, lines: [...snapshot.lines.slice(-299), line] }
  emit()
}

// Stable reference for comparing artwork/source changes without retaining the URL.
export function mediaFingerprint(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return value ? (hash >>> 0).toString(16) : 'none'
}

export function setDiagnostics(enabled: boolean) {
  dispose?.(); dispose = undefined
  snapshot = { enabled, lines: [] }; emit()
  if (!enabled) return
  const bindings: Array<[EventTarget, string]> = [[document, 'visibilitychange'], [document, 'freeze'], [document, 'resume'], [window, 'online'], [window, 'offline'], [window, 'pageshow'], [window, 'pagehide']]
  const report = (e: Event) => diagnostic(`page.${e.type}`, { online: navigator.onLine })
  bindings.forEach(([target, event]) => target.addEventListener(event, report))
  dispose = () => bindings.forEach(([target, event]) => target.removeEventListener(event, report))
  diagnostic('diagnostics.enabled', { version: 'playback-diagnostics-v1', online: navigator.onLine })
  window.dispatchEvent(new Event('tm-diagnostic-snapshot'))
}
export function clearDiagnostics() { snapshot = { ...snapshot, lines: [] }; emit() }

export function useDiagnosticEntry(onEnter: () => void) {
  const taps = useRef({ count: 0, time: 0 })
  return () => {
    const now = Date.now()
    taps.current.count = now - taps.current.time > 1500 ? 1 : taps.current.count + 1
    taps.current.time = now
    if (taps.current.count === 8) { taps.current.count = 0; onEnter() }
  }
}
