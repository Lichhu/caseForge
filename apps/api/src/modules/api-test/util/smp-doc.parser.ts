import type { ApiEndpointPayload } from "@case-forge/shared";

export function parseEndpointsFromSmpData(
  callServiceList: unknown[],
  serviceTestList: unknown[],
): ApiEndpointPayload[] {
  if (!serviceTestList.length) return [];

  const endpoints: ApiEndpointPayload[] = [];
  serviceTestList.forEach((testItem, index) => {
    // SMP 偶发返回 null 元素：跳过但保留 index，维持与 callServiceList 的对齐
    if (!isRecord(testItem)) return;
    const test = testItem;
    const alignedCall = callServiceList[index];
    const callItem = isRecord(alignedCall)
      ? alignedCall
      : (callServiceList.find(isRecord) ?? {});
    const name =
      stringValue(callItem.serviceCname) ||
      stringValue(callItem.descript) ||
      stringValue(test.requestUrl) ||
      `接口 ${index + 1}`;
    const method = resolveMethod(test, callItem);
    const path = stringValue(test.requestUrl)?.trim() || "/";
    endpoints.push({
      name,
      method,
      path,
      summary:
        stringValue(callItem.descript) ||
        stringValue(callItem.serviceCname) ||
        name,
      requestNotes: formatBody(test.requestBody),
      tags: callItem.serviceType
        ? [stringValue(callItem.serviceType)].filter((v): v is string =>
            Boolean(v),
          )
        : undefined,
    });
  });
  return endpoints;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

function resolveMethod(
  testItem: Record<string, unknown>,
  callItem: Record<string, unknown>,
): string {
  const socketWay = String(callItem.socketWay || "").toUpperCase();
  const requestMethod = String(testItem.requestMethod || "").toUpperCase();
  const callMethod = String(callItem.callMethod || "").toUpperCase();

  if (socketWay === "HTTP" || requestMethod) {
    return requestMethod || "POST";
  }
  if (socketWay) return socketWay;
  if (callMethod) return callMethod;
  return "POST";
}

function stringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function formatBody(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value as string), null, 2);
  } catch {
    return String(value);
  }
}
