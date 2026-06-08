import type { ApiTestCasePayload } from "@case-forge/shared";
import type { ApiEndpointEntity } from "../entity/api-endpoint.entity";

export function buildFallbackCasesForEndpoint(
  endpoint: ApiEndpointEntity,
): ApiTestCasePayload[] {
  const positive: ApiTestCasePayload = {
    title: `${endpoint.name} - 正向`,
    description: `验证 ${endpoint.method} ${endpoint.path} 正常返回`,
    priority: "P0",
    polarity: "positive",
    enabled: true,
    status: "ready",
    preconditions: ["已选择有效执行环境", "Token 已配置"],
    request: {
      method: endpoint.method,
      path: endpoint.path,
      headers: { "Content-Type": "application/json" },
      body: {},
    },
    expected: {
      statusCode: [200, 201, 204],
      statusOnly: true,
    },
    metadata: { source: "ai", inferredFields: ["body"] },
  };

  const negative: ApiTestCasePayload = {
    title: `${endpoint.name} - 反向缺参`,
    description: `验证 ${endpoint.method} ${endpoint.path} 参数缺失时的错误响应`,
    priority: "P1",
    polarity: "negative",
    enabled: true,
    status: "ready",
    preconditions: ["已选择有效执行环境"],
    request: {
      method: endpoint.method,
      path: endpoint.path,
      headers: { "Content-Type": "application/json" },
      body: {},
    },
    expected: {
      statusCode: [400, 401, 403, 404, 422],
      statusOnly: true,
    },
    metadata: { source: "ai" },
  };

  return [positive, negative];
}
