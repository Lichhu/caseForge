# CaseForge 部署指南（Express + PM2，无 Nginx）

适用于 **CentOS 内网**、不安装 Nginx 的场景。

## 架构

| 组件 | 进程 | 说明 |
| --- | --- | --- |
| 前端 `apps/web/dist` | **PM2 cluster `caseforge-web`** | Express + compression，默认 `:8080` |
| 后端 `apps/api` | **PM2 fork `caseforge-api`** | NestJS，`:34550`（仅本机，由 web 反代） |
| 压缩 / 缓存 | **Express** | Gzip；`/assets` 一年强缓存；`index.html` 不缓存 |
| API 反代 | **Express** | `/api`、`/docs` → `127.0.0.1:34550` |

> ⚠️ **API 必须 fork 单实例**，禁止对 `caseforge-api` 使用 cluster。  
> AI 案例生成是单进程内存队列，多实例会导致任务重复、并发失效。

访问地址：`http://<服务器IP>:8080/case-forge?userName=你的用户名`

---

## 一、CentOS 环境准备

### 1. 安装 Node.js 20+

```bash
# 示例：NodeSource（需内网镜像或离线 rpm，按你们环境调整）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

node -v   # >= 20
npm -v
```

### 2. 安装 PM2

```bash
sudo npm install -g pm2
pm2 -v
```

### 3. 放行端口（firewalld）

```bash
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
# API 34550 无需对外暴露，仅本机反代
```

---

## 二、准备配置

```bash
cd /path/to/caseforge
cp apps/api/env/.example.env apps/api/env/.prod.env
# 编辑 .prod.env：TYPEORM_*、MINIO_*、AI_CHAT_URL 等
```

---

## 三、安装依赖与构建

### 方式 A：服务器能访问 npm  registry

```bash
pnpm install --frozen-lockfile
pnpm --filter @case-forge/shared build
pnpm --filter @case-forge/web build
pnpm --filter @case-forge/api build

# 前端静态服务依赖（express / compression / 反代）
npm install --prefix deploy
```

### 方式 B：完全离线（推荐内网）

**在有网的机器上：**

```bash
# 1. 打包 monorepo 构建产物 + deploy 依赖
bash deploy/scripts/pack-web-deps.sh

# 2. 将整个 caseforge 目录（含 deploy/offline-packages/）拷贝到内网
```

**在内网 CentOS 上：**

```bash
cd /path/to/caseforge
pnpm install --frozen-lockfile
pnpm --filter @case-forge/shared build
pnpm --filter @case-forge/web build
pnpm --filter @case-forge/api build

cd deploy
tar -xzf offline-packages/deploy-node-modules.tar.gz
# 解压后 deploy/ 下应有 node_modules/ 与 package.json
```

---

## 四、数据库（首次）

```bash
mysql -u root -p case_forge < apps/api/scripts/add-database-indexes.sql
```

---

## 五、启动

```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 status

# 开机自启（CentOS systemd）
pm2 startup systemd
# 按提示执行 sudo 命令
pm2 save
```

验证：

```bash
curl -s http://127.0.0.1:8080/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/v1/...
# 浏览器打开 http://<IP>:8080/case-forge?userName=system
```

---

## 六、发版更新

```bash
git pull   # 或替换部署目录
pnpm install --frozen-lockfile
pnpm --filter @case-forge/shared build
pnpm --filter @case-forge/web build
pnpm --filter @case-forge/api build

pm2 reload caseforge-api
pm2 reload caseforge-web
# 前端 dist 更新后 reload web 即可；index.html 不缓存，用户刷新即生效
```

---

## 七、常用运维

```bash
pm2 logs caseforge-web
pm2 logs caseforge-api
pm2 monit
pm2 restart caseforge-web
pm2 restart caseforge-api
```

---

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 前端对外端口（改 `ecosystem.config.js` 中 caseforge-web.env） |
| `API_TARGET` | `http://127.0.0.1:34550` | 后端 API 地址 |
| `DIST_DIR` | `../apps/web/dist` | 相对 deploy 目录的前端构建产物路径 |
| `CASE_GENERATE_CONCURRENCY` | `4` | AI 并发上限（caseforge-api） |

若需监听 80 端口，将 `PORT` 改为 `80`（CentOS 上需 root 或 `setcap` 授权）。

---

## 可选：Nginx 方案

若后续有 Nginx，可参考同目录 `nginx.conf`（静态 + 反代），与本文 Express 方案二选一即可。

---

## 性能调优

- **`CASE_GENERATE_CONCURRENCY`**：AI 吞吐主杠杆，按 AI 接口承受能力调整（最大 32）。
- **`caseforge-web` instances: 'max'`**：按 CPU 核数起进程；纯静态场景收益有限，但内网无 Nginx 时已足够。
- **MySQL**：确保索引脚本已执行。
