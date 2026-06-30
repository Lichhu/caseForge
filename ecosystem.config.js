/**
 * PM2 部署配置 - CaseForge API
 *
 * 重要：API 必须以 fork 单实例运行，禁止 cluster 多实例。
 * 原因：AI 案例生成使用「单进程内存队列」（见
 * apps/api/src/modules/case-editor/util/case-generate-concurrency.ts）
 * 多实例会导致任务重复处理、并发上限失效、打爆 AI 接口。
 *
 * 用法：
 *   pnpm install --frozen-lockfile
 *   pnpm --filter @case-forge/shared build
 *   pnpm --filter @case-forge/api build
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * 其余环境变量（数据库 / MinIO / AI 接口等）从
 * apps/api/env/.prod.env 读取（NODE_ENV=prod 时自动加载）。
 */
module.exports = {
  apps: [
    {
      name: 'caseforge-api',
      // 以 apps/api 为工作目录，env 加载与 dist 路径解析都依赖此目录
      cwd: './apps/api',
      script: 'dist/bootstrap.js',

      // —— 关键：单实例 fork，切勿改成 cluster ——
      instances: 1,
      exec_mode: 'fork',

      // 内存超限自动重启，防止长跑泄漏拖垮服务
      max_memory_restart: '1G',

      // 崩溃重启策略
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      // 日志
      time: true,
      merge_logs: true,
      out_file: './logs/caseforge-api.out.log',
      error_file: './logs/caseforge-api.err.log',

      env: {
        // 选用 .prod.env（loadApiEnv 按 .${NODE_ENV}.env 解析）
        NODE_ENV: 'prod',
        // AI 案例生成全局并发上限（默认 2，最大 32）
        // 按你的 AI Chat 接口承受能力调整，这是吞吐的主要杠杆
        CASE_GENERATE_CONCURRENCY: '4',
      },
    },
  ],
};
