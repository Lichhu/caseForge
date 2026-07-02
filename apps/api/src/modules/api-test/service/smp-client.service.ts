/**
 * @file 服务管理平台（SMP）客户端
 * 支持真实 HTTP 调用与 demo 模式（未配置 SMP 时返回示例数据）
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";
import * as demoData from "./smp-demo-data.json";

/** SMP 服务信息条目（交易码基础信息） */
export interface SmpServiceInfoItem {
  bus: string;
  esbReqCode?: string;
  isObscure?: string;
  net?: string;
  reqCode: string;
  reqName?: string;
  reqState?: string;
  reqSystemId: string;
  resSystemId?: string;
  resSystemName?: string;
  serviceAttribute?: string;
  serviceCname: string;
  serviceCode: string;
  serviceForm?: string;
  serviceType?: string;
  taskId: string;
  taskType?: string;
  tranCode: string;
}

/** SMP 报文字段定义（requestHeadList / requestBodyList / responseHeadList / responseBodyList 条目） */
export interface SmpMessageFieldItem {
  nodeCode?: string;
  nodeName?: string;
  /** 节点所在路径，如 Transaction/Body/request/bizBody */
  nodeUrl?: string;
  dataType?: string;
  dataLength?: string;
  isNotNull?: string;
  nodeType?: string;
  headType?: string;
  bodyType?: string;
  descBind?: string;
}

/** SMP 服务调用信息条目 */
export interface SmpCallServiceInfoItem {
  authenticationMethod?: string;
  bus?: string;
  businessRule?: string;
  callMethod?: string;
  descript?: string;
  encryptMethod?: string;
  headId?: string;
  isObscure?: string;
  isPublic?: string;
  maxMessageSize?: string;
  maxResponseTime?: string;
  messageCoding?: string;
  messageType?: string;
  requestBodyList?: SmpMessageFieldItem[];
  requestHeadList?: SmpMessageFieldItem[];
  responseBodyList?: SmpMessageFieldItem[];
  responseHeadList?: SmpMessageFieldItem[];
  serviceAttribute?: string;
  serviceCname?: string;
  serviceCode?: string;
  serviceForm?: string;
  serviceType?: string;
  socketWay?: string;
  systemId?: string;
  systemName?: string;
  tranCode?: string;
}

/** SMP 接口测试信息条目 */
export interface SmpTestInfoItem {
  requestBody?: string;
  requestEncoding?: string;
  requestMessageType?: string;
  requestMethod?: string;
  requestUrl?: string;
  responseBody?: string;
  responseEncoding?: string;
  responstMessageType?: string;
}

/** SMP 标准化响应包装 */
export interface SmpResponse<T> {
  bizResCode: string;
  bizResText: string;
  data: T;
}

@Injectable()
export class SmpClientService {
  private readonly logger = new Logger(SmpClientService.name);

  constructor(private readonly config: ConfigService<AppConfig>) {}

  private get smpConfig() {
    return this.config.get("smp", { infer: true })!;
  }

  private get baseUrl(): string {
    const { url } = this.smpConfig;
    return url.endsWith("/") ? url : `${url}/`;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`SMP 请求: ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.smpConfig.requestTimeoutMs),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SMP 请求失败: HTTP ${response.status} ${text}`);
    }
    return response.json() as Promise<T>;
  }

  private async delay(ms = 300): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 查询交易码基础信息列表（selectServiceInfoList）
   * @param reqCode - 需求编号
   */
  async selectServiceInfoList(reqCode: string): Promise<SmpResponse<SmpServiceInfoItem[]>> {
    if (this.smpConfig.demo) {
      await this.delay();
      const raw = demoData.selectServiceInfoList as {
        Transaction: {
          Body: {
            response: {
              bizHeader: { bizResCode: string; bizResText: string };
              bizBody: { serviceList: SmpServiceInfoItem[] };
            };
          };
        };
      };
      const response = raw.Transaction.Body.response;
      return {
        bizResCode: response.bizHeader.bizResCode,
        bizResText: response.bizHeader.bizResText,
        data: response.bizBody.serviceList,
      };
    }

    const result = await this.postJson<typeof demoData.selectServiceInfoList>(
      this.smpConfig.serviceInfoListPath,
      this.buildRequestBody({ reqCode }),
    );
    const response = result.Transaction.Body.response;
    return {
      bizResCode: response.bizHeader.bizResCode,
      bizResText: response.bizHeader.bizResText,
      data: response.bizBody.serviceList,
    };
  }

  /**
   * 查询服务调用列表信息（selectCallServiceInfoList）
   */
  async selectCallServiceInfoList(
    reqCode: string,
    taskId: string,
    tranCode: string,
    serviceCode: string,
    reqSystemId: string,
  ): Promise<SmpResponse<SmpCallServiceInfoItem[]>> {
    if (this.smpConfig.demo) {
      await this.delay();
      const raw = demoData.selectCallServiceInfoList as {
        Transaction: {
          Body: {
            response: {
              bizHeader: { bizResCode: string; bizResText: string };
              bizBody: { callServiceList: SmpCallServiceInfoItem[] };
            };
          };
        };
      };
      const response = raw.Transaction.Body.response;
      return {
        bizResCode: response.bizHeader.bizResCode,
        bizResText: response.bizHeader.bizResText,
        data: response.bizBody.callServiceList,
      };
    }

    const result = await this.postJson<typeof demoData.selectCallServiceInfoList>(
      this.smpConfig.callServiceInfoListPath,
      this.buildRequestBody({ reqCode, taskId, tranCode, serviceCode, reqSystemId }),
    );
    const response = result.Transaction.Body.response;
    return {
      bizResCode: response.bizHeader.bizResCode,
      bizResText: response.bizHeader.bizResText,
      data: response.bizBody.callServiceList,
    };
  }

  /**
   * 查询接口测试信息（selectTestInfoList）
   */
  async selectTestInfoList(
    reqCode: string,
    taskId: string,
    tranCode: string,
    serviceCode: string,
    reqSystemId: string,
  ): Promise<SmpResponse<SmpTestInfoItem[]>> {
    if (this.smpConfig.demo) {
      await this.delay();
      const raw = demoData.selectTestInfoList as {
        Transaction: {
          Body: {
            response: {
              bizHeader: { bizResCode: string; bizResText: string };
              bizBody: { serviceTestList: SmpTestInfoItem[] };
            };
          };
        };
      };
      const response = raw.Transaction.Body.response;
      return {
        bizResCode: response.bizHeader.bizResCode,
        bizResText: response.bizHeader.bizResText,
        data: response.bizBody.serviceTestList,
      };
    }

    const result = await this.postJson<typeof demoData.selectTestInfoList>(
      this.smpConfig.testInfoListPath,
      this.buildRequestBody({ reqCode, taskId, tranCode, serviceCode, reqSystemId }),
    );
    const response = result.Transaction.Body.response;
    return {
      bizResCode: response.bizHeader.bizResCode,
      bizResText: response.bizHeader.bizResText,
      data: response.bizBody.serviceTestList,
    };
  }

  private buildRequestBody(bizBody: Record<string, string>): unknown {
    return {
      Transaction: {
        Body: {
          request: {
            bizBody,
          },
        },
      },
    };
  }
}
