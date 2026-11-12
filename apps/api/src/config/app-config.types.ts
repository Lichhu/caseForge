/**
 * @file 应用运行时配置类型定义
 */

/** 应用全局配置结构（由 configuration 工厂与环境变量填充） */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  /** 统一认证与本地 JWT 登录态配置 */
  auth: {
    /** 统一认证平台分配的 appid */
    appId: string;
    /** 票据校验接口，由后端以 JSON 请求体调用 */
    ticketValidateUrl: string;
    /** JWT HS256 签名密钥，生产环境必须显式配置 */
    jwtSecret: string;
    jwtIssuer: string;
    jwtAudience: string;
    /** 本地登录态有效期（毫秒） */
    sessionDurationMs: number;
    /** 单次代登录最长有效期（毫秒） */
    impersonationDurationMs: number;
    /** 允许切换账号的原始登录账号 */
    impersonationAdminUsers: string[];
    /** 允许查询/导出登录审计的管理员账号 */
    auditAdminUsers: string[];
    /** 登录审计交互查询允许的最大时间范围（天） */
    auditMaxQueryDays: number;
    /** 单次登录审计导出允许的最大行数 */
    auditMaxExportRows: number;
    /** 登录审计在线保留天数，超过后进入归档 */
    auditRetentionDays: number;
    /** 登录审计归档保留天数，超过后删除分区 */
    auditArchiveRetentionDays: number;
    /** 日汇总任务执行间隔（毫秒），0 表示关闭定时任务 */
    auditSummaryIntervalMs: number;
    /** 分区维护任务执行间隔（毫秒），0 表示关闭定时任务 */
    auditPartitionIntervalMs: number;
    /** 登录审计导出文件落盘目录 */
    auditExportDir: string;
    /** 导出文件保留天数，超期由维护任务清理 */
    auditExportRetentionDays: number;
    /** 导出目录占用告警阈值（字节） */
    auditExportWarnBytes: number;
    /** 分区维护时预创建的未来月份数 */
    auditPartitionAheadMonths: number;
    cookieName: string;
    /** HTTP 环境保持 false；切换 HTTPS 后应设为 true */
    cookieSecure: boolean;
    ticketValidateTimeoutMs: number;
  };
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
    uploadFileUrl: string;
    receiveAutoResultUrl: string;
    accessToken: string;
    /** demo 模式请求超时（毫秒） */
    requestTimeoutMs: number;
  };
  /** 需求平台集成配置 */
  requirementPlatform: {
    /** 定时同步间隔（毫秒），0 表示关闭定时同步 */
    syncIntervalMs: number;
  };
  /** 敏行消息推送（OCU）集成配置 */
  ocuPush: {
    /** 是否启用推送；关闭时仅输出日志不真实发送 */
    enabled: boolean;
    /** 推送接口地址 */
    url: string;
    ocuId: string;
    ocuSecret: string;
    serverURL: string;
    bearerToken: string;
    /** 需求平台前端访问前缀，用于拼装消息链接（如 http://localhost:33550） */
    portalBaseUrl: string;
    /** 超期未分发扫描间隔（毫秒），0 表示关闭定时扫描 */
    overdueScanIntervalMs: number;
    /** 超期阈值（毫秒），默认 24 小时 */
    overdueThresholdMs: number;
    /** 逐人推送并发数，默认 3 */
    concurrency: number;
  };
  /** 消息发送（先落库 notify_message，再由轮询任务推送）配置 */
  notify: {
    /** 未发送消息轮询间隔（毫秒），0 表示关闭定时轮询（仅入队时触发发送） */
    scanIntervalMs: number;
    /** 单轮最多拉取的消息条数 */
    batchSize: number;
    /** 发送失败最大重试次数，超过后标记 failed 不再发送 */
    maxRetry: number;
  };
}
