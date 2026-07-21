import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function createCookieStore(path) {
  return {
    read() {
      try { return existsSync(path) ? (readFileSync(path, 'utf8').trim() || null) : null }
      catch { return null }
    },
    write(musicU) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, musicU ?? '', 'utf8')
    },
    status() { return { loggedIn: !!this.read() } },
  }
}
