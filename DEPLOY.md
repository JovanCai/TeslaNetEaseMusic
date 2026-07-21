# 部署指南

本项目是 2 个容器:`app`(Node/BFF + 前端)+ `ncm-api`。核心任务:把它跑在**特斯拉能访问到的地方**,并**以 https 暴露**(车机浏览器需要 https;音频地址也已在前端升级为 https)。

---

## 一、本地/服务器上把服务起起来

任意装了 Docker 的机器(你的 Mac、家里常开的小主机、或一台便宜 VPS):

```bash
# 1) 拿到代码(二选一)
git clone <你的仓库地址> tesla-music && cd tesla-music
#   或把本地目录 rsync 到服务器(排除无用大目录):
#   rsync -av --exclude node_modules --exclude .git ./tesla-music/ user@server:~/tesla-music/

# 2) 配置
cp .env.example .env
#   可留空直接用 App 内扫码登录;若想开区域解锁,在 .env 填 VITE_REAL_IP=<国内IP>(默认关)

# 3) 构建并启动(前端在镜像内构建,无需本机 Node)
set -a; . ./.env; set +a
docker compose up -d --build

# 4) 登录:浏览器打开 http://<该机IP>/ ,首次显示二维码 → 手机网易云 App 扫码
#    cookie 存进 Docker 数据卷 cookie-data,重启不丢、长期免登录
```

到这一步,局域网内已能用。下面是让**特斯拉(公网)**也能访问且走 https。

---

## 二、以 https 暴露给车机(选一种)

### 方案 A:Cloudflare 快速隧道 —— 最快,立刻能在车上试(临时地址)

无需域名、无需开端口、无需证书。在跑着服务的机器上:

```bash
brew install cloudflared            # macOS;Linux 见 cloudflare 文档
cloudflared tunnel --url http://localhost:80
```

它会打印一个 `https://xxxx.trycloudflare.com` 地址——直接在**特斯拉浏览器**打开即可。
缺点:地址每次重启会变、仅适合验证(尤其适合先做 8b 真车验证)。

### 方案 B:Cloudflare 命名隧道 —— 稳定地址,长期用(推荐)

有一个托管在 Cloudflare 的域名即可(免费套餐够用):

```bash
cloudflared tunnel login
cloudflared tunnel create tesla-music
# 把子域名指向隧道,并在 config 里 service: http://localhost:80
cloudflared tunnel route dns tesla-music music.你的域名.com
cloudflared tunnel run tesla-music
```

之后车机固定访问 `https://music.你的域名.com`。可用 systemd 让隧道与 docker 一起开机自启。

### 方案 C:VPS + Caddy 自动 https —— 不想依赖 Cloudflare

在有公网 IP 的 VPS 上,加一个 Caddy 反代(自动签发 Let's Encrypt 证书)。给 `docker-compose.yml` 增补:

```yaml
  caddy:
    image: caddy:2
    depends_on: [app]
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from music.你的域名.com --to app:80
    restart: unless-stopped
    volumes: [caddy-data:/data]
```

(并把 `app` 的 `ports: ["80:80"]` 去掉,只让 Caddy 对外。`volumes:` 增加 `caddy-data:`。)域名 A 记录指向 VPS IP 即可。

---

## 三、放哪台机器?

- **只是先验证(8b 真车)**:你的 Mac + 方案 A,几分钟就能在车上打开。前提是测试时 Mac 开着。
- **长期天天用**:一台便宜的**日本 VPS**(さくら/ConoHa/Vultr Tokyo,约 ¥700/月)始终在线最省心 + 方案 B 或 C 固定地址。家用常开小主机 + 方案 B 也可,但机器必须一直开着。

日本无 GFW,网易云官方 API 公网可达,无需额外代理。

---

## 常见问题

- **改了 VITE_REAL_IP 不生效**:VITE_* 是构建时嵌入的,改后要 `docker compose up -d --build` 重新构建。
- **想换账号 / cookie 过期**:清空登录态后重新扫码——`docker compose exec app rm -f /data/cookie && docker compose restart app`,再开页面扫码。
- **车机打不开 http 地址**:务必用 https(方案 A/B/C 任一);车机对纯 http 与混合内容较敏感。
- **升级版本**:`git pull && docker compose up -d --build`(cookie 在数据卷里,不受影响)。
