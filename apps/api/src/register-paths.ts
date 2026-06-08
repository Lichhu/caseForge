/**
 * @file 注册 tsconfig 路径别名（开发 src / 生产 dist 双模式）
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { register } from "tsconfig-paths";

const runningFromDist = existsSync(join(__dirname, "config", "configuration.js"));

register({
  baseUrl: __dirname,
  paths: runningFromDist
    ? {
        "@config/*": ["config/*"],
        "@utils/*": ["utils/*"],
        "@constant/*": ["constant/*"],
        "@minio/*": ["common/minio/*"],
        "@case-editor/*": ["modules/case-editor/*"],
        "@dynamic-instruct/*": ["modules/dynamic-instruct/*"],
        "@project-manage/*": ["modules/project-manage/*"],
        "@struct-doc/*": ["modules/struct-doc/*"],
        "@scenario/*": ["modules/scenario/*"],
        "@api-test/*": ["modules/api-test/*"],
      }
    : {
        "@config/*": ["src/config/*"],
        "@utils/*": ["src/utils/*"],
        "@constant/*": ["src/constant/*"],
        "@minio/*": ["src/common/minio/*"],
        "@case-editor/*": ["src/modules/case-editor/*"],
        "@dynamic-instruct/*": ["src/modules/dynamic-instruct/*"],
        "@project-manage/*": ["src/modules/project-manage/*"],
        "@struct-doc/*": ["src/modules/struct-doc/*"],
        "@scenario/*": ["src/modules/scenario/*"],
        "@api-test/*": ["src/modules/api-test/*"],
      },
});
