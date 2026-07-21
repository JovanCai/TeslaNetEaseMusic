# 部署指南

这套程序是两个容器:`app`(网页 + 后端)和 `ncm-api`(网易云接口)。要让特斯拉用上,需要把它跑在某台机器上,并给一个**公网 https 地址**让车机浏览器打开。

下面按设备分三种,挑一种就行。

- [Mac / 电脑,先试试](#mac)
- [群晖 NAS(常年在线,推荐)](#nas)
- [VPS / 云服务器](#vps)

先决条件都一样:装 Docker,准备好手机(扫码登录用一次)。

---

<a id="mac"></a>

## A. Mac / 电脑,先试试

适合先在车上体验一下。用车时电脑要开着、脚本窗口要留着。

1. 安装并打开 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
2. 下载项目并运行脚本:
   ```bash
   git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
   cd TeslaNetEaseMusic
   ./deploy.sh
   ```
3. 按提示用手机网易云 App 扫码登录。脚本最后会打印一行
   `https://xxxx.trycloudflare.com`。
4. 把这行地址在**特斯拉车机浏览器**里打开。

这个临时地址每次运行会变。想要固定地址,看下面的群晖或 VPS 方案。

---

<a id="nas"></a>

## B. 群晖 NAS(常年在线,推荐)

群晖一直开机,适合天天用。**没有公网 IP 也可以** —— Cloudflare 隧道由群晖主动向外连接,Cloudflare 给你一个公网 https 地址,不用开端口映射。

需要一个挂在 Cloudflare 上的域名(免费套餐即可;新域名约 ¥100/年)。

### 1) 在群晖上装 Docker
DSM 套件中心安装 **Container Manager**(旧版叫 Docker)。

### 2) 把代码放到群晖
用 SSH 登录群晖后:
```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git
cd TeslaNetEaseMusic
cp .env.example .env
# 群晖的 80 端口常被 DSM 占用,建议在 .env 设一个别的:
#   APP_PORT=8920
```

### 3) 选一种上网方式

**不想买域名 → 快速隧道(免费,地址临时但群晖常开时基本不变)**
```bash
docker compose --profile quick up -d --build
# 等十几秒,拿地址:
docker compose logs cloudflared-quick | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```
把打印出来的 `https://xxxx.trycloudflare.com` 在特斯拉浏览器打开。群晖重启后地址会变,重新看一次日志即可。

**想要固定地址(如 `music.你的域名.com`)→ 命名隧道(需要一个加到 Cloudflare 的域名)**
1. 登录 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create a tunnel** → 选 **Cloudflared** → 起个名 → **Next**。
2. 到 **Install and Run** 这步:页面给的安装命令里,`service install` 后面那串
   `eyJhIjoi……` 就是 **token**。**只复制这串 token**,不用下载运行那个安装程序(我们用 Docker 跑)。
3. 点 **Next** 到 **Route Tunnel / Public Hostname**:
   - Subdomain 填 `music`(随意),Domain 选你的域名 → 得到 `music.你的域名.com`
   - Type 选 **HTTP**,URL 填 `app:80` → 保存。
4. 把 token 填进 `.env`:`CLOUDFLARE_TUNNEL_TOKEN=粘贴那串token`,然后:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

### 4) 登录一次
浏览器打开你的地址(快速隧道地址 / `https://music.你的域名.com` / 或群晖局域网 `http://群晖IP:APP_PORT`),用手机扫码登录。cookie 存进数据卷,以后免登录、群晖重启也不丢。

> 用 Container Manager 图形界面也行:把项目建成一个“项目(Project)”,选 `docker-compose.yml`,环境变量里填好 `.env` 的内容;命令行更省事。

---

<a id="vps"></a>

## C. VPS / 云服务器

有公网 IP 的服务器。日本无墙,网易云接口直连即可,选 Tokyo 机房延迟低(さくら / ConoHa / Vultr,约 ¥700/月)。

两种给 https 的方式:

**方式一:也用 Cloudflare 隧道**(和群晖一样,不依赖服务器开 443)
按上面群晖的第 3、4 步做即可。

**方式二:域名 + Caddy 自动证书**（服务器有公网 IP 时更直接）
把域名 A 记录指向服务器 IP,然后在 `docker-compose.yml` 里加一个 Caddy 反代:
```yaml
  caddy:
    image: caddy:2
    depends_on: [app]
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from music.你的域名.com --to app:80
    restart: unless-stopped
    volumes: [caddy-data:/data]
```
并在 `volumes:` 下加 `caddy-data:`,把 `app` 的 `ports` 去掉(只让 Caddy 对外)。启动:
```bash
git clone https://github.com/JovanCai/TeslaNetEaseMusic.git && cd TeslaNetEaseMusic
cp .env.example .env
docker compose up -d --build
```
打开 `https://music.你的域名.com` 扫码登录即可。

---

## 常见问题

- **开区域解锁 / 灰歌解锁**:在 `.env` 设 `REGION_UNLOCK=true` 或 `ENABLE_UNBLOCK=true`,`docker compose up -d`(运行时生效,不必重建)。
- **换账号 / cookie 过期**:`docker compose exec app rm -f /data/cookie && docker compose restart app`,再打开页面扫码。(Mac 上直接 `./relogin.sh`。)
- **车机打不开地址**:确认用的是 https 地址(隧道或 Caddy 给的),车机对纯 http 比较敏感。
- **升级版本**:`git pull && docker compose up -d --build`,cookie 在数据卷里不受影响。
- **端口冲突**:在 `.env` 设 `APP_PORT` 换一个空闲端口。
