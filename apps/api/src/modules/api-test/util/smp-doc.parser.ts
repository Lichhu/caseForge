import type { ApiEndpointPayload } from "@case-forge/shared";

export function parseEndpointsFromSmpData(
  callServiceList: unknown[],
  serviceTestList: unknown[],
): ApiEndpointPayload[] {
  if (!serviceTestList.length) return [];

  return serviceTestList.map((testItem, index) => {
    const callItem = (callServiceList[index] ??
      callServiceList[0] ??
      {}) as Record<string, unknown>;
    const test = testItem as Record<string, unknown>;
    const name =
      stringValue(callItem.serviceCname) ||
      stringValue(callItem.descript) ||
      stringValue(test.requestUrl) ||
      `接口 ${index + 1}`;
    const method = resolveMethod(test, callItem);
    const path = stringValue(test.requestUrl)?.trim() || "/";
    return {
      name,
      method,
      path,
      summary:
        stringValue(callItem.descript) ||
        stringValue(callItem.serviceCname) ||
        name,
      requestNotes: formatBody(test.requestBody),
      responseNotes: formatBody(test.responseBody),
      tags: callItem.serviceType
        ? [stringValue(callItem.serviceType)].filter((v): v is string =>
            Boolean(v),
          )
        : undefined,
    };
  });
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
