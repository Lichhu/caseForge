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
  }
});
