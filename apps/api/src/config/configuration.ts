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
    host:
      process.env.TYPEORM_TEST_HOST ?? process.env.TYPEORM_HOST ?? "localhost",
    port: Number(
      process.env.TYPEORM_TEST_PORT ?? process.env.TYPEORM_PORT ?? 3306,
    ),
    username:
      process.env.TYPEORM_TEST_USERNAME ??
      process.env.TYPEORM_USERNAME ??
      "root",
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
    reqDocSkillUrl: process.env.REQ_DOC_SKILL_URL ?? "",
    caseDocPromoteUrl: process.env.CASE_DOC_PROMOTE_URL ?? "",
    atCaseSkillUrl: process.env.AT_CASE_SKILL_URL ?? "",
    aiChat: {
      url: process.env.AI_CHAT_URL ?? "",
      model: process.env.AI_CHAT_MODEL ?? "qwen-72b",
      apiKey: process.env.AI_CHAT_API_KEY ?? "",
      retryTime: Number(
        process.env.AI_CHAT_RETRY_TIME ?? process.env.AI_CHAT_RETRY ?? 2,
      ),
      requestTimeoutMs: Number(
        process.env.AI_CHAT_REQUEST_TIMEOUT_MS ?? 900000,
      ),
    },
  },
  smp: {
    url: process.env.SMP_URL ?? "",
    demo:
      process.env.SMP_DEMO_MODE === "true" ||
      !(process.env.SMP_URL ?? "").trim(),
    serviceInfoListPath:
      process.env.SMP_SERVICE_INFO_LIST ??
      "serviceManagementGovernanceController/selectServiceInfoList",
    callServiceInfoListPath:
      process.env.SMP_CALL_SERVICE_INFO_LIST ??
      "serviceManagementGovernanceController/selectCallServiceInfoList",
    testInfoListPath:
      process.env.SMP_TEST_INFO_LIST ??
      "serviceManagementGovernanceController/selectTestInfoList",
    requestTimeoutMs: Number(process.env.SMP_REQUEST_TIMEOUT_MS ?? 90000),
  },
  requirementPlatform: {
    syncIntervalMs: Number(process.env.REQUIREMENT_SYNC_INTERVAL_MS ?? 600000),
  },
  ocuPush: {
    enabled: process.env.OCU_PUSH_ENABLED === "true",
    url:
      process.env.OCU_PUSH_URL ??
      "http://36.114.30.72:8888/api/v1/ocu/sendMessage",
    ocuId: process.env.OCU_ID ?? "",
    ocuSecret: process.env.OCU_SECRET ?? "",
    serverURL: process.env.OCU_SERVER_URL ?? "",
    bearerToken: process.env.OCU_BEARER_TOKEN ?? "",
    portalBaseUrl: process.env.OCU_PORTAL_BASE_URL ?? "http://localhost:33550",
    overdueScanIntervalMs: Number(
      process.env.OCU_OVERDUE_SCAN_INTERVAL_MS ?? 600000,
    ),
    overdueThresholdMs: Number(
      process.env.OCU_OVERDUE_THRESHOLD_MS ?? 24 * 60 * 60 * 1000,
    ),
    concurrency: Number(process.env.OCU_PUSH_CONCURRENCY ?? 3),
  },
  notify: {
    scanIntervalMs: Number(process.env.NOTIFY_SCAN_INTERVAL_MS ?? 30000),
    batchSize: Number(process.env.NOTIFY_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.NOTIFY_MAX_RETRY ?? 3),
  },
});
