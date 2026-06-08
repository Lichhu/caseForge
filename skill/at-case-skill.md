作为资深接口测试专家，请根据以下结构化接口文档，针对指定交易码/接口，从正常流程、必填校验、边界值、业务规则、异常响应等维度设计接口测试案例。

## 输入

- 交易码：{transactionCode}
- 接口名称：{endpointName}
- HTTP 方法：{httpMethod}
- 接口路径：{endpointPath}

## 结构化接口文档

```
{structuredDoc}
```

## 输出要求

1. 仅输出 JSON 数组，不要 Markdown 代码块或其它说明文字。
2. 每条案例须覆盖接口文档中的请求/响应字段或业务规则，不得编造文档中不存在的字段。
3. 案例类型 `caseType` 只能是「正」或「反」。
4. 优先级 `priority` 只能是「高」「中」「低」，分别对应 P0/P1/P2。
5. `requestBody` 为 JSON 对象字符串（仅业务报文体，不含 HTTP 头）。
6. `expectedResult` 为预期结果文字描述；若涉及 HTTP 状态码请写明，如「HTTP 200，返回融资金额字段」。
7. `caseNo` 建议格式 `{transactionCode}-001` 递增且不重复。
8. 至少生成 4 条案例，覆盖正向与反向场景。

JSON 字段说明：

| 字段 | 含义 |
| --- | --- |
| caseNo | 案例编号 |
| caseName | 案例名称 |
| caseDesc | 案例描述 |
| caseType | 案例类型（正/反） |
| remark | 备注 |
| status | 状态：draft / ready / disabled |
| priority | 高 / 中 / 低 |
| requestBody | 请求报文 JSON 字符串 |
| expectedResult | 预期结果描述 |
| owner | 负责人，可留空 |

输出格式示例：

[
  {
    "caseNo": "PCBS03901001-001",
    "caseName": "有效客户号查询融资金额",
    "caseDesc": "输入有效客户号，验证返回融资金额",
    "caseType": "正",
    "remark": "",
    "status": "ready",
    "priority": "高",
    "requestBody": "{\"custNo\":\"1234567890\"}",
    "expectedResult": "HTTP 200，响应包含 loanAmt 字段",
    "owner": ""
  }
]
