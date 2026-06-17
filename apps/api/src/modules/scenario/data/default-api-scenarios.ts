/**
 * 系统预置接口测试场景（来源：information/接口测试规范.md）
 * scope=api，createdBy=system，应用启动时自动 upsert。
 */
export interface DefaultApiScenarioPrompt {
  name: string;
  content: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface DefaultApiScenarioDefinition {
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  prompts: DefaultApiScenarioPrompt[];
}

export const DEFAULT_API_SCENARIOS: DefaultApiScenarioDefinition[] = [
  {
    name: "正向流程",
    description: "通用规则：优先生成主流程成功路径案例",
    category: "通用规则",
    isActive: true,
    prompts: [
      {
        name: "主流程成功路径",
        content: [
          "优先生成正向（caseType=正）案例，覆盖接口文档中的核心业务成功路径。",
          "请求报文使用合法、典型的字段取值；预期结果明确成功响应断言（HTTP 写状态码，TCP 写响应报文 bizResCode/关键节点，见「通讯与报文格式」）。",
          "若文档标注服务属性为查询类/管理类/账务类等，案例名称与描述应体现对应业务语义。",
          "同一接口至少 1 条高优先级（priority=高）正向案例。",
        ].join("\n"),
        tags: ["正向", "P0"],
        sortOrder: 1,
        isActive: true,
        isDefault: true,
      },
    ],
  },
  {
    name: "必填参数校验",
    description: "功能：参数名与是否必填",
    category: "功能",
    isActive: true,
    prompts: [
      {
        name: "必填字段缺失",
        content: [
          "针对接口文档标记为「必填/是/Y」的请求字段，逐一生成反向案例：",
          "- 不传该字段；",
          "- 传空字符串或仅空格；",
          "- 传 null（若字段类型允许）。",
          "每条案例仅变更一个必填字段，其余字段保持合法取值。",
          "预期结果应包含明确的业务/参数错误提示或约定错误码，不得返回成功。",
          "若文档无必填字段标注，则跳过本提示词。",
        ].join("\n"),
        tags: ["必填", "反向"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
      {
        name: "参数名称错误",
        content: [
          "生成参数名拼写错误或大小写错误的反向案例（如文档字段为 custNo，请求中使用 custNO 或 customerNo）。",
          "验证接口对未知字段的处理：拒绝、忽略或报错，并在 expectedResult 中说明预期行为。",
        ].join("\n"),
        tags: ["参数名", "反向"],
        sortOrder: 2,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "参数值边界与异常",
    description: "功能：参数值超长、异常取值、类型错误",
    category: "功能",
    isActive: true,
    prompts: [
      {
        name: "边界与异常取值",
        content: [
          "结合文档中的字段长度、类型与业务含义，生成反向案例，覆盖：",
          "- 参数值超长（超过文档长度上限或 maxLength）；",
          "- 金额/利率/频率类字段：负值、0、0.0、超大值；",
          "- 类型错误：数字字段传中文/英文、字符串字段传对象；",
          "- 特殊符号（如 %、'、\"、<script>）；",
          "- null、空串、纯空格。",
          "每条案例 requestBody 仅重点变更 1～2 个字段，expectedResult 写清错误表现。",
        ].join("\n"),
        tags: ["边界", "异常", "反向"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "字段关联校验",
    description: "功能：字段之间的业务关联",
    category: "功能",
    isActive: true,
    prompts: [
      {
        name: "关联字段组合",
        content: [
          "识别文档中存在业务关联的字段组合（如：证件类型+证件号码、币种+金额、开始日期+结束日期），生成：",
          "- 正向：关联字段取值一致且合法；",
          "- 反向：关联字段取值不匹配或逻辑冲突（如身份证类型配护照号码）。",
          "案例描述需点明关联关系与验证点。",
        ].join("\n"),
        tags: ["关联", "业务规则"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "精度校验",
    description: "功能：利率、金额、频率等精度",
    category: "功能",
    isActive: true,
    prompts: [
      {
        name: "金额利率频率精度",
        content: [
          "对文档中的金额、利率、频率、比率类字段生成案例：",
          "- 正向：符合精度要求的小数（如金额两位小数、利率四位小数）；",
          "- 反向：超出精度位数、科学计数法、非数字字符。",
          "expectedResult 说明是否四舍五入、截断或报错。",
        ].join("\n"),
        tags: ["精度", "金额", "利率"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "枚举值校验",
    description: "功能：枚举取值覆盖与非法枚举",
    category: "功能",
    isActive: true,
    prompts: [
      {
        name: "枚举覆盖",
        content: [
          "对文档中标注枚举/码值/选项的字段：",
          "- 若枚举个数少（≤5），正向案例尽量全量覆盖各枚举值；",
          "- 若枚举个数多，正向覆盖文档备注的生产常用值；",
          "- 反向：传文档中不存在的枚举值。",
          "非法枚举预期：有明确报错信息，或说明是否兜底为默认值。",
        ].join("\n"),
        tags: ["枚举", "码值"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "分页参数校验",
    description: "通用规则：页码与页大小",
    category: "通用规则",
    isActive: true,
    prompts: [
      {
        name: "分页异常与功能",
        content: [
          "若接口文档存在分页字段（页码/pageNum/pageNo、页大小/pageSize/limit 等），生成案例：",
          "【反向-页码】负数(-1)、特殊符号(%)、超大值(99999999)、类型错误(中文/英文/浮点1.2)、空值(空格/空串)；",
          "【反向-页大小】同上，另加 null；",
          "【正向-功能】页码传第1页、第2页；页大小传10、20；",
          "【缺参】不传页码和页大小，验证是否有默认分页与默认页大小。",
          "无分页字段则跳过。",
        ].join("\n"),
        tags: ["分页", "pageNum", "pageSize"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "幂等性校验",
    description: "通用规则：幂等字段重复请求",
    category: "通用规则",
    isActive: true,
    prompts: [
      {
        name: "幂等重复请求",
        content: [
          "识别文档或业务上可能作为幂等键的字段（流水号、业务号+时间戳、订单号等），生成：",
          "- 使用相同幂等键连续两次请求；",
          "- expectedResult 说明两次响应是否一致、是否拒绝重复、是否返回相同业务结果。",
          "案例备注标明所采用的幂等字段。",
        ].join("\n"),
        tags: ["幂等"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "大报文与文件上传",
    description: "通用规则：循环体多对象、大响应、文件类字段",
    category: "通用规则",
    isActive: true,
    prompts: [
      {
        name: "大报文场景",
        content: [
          "若接口涉及循环体/列表字段、文件上传（图片/视频/签章/明细）或大批量数据返回，生成：",
          "- 正向：循环体含多个对象、或典型文件/明细结构；",
          "- 反向或边界：空列表、单对象、超大量对象（在合理范围内模拟）；",
          "预期结果关注响应完整性、超时风险说明（写入 remark）。",
        ].join("\n"),
        tags: ["大报文", "文件"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "涉帐业务场景",
    description: "涉帐接口：结合业务交互设计场景",
    category: "涉帐接口",
    isActive: true,
    prompts: [
      {
        name: "涉帐典型场景",
        content: [
          "当文档服务属性为账务类/冲正类，或字段涉及账户、金额、扣款、还款、利率时，结合业务设计案例，例如：",
          "- 账户余额不足；",
          "- 扣款账户非本人；",
          "- 扣款未传密码/鉴权信息；",
          "- 利率/金额超出允许范围。",
          "优先生成高优先级正向案例，再补充典型反向业务拦截案例。",
          "非涉帐接口可跳过或仅生成与金额字段相关的通用校验。",
        ].join("\n"),
        tags: ["涉帐", "业务场景"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "安全测试",
    description: "安全：SQL 注入与权限",
    category: "安全",
    isActive: true,
    prompts: [
      {
        name: "注入与权限",
        content: [
          "对字符串类输入字段生成安全反向案例：",
          "- SQL 注入片段（如 ' or 1=1 --）；",
          "- XSS 片段（如 <script>alert(1)</script>），若适用；",
          "另生成权限相关案例（在 remark 说明假设前提）：",
          "- 水平权限：访问他人资源 ID；",
          "- 垂直权限：低权限角色调用高权限接口。",
          "预期：拒绝访问或安全过滤，不得泄露数据库/代码层原始错误。",
        ].join("\n"),
        tags: ["安全", "SQL注入", "权限"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "断言与响应规范",
    description: "断言：多检查点与报错规范性",
    category: "断言",
    isActive: true,
    prompts: [
      {
        name: "断言检查点",
        content: [
          "生成的每条案例 expectedResult 应尽量包含多个可验证检查点，例如：",
          "- 成功/失败响应码（HTTP 状态码，或 TCP 响应报文 bizResCode/resCode）；",
          "- 关键业务字段取值（如余额、状态码、msg）；",
          "- 新增响应字段（接口变更场景）需单独断言。",
          "面客/对客接口：若预期报错，错误信息应为用户可理解的业务文案，不得直接暴露代码层/数据库层异常（可在反向案例中验证）。",
        ].join("\n"),
        tags: ["断言", "响应规范"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
  {
    name: "非涉帐服务属性",
    description: "非涉帐接口：管理/查询/文件/推送类",
    category: "非涉帐接口",
    isActive: true,
    prompts: [
      {
        name: "按服务属性设计",
        content: [
          "根据文档「服务属性/服务类型」字段取值设计案例侧重：",
          "- 查询类：条件组合、空结果、结果字段完整性；",
          "- 管理类：新增/修改/删除状态流转、重复操作；",
          "- 文件类：文件格式、大小、缺失文件；",
          "- 推送类：推送目标、重复推送、推送失败重试语义。",
          "服务变更场景下，非涉帐类接口以增量变更字段/行为为主设计案例。",
        ].join("\n"),
        tags: ["非涉帐", "服务属性"],
        sortOrder: 1,
        isActive: true,
        isDefault: false,
      },
    ],
  },
];
