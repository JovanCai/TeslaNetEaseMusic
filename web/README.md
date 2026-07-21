# web —— 前端(Vite + React + TypeScript)

TeslaNetEaseMusic 的前端。部署和使用请看项目根目录的 [README](../README.md) 和 [DEPLOY.md](../DEPLOY.md)。

本地开发:
```bash
npm install
npm run dev     # 开发服务器
npm run test    # 单元测试
npm run build   # 生产构建(输出到 dist/)
```

开发时前端需要能访问后端接口(`/api`、`/session`),最简单的办法是让整套 `docker compose up` 起着,前端 dev server 通过代理指到它。
