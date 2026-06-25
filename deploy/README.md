# CaseForge 部署指南（Nginx + PM2）

## 架构

| 组件              | 由谁承载            | 说明                                  |
| ----------------- | ------------------- | ------------------------------------- |
| 前端 `apps/web`   | **Nginx 静态托管**  | Vite 构建产物 `apps/web/dist`，纯静态 |
| 后端 `apps/api`   | **PM2 fork 单实例** | NestJS，监听 `127.0.0.1:34550`        |
| 压缩 / 缓存 / SSL | **Nginx**           | 反代 `/api/v1` 到 Node                |

> ⚠️ **API 必须单实例 fork，禁止 PM2 cluster。**
> AI 案例生成是单进程内存队列（`apps/api/src/modules/case-editor/util/case-generate-concurrency.ts`），
> 多实例会导致任务重复处理、并发上限失效。吞吐靠 `CASE_GENERATE_CONCURRENCY` 调，不靠多进程。

## 一、准备环境变量

复制并填写生产环境变量（NODE_ENV=prod 会自动加载 `.prod.env`）：

```bash
cp apps/api/env/.example.env apps/api/env/.prod.env
# 编辑 .prod.env，填写：
#   TYPEORM_*（MySQL 连接）
#   MINIO_*（对象存储）
#   AI_WORKFLOW_*（AI 工作流接口）
#   REQ_DOC_SKILL_URL / CASE_DOC_SKILL_URL
```

## 二、构建

```bash
pnpm install --frozen-lockfile
pnpm --filter @case-forge/shared build   # 共享包必须先构建
pnpm --filter @case-forge/web build       # -> apps/web/dist
pnpm --filter @case-forge/api build       # -> apps/api/dist
```

## 三、数据库索引（首次部署）

```bash
mysql -u root -p case_forge < apps/api/scripts/add-database-indexes.sql
# 索引已存在会报 Duplicate key name，可忽略
```

## 四、启动 API（PM2）

```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save        # 保存进程列表
pm2 startup     # 生成开机自启脚本，按提示执行
```

常用命令：

```bash
pm2 logs caseforge-api      # 看日志
pm2 restart caseforge-api   # 重启
pm2 reload caseforge-api    # 平滑重启
pm2 monit                   # 实时监控
```

## 五、配置 Nginx

```bash
# 修改 deploy/nginx.conf 中的 server_name 和 root 路径
sudo cp deploy/nginx.conf /etc/nginx/sites-available/caseforge
sudo ln -s /etc/nginx/sites-available/caseforge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 六、发版更新流程

```bash
git pull
pnpm install --frozen-lockfile
pnpm --filter @case-forge/shared build
pnpm --filter @case-forge/web build
pnpm --filter @case-forge/api build
pm2 reload caseforge-api    # 后端平滑重启
# 前端是静态资源，构建完即生效（index.html 已设为不缓存）
```

## 性能调优

- **`CASE_GENERATE_CONCURRENCY`**（ecosystem.config.js）：AI 并发上限，默认 4，按 AI 接口承受力调（最大 32）。这是吞吐的主要杠杆。
- **MySQL**：确保已执行索引脚本；connection pool 通过 TypeORM 默认配置。

> 内网部署，无需 HTTPS，`server_name` 可直接填服务器 IP。
