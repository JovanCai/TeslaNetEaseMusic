# 阶段 0 验证结果

## 8a — API 层 + 本机链路(2026-07-21,已通过)

环境:docker compose(nginx + moefurina/ncm-api),账号「我是糕手」黑胶VIP(vipType 11),验证曲 海阔天空 id=1357375695。

- [x] 静态页经 nginx 返回 200
- [x] `/api/search` 免登录返回真实结果
- [x] `/api/song/url/v1` 经 nginx 注入真实 cookie,取到播放地址
- [x] **I-1 修复实测**:后端返回 http:// 地址;升级为 https:// 后 CDN 返回 `200 audio/mpeg`——车机走 https 不会被混合内容拦截
- [x] `/api/lyric` 返回 37 行时间轴歌词
- [x] 硬约束:ENABLE_GENERAL_UNBLOCK=false;realIP 未配置(默认关);MUSIC_U 仅在 nginx 服务器端,前端 dist 中 grep 无

## 8a — 浏览器可视化(Chrome)

- [x] 用户在 Chrome 实测:听到《海阔天空》、歌词逐行滚动(2026-07-21 确认)

## 8b — 真车(待在车上做)

- [ ] 车机能加载 / 走车载扬声器 / 屏幕保活 / 行驶中可用(建议 https 暴露,如 cloudflared)
