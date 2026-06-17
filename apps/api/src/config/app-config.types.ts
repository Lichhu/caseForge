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
    };
  };
}
