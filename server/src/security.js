// 基础安全加固(无第三方依赖)。

// 安全响应头:不允许被别的网站嵌入(防点击劫持)、禁止 MIME 嗅探、跨站只带来源域名。
// 不设完整 CSP:封面/音频来自网易云多个 CDN 域名,写死白名单容易误伤播放。
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  })
  next()
}

// 拒绝来自其他网站的请求(防 CSRF):红心、FM 不喜欢、听歌上报都是 GET,
// 别的网站放个链接就能借你的登录态触发。现代浏览器(含车机)都会带 Sec-Fetch-Site;
// 没有这个头(老浏览器、curl)时放行,不影响兼容性。
export function blockCrossSite(req, res, next) {
  if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'cross-site' })
  next()
}
