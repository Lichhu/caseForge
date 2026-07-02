/**
 * @file 应用运行时配置类型定义
 */

/** 应用全局配置结构（由 configuration 工厂与环境变量填充） */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  typeOrm: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  /** 测管平台 MySQL（jnyh_test 等），用于案例同步 */
  typeOrmTest: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  minio: {
    host: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucketName: string;
    pathPrefix: string;
    publicBaseUrl: string;
  };
  aiWorkflow: {
    reqDocSkillUrl: string;
    caseDocPromoteUrl: string;
    atCaseSkillUrl: string;
    aiChat: {
      url: string;
      model: string;
      apiKey: string;
      retryTime: number;
      /** 单次 AI Chat 请求超时（毫秒），默认 600000（10 分钟） */
      requestTimeoutMs: number;
    };
  };
  /** 服务管理平台（SMP）集成配置 */
  smp: {
    url: string;
    /** 是否启用 demo 模式（未配置真实 SMP 时返回示例数据） */
    demo: boolean;
    /** 各接口相对路径 */
    serviceInfoListPath: string;
    callServiceInfoListPath: string;
    testInfoListPath: string;
    /** demo 模式请求超时（毫秒） */
    requestTimeoutMs: number;
  };
  /** 接口案例生成模式：plan（AI 只填字段覆盖值）| legacy（AI 输出完整报文） */
  apiCasePlanMode: "plan" | "legacy";
}
