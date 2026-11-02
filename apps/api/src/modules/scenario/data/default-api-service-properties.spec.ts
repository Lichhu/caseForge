import { DEFAULT_API_SCENARIOS } from "./default-api-scenarios";
import { DEFAULT_API_SERVICE_PROPERTIES } from "./default-api-service-properties";

describe("default API service-property mapping", () => {
  const expected = {
    query_non_accounting: ["正向流程", "页码和页大小"],
    query_accounting: ["正向流程", "页码和页大小", "精度校验"],
    management_non_accounting: [
      "正向流程",
      "必填参数检验",
      "关联字段组合",
      "枚举",
      "幂等性校验",
    ],
    management_accounting: [
      "正向流程",
      "必填参数检验",
      "关联字段组合",
      "枚举",
      "精度校验",
      "幂等性校验",
    ],
    accounting: [
      "正向流程",
      "精度校验",
      "必填参数检验",
      "枚举",
      "业务场景",
      "关联字段组合",
      "幂等性校验",
    ],
    reversal: [
      "正向流程",
      "精度校验",
      "必填参数检验",
      "枚举",
      "业务场景",
      "关联字段组合",
      "幂等性校验",
    ],
    file: ["正向流程", "幂等性校验"],
    push: ["正向流程", "幂等性校验"],
  };

  it("matches the service-property reference table", () => {
    expect(
      Object.fromEntries(
        DEFAULT_API_SERVICE_PROPERTIES.map((item) => [
          item.code,
          item.scenarioNames,
        ]),
      ),
    ).toEqual(expected);
  });

  it("only references configured API scenarios", () => {
    const scenarioNames = new Set(DEFAULT_API_SCENARIOS.map((item) => item.name));
    for (const property of DEFAULT_API_SERVICE_PROPERTIES) {
      for (const scenarioName of property.scenarioNames) {
        expect(scenarioNames.has(scenarioName)).toBe(true);
      }
    }
  });
});
