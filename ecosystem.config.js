/**
 * PM2 部署配置 - CaseForge（Express 静态前端 + NestJS API）
 *
 * 架构（无 Nginx，适合 CentOS 内网）：
 *   - caseforge-web：Express cluster，托管 apps/web/dist，反代 /api → API
 *   - caseforge-api：fork 单实例，禁止 cluster（内存队列见 case-generate-concurrency.ts）
 *
 * 首次部署：
 *   pnpm install --frozen-lockfile
 *   pnpm --filter @case-forge/shared build
 *   pnpm --filter @case-forge/web build
 *   pnpm --filter @case-forge/api build
 *   npm install --prefix deploy          # 或内网离线 npm install deploy/offline-packages/*.tgz
 *   mkdir -p logs && pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * API 环境变量从 apps/api/env/.prod.env 读取（NODE_ENV=prod）。
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'caseforge-api',
      cwd: './apps/api',
      script: 'dist/bootstrap.js',

      // —— 关键：单实例 fork，切勿改成 cluster ——
      instances: 1,
      exec_mode: 'fork',

      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      time: true,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs/caseforge-api.out.log'),
      error_file: path.join(__dirname, 'logs/caseforge-api.err.log'),

      env: {
        NODE_ENV: 'prod',
        CASE_GENERATE_CONCURRENCY: '4',
      },
    },
    {
      name: 'caseforge-web',
      cwd: './deploy',
      script: 'web-server.cjs',

      // 静态托管可 cluster，充分利用多核
      instances: 'max',
      exec_mode: 'cluster',

      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 2000,

      time: true,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs/caseforge-web.out.log'),
      error_file: path.join(__dirname, 'logs/caseforge-web.err.log'),

      env: {
        PORT: '8080',
        API_TARGET: 'http://127.0.0.1:34550',
        DIST_DIR: '../apps/web/dist',
      },
    },
  ],
};
