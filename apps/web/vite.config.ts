import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@case-forge/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    // 工作区包走 alias 指向源码，预构建会缓存旧导出导致白屏
    exclude: ["@case-forge/shared"],
    // 避免改 vite.config 热重启时 deps_temp 未写完就被清理（ENOENT）
    holdUntilCrawlEnd: true,
  },
  build: {
    outDir: "caseforge-web-dist",
    // antd 全量注册体积较大但可缓存，内网工具无需进一步拆分，调高阈值避免警告
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 把大体积依赖拆成独立 chunk，减小主包、提升缓存命中
        manualChunks: {
          "vendor-vue": ["vue", "vue-router", "pinia"],
          "vendor-antd": ["ant-design-vue", "@ant-design/icons-vue"],
          "vendor-mind": ["mind-elixir"],
          "vendor-markdown": ["markdown-it"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 33550,
    open: "/case-forge",
    // 仅代理真实 API（/api/v1/...），避免前端路由 /api-test 被误转发到 Nest
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:34550",
        changeOrigin: true,
      },
      "/docs": {
        target: "http://127.0.0.1:34550",
        changeOrigin: true,
      },
    },
  },
});
