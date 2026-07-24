# 部署指南

本项目由两个容器组成:`app`(网页 + 后端)与 `ncm-api`(网易云接口)。部署的目标是将其运行在一台常开机器上,并对外提供一个 **公网 HTTPS 地址**,供特斯拉车机浏览器访问。

下列三种宿主环境任选其一:

- [Mac / 本地电脑](#mac)
- [群晖 NAS(推荐)](#nas)
- [VPS / 云服务器](#vps)

**先决条件**:已安装 Docker;一部手机用于扫码登录(仅需一次)。

---

<a id="mac"></a>

## A. Mac / 本地电脑

适用于快速体验。使用期间需保持电脑开机、脚本窗口保留。

1. 安装并启动 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
2. 获取项目并运行部署脚本:
   ```bash
   git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
   cd TeslaNetEaseMusic
   ./deploy.sh
   ```
3. 按提示使用手机网易云 App 扫码登录。脚本结束时输出一行
   `https://xxxx.trycloudflare.com`。
4. 在特斯拉车机浏览器中打开该地址。

该临时地址每次运行都会变化。如需固定地址,请采用群晖或 VPS 方案。

---

<a id="nas"></a>

## B. 群晖 NAS(推荐)

群晖常年开机,适合长期使用。**无需公网 IP** —— Cloudflare Tunnel 由群晖主动向外建立连接,由 Cloudflare 分配公网 HTTPS 地址,无需端口映射。

固定地址需要一个托管在 Cloudflare 的域名(免费套餐即可;新域名约 ¥100/年)。

### 1) 安装 Docker
在 DSM 套件中心安装 **Container Manager**(旧版名为 Docker)。

### 2) 获取代码
通过 SSH 登录群晖后执行:
```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
cd TeslaNetEaseMusic
cp .env.example .env
# 群晖的 80 端口通常被 DSM 占用,建议在 .env 中另设端口:
#   APP_PORT=8920
```

### 3) 选择对外访问方式

**方式一:快速隧道(免费,地址临时;群晖常开时基本稳定)**
```bash
docker compose --profile quick up -d --build
# 等待约十余秒后获取地址:
docker compose logs cloudflared-quick | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```
在特斯拉浏览器中打开输出的 `https://xxxx.trycloudflare.com`。群晖重启后地址会变化,重新查看日志即可。

**方式二:命名隧道(固定地址,如 `music.你的域名.com`;需一个已加入 Cloudflare 的域名)**
1. 登录 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create a tunnel** → 选择 **Cloudflared** → 命名 → **Next**。
2. 在 **Install and Run** 步骤:页面提供的安装命令中,`service install` 后的
   `eyJhIjoi……` 即为 **token**。**仅复制该 token**,无需下载运行安装程序(本项目通过 Docker 运行)。
3. 继续 **Next** 至 **Route Tunnel / Public Hostname**:
   - Subdomain 填 `music`(可自定义),Domain 选择你的域名,得到 `music.你的域名.com`。
   - Type 选择 **HTTP**,URL 填 `app:80`,保存。
4. 将 token 写入 `.env`:`CLOUDFLARE_TUNNEL_TOKEN=粘贴该 token`,然后:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

### 4) 登录
在浏览器中打开你的地址(快速隧道地址 / `https://music.你的域名.com` / 或群晖局域网 `http://群晖IP:APP_PORT`),使用手机扫码登录。cookie 存入数据卷,后续免登录,群晖重启也不丢失。

> 也可使用 Container Manager 图形界面:将项目创建为一个 **项目(Project)**,选择 `docker-compose.yml`,并在环境变量中填入 `.env` 的内容。命令行方式更为简便。

---

<a id="vps"></a>

## C. VPS / 云服务器

适用于拥有公网 IP 的服务器。日本境内可直连网易云接口,建议选择东京机房以降低延迟(さくら / ConoHa / Vultr,约 ¥700/月)。

提供 HTTPS 的两种方式:

**方式一:Cloudflare 隧道**(与群晖相同,不依赖服务器开放 443)
参照上文群晖的第 3、4 步操作。

**方式二:域名 + Caddy 自动证书**(服务器具备公网 IP 时更直接)
将域名 A 记录指向服务器 IP,然后在 `docker-compose.yml` 中增加一个 Caddy 反向代理:
```yaml
  caddy:
    image: caddy:2
    depends_on: [app]
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from music.你的域名.com --to app:80
    restart: unless-stopped
    volumes: [caddy-data:/data]
```
并在 `volumes:` 下增加 `caddy-data:`,同时移除 `app` 的 `ports`(仅由 Caddy 对外)。启动:
```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git && cd TeslaNetEaseMusic
cp .env.example .env
docker compose up -d --build
```
打开 `https://music.你的域名.com` 扫码登录即可。

---

## 常见问题

- **启用区域解锁 / 灰歌解锁**:在 `.env` 设置 `REGION_UNLOCK=true` 或 `ENABLE_UNBLOCK=true`,执行 `docker compose up -d`(运行时生效,无需重建)。
- **切换账号 / cookie 过期**:执行 `docker compose exec app rm -f /data/cookie && docker compose restart app`,再打开页面扫码。(Mac 上可直接运行 `./relogin.sh`。)
- **车机无法打开地址**:确认使用的是 HTTPS 地址(隧道或 Caddy 提供),车机对纯 HTTP 较为敏感。
- **升级版本**:执行 `git pull && docker compose up -d --build`,cookie 位于数据卷,不受影响。
- **端口冲突**:在 `.env` 中设置 `APP_PORT` 更换为空闲端口。
