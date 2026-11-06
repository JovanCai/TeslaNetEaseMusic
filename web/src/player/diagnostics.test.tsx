import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { diagnostic, diagnosticReport, diagnosticSnapshot, setDiagnostics, setRecording, useDiagnosticEntry } from './diagnostics'
import { DiagnosticPanel } from './DiagnosticPanel'

afterEach(() => { cleanup(); setDiagnostics(false); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('默认不记录;打开即开始记录,最多保留 3000 条', () => {
  diagnostic('ignored')
  expect(diagnosticSnapshot().lines).toEqual([])
  setDiagnostics(true)
  expect(diagnosticSnapshot().recording).toBe(true)
  for (let i = 0; i < 3100; i++) diagnostic('test', { index: i })
  expect(diagnosticSnapshot().lines).toHaveLength(3000)
  expect(diagnosticSnapshot().lines.at(-1)).toContain('3099')
  setDiagnostics(false)
  diagnostic('ignored')
  expect(diagnosticSnapshot().lines).toEqual([])
})

it('暂停记录后不再追加,继续后接着记', () => {
  setDiagnostics(true)
  diagnostic('a')
  setRecording(false)
  diagnostic('during-pause')
  setRecording(true)
  diagnostic('b')
  const text = diagnosticSnapshot().lines.join('\n')
  expect(text).toContain(' a ')
  expect(text).not.toContain('during-pause')
  expect(text).toContain(' b ')
})

it('导出文本带环境信息头', () => {
  setDiagnostics(true)
  diagnostic('hello')
  const report = diagnosticReport()
  expect(report).toMatch(/^# TeslaNetEaseMusic 播放诊断/)
  expect(report).toContain('浏览器:')
  expect(report).toContain('hello')
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

it('面板不实时刷日志;查看时是定格副本;上传后显示地址;退出清空', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: 'diag-2026-11-07T10-00-00-000Z.log', url: '/diag/files/diag-2026-11-07T10-00-00-000Z.log' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<DiagnosticPanel />)
  expect(screen.queryByLabelText('播放诊断')).toBeNull()
  act(() => setDiagnostics(true))
  expect(screen.getByText(/记录中/)).toBeTruthy()
  expect(screen.queryByLabelText('诊断日志')).toBeNull()        // 默认不显示滚动日志
  fireEvent.click(screen.getByText('查看日志'))
  act(() => diagnostic('after-view'))
  expect((screen.getByLabelText('诊断日志') as HTMLTextAreaElement).value).not.toContain('after-view') // 定格
  fireEvent.click(screen.getByText('暂停记录'))
  expect(screen.getByText(/已暂停/)).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByText('上传日志')) })
  expect(fetchMock.mock.calls[0][0]).toBe('/diag/upload')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('after-view')
  expect(screen.getByText('diagnostics/diag-2026-11-07T10-00-00-000Z.log')).toBeTruthy()
  fireEvent.click(screen.getByText('退出诊断'))
  expect(screen.queryByLabelText('播放诊断')).toBeNull()
  expect(diagnosticSnapshot().lines).toHaveLength(0)
})
