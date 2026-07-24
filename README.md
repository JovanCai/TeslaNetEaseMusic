# TeslaNetEaseMusic

**简体中文** · [English](README.en.md) · [日本語](README.ja.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

面向在海外无法正常访问网易云音乐的特斯拉车主的自托管在线播放器。用户部署自己的实例、登录本人账号,在车机浏览器中播放曲库并显示行车滚动歌词。

## 概览

- **自托管**:每个用户运行独立实例,数据互不共享。
- **凭证隔离**:登录 cookie 仅保存在服务端数据卷,前端与车机浏览器不接触该凭证。
- **车机优化**:大按钮、深色高对比界面,卡拉 OK 式滚动歌词,支持居中与左右分栏两种布局。
- **公网访问**:内置 Cloudflare Tunnel,无需公网 IP 即可获得 HTTPS 地址。

## 功能

- 每日推荐、我的歌单、搜索、私人 FM(个性化电台流)
- 播放控制:播放/暂停、上一首/下一首、随机、循环、进度、音量
- 卡拉 OK 式滚动歌词,支持翻译对照;纯音乐显示占位提示
- 五套主题、专辑页与歌手页、播放队列、红心收藏
- 自动记忆上次的播放队列、进度、音量与设置
- 集成 Media Session,车机系统媒体卡片显示封面与曲目信息

## 界面

| 首页 · 私人FM | 播放页 · 滚动歌词 | 我的歌单 |
|---|---|---|
| ![首页](docs/screenshots/home.png) | ![播放页](docs/screenshots/player.png) | ![歌单](docs/screenshots/playlists.png) |

## 架构

- **前端**:Vite + React + TypeScript,构建为静态资源。
- **BFF**:Node/Express 服务,负责扫码登录、在服务端保存 cookie,并在转发请求时注入登录态。
- **音乐接口**:基于 `ncm-api` 容器提供网易云 API。
- **编排**:Docker Compose 启动上述服务;可选 Cloudflare Tunnel 对外暴露 HTTPS 地址。

## 部署

支持三种宿主环境,完整步骤见 [DEPLOY.md](DEPLOY.md)。

| 环境 | 方式 | 说明 |
|---|---|---|
| Mac / 本地电脑 | [Mac 一键脚本](DEPLOY.md#mac) | 部署最快;需在使用期间保持电脑开机 |
| 群晖 NAS | [NAS 部署](DEPLOY.md#nas) | 常年在线、地址固定,无需公网 IP |
| VPS / 云服务器 | [VPS 部署](DEPLOY.md#vps) | 稳定、地址固定 |

### 快速开始

在已安装 Docker 的 Mac 上执行:

```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
cd TeslaNetEaseMusic
./deploy.sh
```

脚本依次完成:启动服务、引导手机扫码登录、输出一个 `https://…` 公网地址。在特斯拉车机浏览器中打开该地址即可使用。

## 配置

配置项通过项目根目录的 `.env` 文件设置,修改后需重新部署。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `APP_PORT` | `80` | 对外服务端口;端口被占用时改为其他空闲端口 |
| `REGION_UNLOCK` | `false` | 区域解锁。开启后后端以随机中国 IP 发起请求,用于播放在海外变灰的**有版权**曲目,依赖本人账号权益 |
| `ENABLE_UNBLOCK` | `false` | 灰色歌曲替换。开启后从 QQ、酷狗等来源匹配同名曲目替换播放;匹配结果可能存在版本或音质差异 |

## 维护

- **重新登录 / 切换账号**:执行 `./relogin.sh` 后重新扫码。
- **更新版本**:`git pull` 后重新执行 `./deploy.sh`,登录状态保留。

## 隐私与安全

- 每个实例由用户独立部署,登录各自的网易云账号。
- 登录 cookie 仅存于服务端数据卷,不写入前端代码、浏览器存储或 URL。
- 播放能力取决于本人账号权益;区域解锁默认关闭,是否启用由用户自行决定。

## 许可证

本项目基于 [AGPL-3.0](LICENSE) 许可证发布。设计与实现文档位于 `docs/`。
