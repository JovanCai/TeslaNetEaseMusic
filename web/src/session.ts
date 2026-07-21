async function post(path: string, body?: unknown) {
  const r = await fetch(`/session${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export const sessionApi = {
  status: () => fetch('/session/status').then((r) => r.json()) as Promise<{ loggedIn: boolean }>,
  qrKey: () => post('/qr/key') as Promise<{ unikey: string | null }>,
  qrCreate: (key: string) => post('/qr/create', { key }) as Promise<{ qrimg: string | null }>,
  qrCheck: (key: string) => post('/qr/check', { key }) as Promise<{ code: number; loggedIn: boolean }>,
}
