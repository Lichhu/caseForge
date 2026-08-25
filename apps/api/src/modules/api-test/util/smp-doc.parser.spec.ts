import { parseEndpointsFromSmpData } from "./smp-doc.parser";

describe("parseEndpointsFromSmpData", () => {
  const callItem = {
    serviceCname: "测试服务",
    descript: "测试服务描述",
    serviceType: "查询",
    socketWay: "HTTP",
  };
  const testItem = {
    requestMethod: "post",
    requestUrl: "/api/test",
    requestBody: '{"a":1}',
  };

  it("正常解析 endpoint", () => {
    const endpoints = parseEndpointsFromSmpData([callItem], [testItem]);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      name: "测试服务",
      method: "POST",
      path: "/api/test",
    });
  });

  it("serviceTestList 中部含 null 时跳过且保持 index 对齐", () => {
    const secondCall = { ...callItem, serviceCname: "第二服务" };
    const endpoints = parseEndpointsFromSmpData(
      [callItem, { serviceCname: "占位" }, secondCall],
      [testItem, null, { requestUrl: "/api/second" }],
    );
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].name).toBe("测试服务");
    expect(endpoints[1].name).toBe("第二服务");
    expect(endpoints[1].path).toBe("/api/second");
  });

  it("serviceTestList 首位为 null 时不崩溃", () => {
    const endpoints = parseEndpointsFromSmpData([callItem], [null, testItem]);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/test");
  });

  it("callServiceList 含 null 时回退到首个有效元素", () => {
    const endpoints = parseEndpointsFromSmpData([null, callItem], [testItem]);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].name).toBe("测试服务");
  });

  it("全部为 null 时返回空数组", () => {
    expect(parseEndpointsFromSmpData([null], [null, null])).toEqual([]);
  });

  it("空列表返回空数组", () => {
    expect(parseEndpointsFromSmpData([], [])).toEqual([]);
  });

  it("没有测试信息时仍从服务信息创建端点", () => {
    expect(parseEndpointsFromSmpData([callItem], [])).toMatchObject([
      { name: "测试服务", method: "POST", path: "/" },
    ]);
  });

  it("测试信息全为无效项时回退到服务信息", () => {
    expect(parseEndpointsFromSmpData([callItem], [null, undefined])).toHaveLength(1);
  });
});
