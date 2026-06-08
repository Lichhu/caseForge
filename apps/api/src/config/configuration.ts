/**
 * @file Nest ConfigModule 配置工厂：从环境变量加载 AppConfig
 */
import { AppConfig } from "./app-config.types";

/** 默认配置导出：供 ConfigModule.forRoot({ load: [configuration] }) 使用 */
export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 34550),
  typeOrm: {
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    username: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  },
  typeOrmTest: {
    host: process.env.TYPEORM_TEST_HOST ?? process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_TEST_PORT ?? process.env.TYPEORM_PORT ?? 3306),
    username:
      process.env.TYPEORM_TEST_USERNAME ?? process.env.TYPEORM_USERNAME ?? "root",
    password:
      process.env.TYPEORM_TEST_PASSWORD ?? process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_TEST_DATABASE ?? "jnyh_test",
  },
  minio: {
    host: process.env.MINIO_HOST ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? 9000),
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
    bucketName: process.env.MINIO_BUCKET_NAME ?? "case-forge",
    pathPrefix: process.env.MINIO_PATH_PREFIX ?? "case-forge",
    publicBaseUrl: process.env.MINIO_PUBLIC_BASE_URL ?? "",
  },
  aiWorkflow: {
    isExternalNetwork: process.env.IS_EXTERNAL_NETWORK === "true",
    invokeUrl: process.env.AI_WORKFLOW_INVOKE_URL ?? "",
    stopUrl: process.env.AI_WORKFLOW_STOP_URL ?? "",
    workflowId: process.env.AI_WORKFLOW_ID ?? "",
    reqDocSkillUrl: process.env.REQ_DOC_SKILL_URL ?? "",
    caseDocSkillUrl: process.env.CASE_DOC_SKILL_URL ?? "",
    caseDocPromoteUrl: process.env.CASE_DOC_PROMOTE_URL ?? "",
    dify: {
      workflowUrl: process.env.DIFY_WORKFLOW_URL ?? "",
      apiKey: process.env.DIFY_WORKFLOW_ID ?? "",
      user: process.env.DIFY_WORKFLOW_USER ?? "caseforge",
    },
    aiChat: {
      url: process.env.AI_CHAT_URL ?? "",
      model: process.env.AI_CHAT_MODEL ?? "qwen-72b",
      apiKey: process.env.AI_CHAT_API_KEY ?? "",
      retryTime: Number(
        process.env.AI_CHAT_RETRY_TIME ?? process.env.AI_CHAT_RETRY ?? 2,
      ),
    },
  },
});
