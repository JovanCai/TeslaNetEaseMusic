# TeslaNetEaseMusic

在特斯拉车机上用的网易云音乐播放器:深空霓虹科技风、行车滚动歌词、日推 / 我的歌单 / 搜索 / 私人FM / 完整播放控制。自托管、登录你自己的账号。

---

## 🚀 部署(照着做,3 步)

> 需要:一台 **Mac 或装了 Docker 的电脑**、你的**手机**(用来扫码登录)。

**第 1 步 —— 装好并打开 Docker Desktop**
没装就去 https://www.docker.com/products/docker-desktop/ 下载安装,打开它(菜单栏出现鲸鱼图标就是好了)。

**第 2 步 —— 下载本项目并运行一条命令**
```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
cd TeslaNetEaseMusic
./deploy.sh
```

**第 3 步 —— 按提示操作**
脚本会自动:
1. 启动服务;
2. 弹出网页让你**用手机网易云 App 扫码登录**(扫一次,以后免登录);
3. 打印一行 `https://xxxx.trycloudflare.com` 地址。

把这行 **https 地址** 在**特斯拉车机浏览器**里打开 —— 完成 ✅

> 注意:这条 https 地址由你电脑上的隧道提供,所以**用车时电脑要开着、`deploy.sh` 那个终端窗口要留着**。想要"电脑关了也能用 / 地址固定不变",见 [DEPLOY.md](DEPLOY.md) 的 VPS 方案。

---

## 常见问题

- **地址打不开 / 变了**:`deploy.sh` 每次运行给的临时地址会变;重跑脚本拿新地址即可。要固定地址看 [DEPLOY.md](DEPLOY.md)。
- **要换账号 / 重新登录**:运行 `./relogin.sh`,再扫码。
- **更新到新版本**:`git pull && ./deploy.sh`(登录状态不受影响)。
- **想开区域解锁**(海外听灰色歌):编辑 `.env` 填 `VITE_REAL_IP=<一个国内IP>`,再重跑 `./deploy.sh`。默认关闭。

---

## 说明与边界

- **自托管,各用各的**:每个人跑自己的,登录自己的账号,不做中心服务,不持有他人凭证。
- **凭证不落浏览器**:登录 cookie 只存在你自己服务器的数据卷,车机浏览器里没有。
- **不做跨平台音源替换**;区域解锁默认关闭、开与不开责任自负。

技术细节、进阶部署(固定域名、VPS、Caddy/Cloudflare 命名隧道)见 [DEPLOY.md](DEPLOY.md);设计与实现文档在 `docs/`。
