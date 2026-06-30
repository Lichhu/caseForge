作为资深接口测试专家，请根据以下结构化接口文档，针对指定交易码/接口，按《接口测试规范》**标准二（非涉帐接口 · 重点测试）** 设计接口测试案例。

## 输入

- 交易码：{transactionCode}
- 接口名称：{endpointName}

{endpointContext}

## 结构化接口文档

```
{structuredDoc}
```

## 通讯与报文格式（必读）

{protocolGuidance}

## 测试设计标准（标准二）

非涉帐类接口以标准二为基线，**单次生成约 6 条案例**（字段丰富、分页/金额类字段多，或用户额外勾选场景提示词时，可增至 8～12 条，但须保持「单案例单验证点」）。

按下列维度优先级设计；**文档中不存在对应字段/规则时，跳过该维度**，不要编造字段，可在 `remark` 中写「文档无分页字段，跳过」。

### 1. 通用规则（文档适用时尽量覆盖）

| 维度 | 设计要点 | caseType | 说明 |
| --- | --- | --- | --- |
| 响应耗时 3S | 对客接口关注 ≤2s，内部/查询类 ≤3s | 正 | `caseDesc`/`expectedResult` 注明性能关注点；`remark` 可写「需 JMeter 5 并发复核」 |
| 大报文 10K | 请求循环体多对象、响应大数据量、文件/明细批量 | 正或反 | 构造接近或超过 10K 字符/条数的报文，验证是否超时、截断或报错 |
| 幂等性（账务） | 流水号、业务号+时间戳等幂等键 | 正 | **仅**文档标注账务/涉帐/冲正/扣款等语义时生成：相同幂等键重复提交，预期响应一致、无重复入账 |

### 2. 正常测试场景（至少 1 条）

- **正案例 1 条**，`caseType=正`，`priority=高`。
- 请求报文使用合法、典型取值，覆盖接口文档**核心业务成功路径**。
- `expectedResult` 按通讯方式：HTTP 写状态码；TCP 写响应报文 bizResCode/关键节点（见「通讯与报文格式」）。

### 3. 异常测试场景（按文档字段择要，每条仅变更 1～2 个字段）

#### 3.1 金额、利率、频率类等数值字段

文档存在金额/利率/频率/比率/期数等字段时，至少覆盖以下反向场景中的 **2～3 条**（合并到不同案例，勿一条案例测多点）：

- **负值**（如 `-1`、`-0.01`）
- **0 / 0.0**
- **高精度**（超出文档精度，如金额三位小数、利率六位小数）

#### 3.2 取值范围类

- **超出边界**：超过文档 `maxLength`/长度上限、小于 `min`、大于 `max`、超过业务允许范围。
- 可与 3.1 分开：3.1 侧重「非法数值形态」，3.2 侧重「合法形态但超业务边界」。

#### 3.3 分页（文档含 pageNum/pageNo/页码、pageSize/页大小/limit 等时 **必覆盖**）

至少 **3 条反向**（无分页字段则整节跳过）：

- **非法页码**：负数（-1）、特殊符号（%）、超大值（99999999）、类型错误（中文/英文/浮点 1.2）、空值（空格/空串）
- **非法页大小**：同上规则应用于页大小字段
- **缺失分页参数**：不传页码和/或页大小，验证默认分页行为或报错

可选 **1 条正向**：页码=1、页大小=10/20，验证分页功能正常。

### 4. 业务规则（依据描述测试，n 条）

- 从文档的**处理规则、业务约束、状态流转、字段关联**（如证件类型+证件号码、开始日期≤结束日期）提炼案例。
- 每条 `caseDesc` 须引用文档中的业务描述要点，说明「测什么规则、为何预期如此」。
- 有明确业务约束时至少 **1 正 1 反**；约束简单时可合并到正向案例中。

### 5. 与场景提示词的关系

若用户附加了「场景约束」章节，**须与标准二取并集**：优先满足场景提示词中的专项要求，同时尽量保持标准二基线（约 6 条）不被完全替代；冲突时以场景约束为准。

### 6. 涉帐接口补充（文档标注账务/涉帐/冲正/扣款/还款等时）

在标准二基础上增加：

- 幂等性案例（见 1.3）
- 业务交互类异常（如余额不足、账户非本人、必填安全字段缺失等，**仅文档有描述时**）
- 正向案例优先级仍为 `高`，优先覆盖资金正确性相关断言

---

## 设计原则

1. **仅使用文档中出现的请求/响应字段**，不得编造字段名或业务规则。
2. **单案例单验证点**：每条反向案例只重点变更 1～2 个字段，其余保持合法取值。
3. **`caseDesc` 标注测试维度**，建议格式：`标准二-{维度}-{子项}`，如 `标准二-分页-非法页码`、`标准二-数值-利率负值`。
4. 必填参数缺失、枚举非法、参数名错误、SQL 注入等，若场景提示词未覆盖且文档有标注，可酌情补充，**但不替代**标准二上述优先级。
5. 服务属性（查询类/管理类/文件类/推送类/账务类）须在案例名称或描述中体现对应语义。

---

## 输出要求

1. **仅输出 JSON 数组**，不要 Markdown 代码块或其它说明文字。
2. 案例类型 `caseType` 只能是「正」或「反」。
3. 优先级 `priority` 只能是「高」「中」「低」，分别对应 P0/P1/P2；**正向主流程与核心通用规则用「高」**。
4. `requestBody` 格式见上文「通讯与报文格式」：**JSON 接口输出 JSON 对象字符串；XML/SOAP 接口输出完整 XML 字符串；文本接口输出纯文本**（均仅业务报文体，不含 HTTP/TCP 传输层头）。
5. `expectedResult` 格式见上文「通讯与报文格式」：**HTTP 接口写明状态码；TCP/TUXEDO 接口描述响应报文业务返回码与关键节点，不写 HTTP 状态码**。
6. `caseNo` 建议格式 `{transactionCode}-001` 递增且不重复。
7. **至少生成 6 条案例**（文档极简、可测维度不足 6 项时，能覆盖的维度全覆盖，并在 `remark` 说明跳过原因）。
8. 建议配比（可随文档微调）：**正 2～3 条 / 反 3～4 条**，覆盖「正常 + 通用规则 + 异常 + 业务规则」。

JSON 字段说明：

| 字段 | 含义 |
| --- | --- |
| caseNo | 案例编号 |
| caseName | 案例名称 |
| caseDesc | 案例描述（建议含标准二维度标签） |
| caseType | 案例类型（正/反） |
| remark | 备注（性能/幂等/跳过原因等） |
| status | 状态：draft / ready / disabled |
| priority | 高 / 中 / 低 |
| requestBody | 请求报文（JSON 对象字符串 / XML 字符串 / 文本，见通讯与报文格式） |
| expectedResult | 预期结果描述（HTTP 写状态码；TCP 写响应报文断言） |
| owner | 负责人，可留空 |

输出格式示例：

[
  {
    "caseNo": "PCBS03901001-001",
    "caseName": "有效客户号查询融资金额-主流程",
    "caseDesc": "标准二-正常场景-正案例：输入有效客户号，验证核心业务成功路径",
    "caseType": "正",
    "remark": "",
    "status": "ready",
    "priority": "高",
    "requestBody": "{\"custNo\":\"1234567890\"}",
    "expectedResult": "HTTP 200，响应包含 loanAmt 字段且取值合法",
    "owner": ""
  },
  {
    "caseNo": "PCBS03901001-002",
    "caseName": "查询接口响应耗时关注",
    "caseDesc": "标准二-通用规则-响应耗时：对客查询类接口性能基线",
    "caseType": "正",
    "remark": "对客接口建议 ≤2s；可 JMeter 5 并发复核均值 ≤3s",
    "status": "ready",
    "priority": "高",
    "requestBody": "{\"custNo\":\"1234567890\"}",
    "expectedResult": "HTTP 200，单次响应时间 ≤3s（对客 ≤2s）",
    "owner": ""
  },
  {
    "caseNo": "PCBS03901001-003",
    "caseName": "页码传负数",
    "caseDesc": "标准二-分页-非法页码：页码字段传 -1",
    "caseType": "反",
    "remark": "",
    "status": "ready",
    "priority": "中",
    "requestBody": "{\"pageNum\":-1,\"pageSize\":10}",
    "expectedResult": "HTTP 400 或业务错误码，提示页码非法",
    "owner": ""
  },
  {
    "caseNo": "PCBS01001-004",
    "caseName": "利率字段传负值",
    "caseDesc": "标准二-数值-负值：利率字段传 -0.01",
    "caseType": "反",
    "remark": "",
    "status": "ready",
    "priority": "中",
    "requestBody": "{\"rate\":-0.01}",
    "expectedResult": "HTTP 400 或业务错误，提示利率不能为负",
    "owner": ""
  },
  {
    "caseNo": "PCBS03901001-005",
    "caseName": "不传分页参数",
    "caseDesc": "标准二-分页-缺失参数：不传页码与页大小",
    "caseType": "反",
    "remark": "",
    "status": "ready",
    "priority": "中",
    "requestBody": "{}",
    "expectedResult": "HTTP 200 使用默认分页，或 HTTP 400 提示缺少分页参数",
    "owner": ""
  },
  {
    "caseNo": "PCBS03901001-006",
    "caseName": "结束日期早于开始日期",
    "caseDesc": "标准二-业务规则-日期关联：开始日期 > 结束日期",
    "caseType": "反",
    "remark": "",
    "status": "ready",
    "priority": "中",
    "requestBody": "{\"startDate\":\"2026-12-31\",\"endDate\":\"2026-01-01\"}",
    "expectedResult": "HTTP 400 或业务错误，提示日期区间非法",
    "owner": ""
  }
]

### TCP + XML 接口输出示例（通讯方式 TCP、报文类型 XML 时参考）

[
  {
    "caseNo": "QYCX007-001",
    "caseName": "有效客户号查询-主流程",
    "caseDesc": "标准二-正常场景-正案例：输入有效 cstNo",
    "caseType": "正",
    "remark": "",
    "status": "ready",
    "priority": "高",
    "requestBody": "<Transaction><Header><sysHeader><msgId>00032026061215153489849372</msgId><msgDate>2026-06-12</msgDate><msgTime>15:15:34.159</msgTime><serviceCd>P00001053305</serviceCd><operation>QYCX007</operation><clientCd>003</clientCd><serverCd>121</serverCd><bizId>3</bizId><bizType>1</bizType><orgCode>01224</orgCode><resCode/><resText/><bizResCode/><bizResText/><ver>100100100</ver><authId/><authPara/><authContext/><pinIndex/><pinValue/></sysHeader></Header><Body><request><bizHeader><pageNum>1</pageNum><pageSize>20</pageSize><tranCode>QYCX007</tranCode><tranNbr>00032026061215153489849372</tranNbr></bizHeader><bizBody><cstNo>1234567890</cstNo><accName/><accNo/><crdtNo/><crdtTp/><cstNm/><openCode/><remark1/><rspbPsnId/><viruserId/></bizBody></request></Body></Transaction>",
    "expectedResult": "响应报文 bizResCode=000000，bizBody 含目标业务字段",
    "owner": ""
  },
  {
    "caseNo": "QYCX007-002",
    "caseName": "页码传负数",
    "caseDesc": "标准二-分页-非法页码：bizHeader.pageNum 传 -1",
    "caseType": "反",
    "remark": "",
    "status": "ready",
    "priority": "中",
    "requestBody": "<Transaction><Header><sysHeader><msgId>00032026061215153489849372</msgId><msgDate>2026-06-12</msgDate><msgTime>15:15:34.159</msgTime><serviceCd>P00001053305</serviceCd><operation>QYCX007</operation><clientCd>003</clientCd><serverCd>121</serverCd><bizId>3</bizId><bizType>1</bizType><orgCode>01224</orgCode><resCode/><resText/><bizResCode/><bizResText/><ver>100100100</ver><authId/><authPara/><authContext/><pinIndex/><pinValue/></sysHeader></Header><Body><request><bizHeader><pageNum>-1</pageNum><pageSize>20</pageSize><tranCode>QYCX007</tranCode><tranNbr>00032026061215153489849372</tranNbr></bizHeader><bizBody><cstNo>1234567890</cstNo><accName/><accNo/><crdtNo/><crdtTp/><cstNm/><openCode/><remark1/><rspbPsnId/><viruserId/></bizBody></request></Body></Transaction>",
    "expectedResult": "响应报文 bizResCode 非 000000，bizResText 提示页码非法",
    "owner": ""
  }
]
