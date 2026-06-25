import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const DEV_USER_NAME = process.env.VITE_DEV_USER_NAME || "system";

/** 开发环境启动地址默认附带 userName，与 initUserContext 一致 */
function devUserNameUrlPlugin(): Plugin {
  return {
    name: "dev-user-name-url",
    configureServer(server) {
      const appendUserName = (href: string) => {
        const url = new URL(href);
        if (!url.searchParams.has("userName")) {
          url.searchParams.set("userName", DEV_USER_NAME);
        }
        return url.toString();
      };

      const originalPrintUrls = server.printUrls;
      server.printUrls = (urls) => {
        const resolved = urls ?? server.resolvedUrls;
        if (!resolved?.local?.length) {
          originalPrintUrls?.(urls);
          return;
        }
        resolved.local.forEach((url) => {
          server.config.logger.info(`  ➜  Local:   ${appendUserName(url)}`);
        });
        (resolved.network ?? []).forEach((url) => {
          server.config.logger.info(`  ➜  Network: ${appendUserName(url)}`);
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [vue(), devUserNameUrlPlugin()],
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
    open: `/case-forge?userName=${encodeURIComponent(DEV_USER_NAME)}`,
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
