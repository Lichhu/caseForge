export interface DefaultApiServicePropertyDefinition {
  code: string;
  name: string;
  description: string;
  scenarioNames: string[];
}

/** 与现有接口案例规则保持一致的初始服务属性配置。 */
export const DEFAULT_API_SERVICE_PROPERTIES: DefaultApiServicePropertyDefinition[] =
  [
    {
      code: "query_non_accounting",
      name: "查询类非涉账",
      description: "查询类、不涉及账务的接口",
      scenarioNames: ["正向流程", "页码和页大小"],
    },
    {
      code: "query_accounting",
      name: "查询类涉账",
      description: "查询类、涉及账务数据的接口",
      scenarioNames: [
        "正向流程",
        "页码和页大小",
        "精度校验",
      ],
    },
    {
      code: "management_non_accounting",
      name: "管理类非涉账",
      description: "新增、修改、删除类且不涉及账务的接口",
      scenarioNames: [
        "正向流程",
        "必填参数检验",
        "关联字段组合",
        "枚举",
        "幂等性校验",
      ],
    },
    {
      code: "management_accounting",
      name: "管理类涉账",
      description: "新增、修改、删除类且涉及账务的接口",
      scenarioNames: [
        "正向流程",
        "必填参数检验",
        "关联字段组合",
        "枚举",
        "精度校验",
        "幂等性校验",
      ],
    },
    {
      code: "accounting",
      name: "记账类",
      description: "直接记账或产生账务变动的接口",
      scenarioNames: [
        "正向流程",
        "精度校验",
        "必填参数检验",
        "枚举",
        "业务场景",
        "关联字段组合",
        "幂等性校验",
      ],
    },
    {
      code: "reversal",
      name: "冲正类",
      description: "冲正、撤销或反向记账类接口",
      scenarioNames: [
        "正向流程",
        "精度校验",
        "必填参数检验",
        "枚举",
        "业务场景",
        "关联字段组合",
        "幂等性校验",
      ],
    },
    {
      code: "file",
      name: "文件类",
      description: "文件上传、下载或处理类接口",
      scenarioNames: ["正向流程", "幂等性校验"],
    },
    {
      code: "push",
      name: "推送类",
      description: "主动向外部系统推送数据的接口",
      scenarioNames: ["正向流程", "幂等性校验"],
    },
  ];
