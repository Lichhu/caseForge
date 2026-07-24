import { extractResponseValue } from "./assertion-runner.util";
import { substituteDeep } from "./variable-substitute.util";

describe("接口案例共享变量", () => {
  const response = {
    statusCode: 200,
    headers: { "x-trace-id": "trace-001" },
    body: {
      data: {
        accessToken: "token-001",
        order: { id: "order-001" },
      },
    },
  };

  it("Case A 响应体 token 可用于 Case B 请求头和请求体", () => {
    const accessToken = extractResponseValue(
      "body",
      "$.data.accessToken",
      response,
    );

    expect(
      substituteDeep(
        {
          headers: { Authorization: "Bearer ${accessToken}" },
          body: { token: "${accessToken}" },
        },
        { accessToken: String(accessToken) },
      ),
    ).toEqual({
      headers: { Authorization: "Bearer token-001" },
      body: { token: "token-001" },
    });
  });

  it("Case A 响应头 traceId 可用于 Case B 请求头", () => {
    const traceId = extractResponseValue("header", "X-Trace-Id", response);

    expect(
      substituteDeep(
        { headers: { "X-Trace-Id": "${traceId}" } },
        { traceId: String(traceId) },
      ),
    ).toEqual({ headers: { "X-Trace-Id": "trace-001" } });
  });

  it("提取带长度头的 XML 响应字段", () => {
    expect(
      extractResponseValue("body", "/Transaction/Header/resCode/text()", {
        statusCode: -1,
        headers: {},
        body: "00000925<?xml version=\"1.0\"?><Transaction><Header><resCode>000000</resCode></Header></Transaction>",
      }),
    ).toBe("000000");
  });

  it("Case A 订单号可传给 Case B，再由 Case B 传给 Case C", () => {
    const sharedVars = {
      orderId: String(
        extractResponseValue("body", "data.order.id", response),
      ),
    };

    expect(
      substituteDeep(
        { path: "/orders/${orderId}", body: { orderId: "${orderId}" } },
        sharedVars,
      ),
    ).toEqual({
      path: "/orders/order-001",
      body: { orderId: "order-001" },
    });
  });

  it("不存在的变量保持原表达式，避免静默发送空值", () => {
    expect(substituteDeep("Bearer ${missingToken}", {})).toBe(
      "Bearer ${missingToken}",
    );
  });
});
