import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { diagnostic, diagnosticSnapshot, setDiagnostics, useDiagnosticEntry } from './diagnostics'
import { DiagnosticPanel } from './DiagnosticPanel'

afterEach(() => { cleanup(); setDiagnostics(false); vi.restoreAllMocks() })

it('records nothing by default and keeps at most 300 entries when enabled', () => {
  diagnostic('ignored')
  expect(diagnosticSnapshot().lines).toEqual([])
  setDiagnostics(true)
  for (let i = 0; i < 350; i++) diagnostic('test', { index: i })
  expect(diagnosticSnapshot().lines).toHaveLength(300)
  expect(diagnosticSnapshot().lines.at(-1)).toContain('349')
  setDiagnostics(false)
  diagnostic('ignored')
  expect(diagnosticSnapshot().lines).toEqual([])
})

it('requires eight consecutive taps and resets after a gap', () => {
  let now = 10000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const enter = vi.fn()
  const { result } = renderHook(() => useDiagnosticEntry(enter))
  for (let i = 0; i < 7; i++) result.current()
  expect(enter).not.toHaveBeenCalled()
  now += 2000
  result.current()
  expect(enter).not.toHaveBeenCalled()
  for (let i = 0; i < 7; i++) result.current()
  expect(enter).toHaveBeenCalledTimes(1)
})

it('hides by default, continues recording while collapsed, and exits cleanly', () => {
  render(<DiagnosticPanel />)
  expect(screen.queryByLabelText('播放诊断')).toBeNull()
  act(() => setDiagnostics(true))
  fireEvent.click(screen.getByText('收起日志'))
  act(() => diagnostic('background-test'))
  expect(screen.queryByLabelText('诊断日志')).toBeNull()
  fireEvent.click(screen.getByText('展开日志'))
  expect((screen.getByLabelText('诊断日志') as HTMLTextAreaElement).value).toContain('background-test')
  fireEvent.click(screen.getByText('退出诊断'))
  expect(screen.queryByLabelText('播放诊断')).toBeNull()
  expect(diagnosticSnapshot().lines).toHaveLength(0)
})
