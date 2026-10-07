import { AUTH_REQUIRED_EVENT } from './api'

async function checked(r: Response) {
  if (r.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
  return r.json()
}

async function post(path: string, body?: unknown) {
  const r = await fetch(`/session${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return checked(r)
}

export const sessionApi = {
  status: () => fetch('/session/status').then(checked) as Promise<{ loggedIn: boolean }>,
  qrKey: () => post('/qr/key') as Promise<{ unikey: string | null }>,
  qrCreate: (key: string) => post('/qr/create', { key }) as Promise<{ qrimg: string | null }>,
  qrCheck: (key: string) => post('/qr/check', { key }) as Promise<{ code: number; loggedIn: boolean }>,
}

// 访问密码(后端设置了 APP_PASSWORD 时才需要)
export const authApi = {
  status: () => fetch('/auth/status').then((r) => r.json()) as Promise<{ required: boolean; ok: boolean }>,
  login: async (password: string): Promise<{ ok: boolean; error?: string }> => {
    const r = await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    return r.json()
  },
}
