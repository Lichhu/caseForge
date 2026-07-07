import {
  mapSocketWayToTransport,
  mapMessageTypeToFormat,
  resolveApiTechnicalProfile,
  resolveTechnicalProfileFromSmpData,
} from "./api-doc-technical-profile.util";

describe("mapSocketWayToTransport", () => {
  it("maps HTTP → http", () => {
    expect(mapSocketWayToTransport("HTTP")).toBe("http");
  });

  it("maps TEP → tcp", () => {
    expect(mapSocketWayToTransport("TEP")).toBe("tcp");
  });

  it("maps TCP → tcp", () => {
    expect(mapSocketWayToTransport("TCP")).toBe("tcp");
  });

  it("maps SOCKET → tcp", () => {
    expect(mapSocketWayToTransport("SOCKET")).toBe("tcp");
  });

  it("maps empty → http (default)", () => {
    expect(mapSocketWayToTransport("")).toBe("http");
  });

  it("maps unknown → other", () => {
    expect(mapSocketWayToTransport("WEIRD")).toBe("other");
  });
});

describe("mapMessageTypeToFormat", () => {
  it("maps JSON → json", () => {
    expect(mapMessageTypeToFormat("JSON")).toBe("json");
  });

  it("maps XML → xml", () => {
    expect(mapMessageTypeToFormat("XML")).toBe("xml");
  });

  it("maps ESB标准XML → xml", () => {
    expect(mapMessageTypeToFormat("ESB标准XML")).toBe("xml");
  });

  it("maps SOAP → soap", () => {
    expect(mapMessageTypeToFormat("SOAP")).toBe("soap");
  });

  it("maps empty → json (default)", () => {
    expect(mapMessageTypeToFormat("")).toBe("json");
  });
});

describe("resolveTechnicalProfileFromSmpData", () => {
  it("returns tcp + xml for TEP/XML SMP data", () => {
    const profile = resolveTechnicalProfileFromSmpData({
      callServiceList: [
        { socketWay: "TEP", messageType: "XML", messageCoding: "UTF-8" },
      ],
    });
    expect(profile).not.toBeNull();
    expect(profile!.transport).toBe("tcp");
    expect(profile!.messageFormat).toBe("xml");
    expect(profile!.encoding).toBe("UTF-8");
  });

  it("returns http + json for HTTP/JSON SMP data", () => {
    const profile = resolveTechnicalProfileFromSmpData({
      callServiceList: [
        { socketWay: "HTTP", messageType: "JSON", messageCoding: "UTF-8" },
      ],
    });
    expect(profile).not.toBeNull();
    expect(profile!.transport).toBe("http");
    expect(profile!.messageFormat).toBe("json");
  });

  it("returns null when smpData is null", () => {
    expect(resolveTechnicalProfileFromSmpData(null)).toBeNull();
  });

  it("returns null when callServiceList is empty", () => {
    expect(
      resolveTechnicalProfileFromSmpData({ callServiceList: [] }),
    ).toBeNull();
  });

  it("returns null when socketWay and messageType are both empty", () => {
    expect(
      resolveTechnicalProfileFromSmpData({
        callServiceList: [{ socketWay: "", messageType: "" }],
      }),
    ).toBeNull();
  });

  it("falls back to testInfo.requestMessageType", () => {
    const profile = resolveTechnicalProfileFromSmpData({
      callServiceList: [{ socketWay: "TEP" }],
      serviceTestList: [{ requestMessageType: "XML" }],
    });
    expect(profile).not.toBeNull();
    expect(profile!.transport).toBe("tcp");
    expect(profile!.messageFormat).toBe("xml");
  });

  it("extracts invocationMode and maxMessageSize", () => {
    const profile = resolveTechnicalProfileFromSmpData({
      callServiceList: [
        {
          socketWay: "TCP",
          messageType: "JSON",
          callMethod: "异步",
          maxMessageSize: "20K",
          headId: "H001",
        },
      ],
    });
    expect(profile!.invocationMode).toBe("异步");
    expect(profile!.maxMessageSize).toBe("20K");
    expect(profile!.businessHeaderMark).toBe("H001");
  });
});

describe("resolveApiTechnicalProfile", () => {
  const httpJsonDoc = [
    "技术信息",
    "----",
    "通讯方式|HTTP",
    "报文类型|JSON",
    "报文编码|UTF-8",
  ].join("\n");

  it("prefers explicit HTTP/JSON from doc over smpData TCP/XML", () => {
    const profile = resolveApiTechnicalProfile(httpJsonDoc, {
      smpData: {
        callServiceList: [{ socketWay: "TEP", messageType: "XML" }],
      },
      endpoint: {
        method: "TCP",
        path: "/addCtmSealInfo",
        requestNotes: "<Transaction></Transaction>",
      },
    });
    expect(profile.transport).toBe("http");
    expect(profile.messageFormat).toBe("json");
    expect(profile.encoding).toBe("UTF-8");
  });

  it("falls back to smpData when doc has no 技术信息 section", () => {
    const legacyDoc = [
      "请求报文",
      "----",
      "| 节点代码 | 是否必填 |",
      "| custNo | Y |",
    ].join("\n");
    const profile = resolveApiTechnicalProfile(legacyDoc, {
      smpData: {
        callServiceList: [{ socketWay: "TEP", messageType: "XML" }],
      },
    });
    expect(profile.transport).toBe("tcp");
    expect(profile.messageFormat).toBe("xml");
  });

  it("falls back to endpoint heuristic when no doc tech info and no smpData", () => {
    const profile = resolveApiTechnicalProfile("", {
      endpoint: {
        method: "POST",
        path: "/api/test",
        requestNotes: "<Transaction></Transaction>",
      },
    });
    expect(profile.transport).toBe("http");
    expect(profile.messageFormat).toBe("xml");
  });
});
