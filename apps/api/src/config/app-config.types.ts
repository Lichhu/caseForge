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
    isExternalNetwork: boolean;
    invokeUrl: string;
    stopUrl: string;
    workflowId: string;
    reqDocSkillUrl: string;
    caseDocSkillUrl: string;
    caseDocPromoteUrl: string;
    dify: {
      workflowUrl: string;
      apiKey: string;
      user: string;
    };
    aiChat: {
      url: string;
      model: string;
      apiKey: string;
      retryTime: number;
    };
  };
}
