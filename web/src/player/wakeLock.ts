type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<unknown> }
}

export async function requestWakeLock(): Promise<void> {
  try {
    await (navigator as WakeLockNavigator).wakeLock?.request('screen')
  } catch {
    /* 车机浏览器不支持则忽略 */
  }
}
