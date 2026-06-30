/**
 * AI JSON 解析回归测试脚本
 * 运行：pnpm --filter @case-forge/api ts-node -r tsconfig-paths/register scripts/test-parse-json-array.ts
 */
import { AiWorkflowService } from "../src/common/ai-workflow/service/ai-workflow.service";

const mockConfig = {
  reqDocSkillUrl: "",
  caseDocPromoteUrl: "",
  atCaseSkillUrl: "",
  aiChat: {
    url: "",
    model: "",
    apiKey: "",
    retryTime: 0,
    requestTimeoutMs: 60000,
  },
};

const service = new AiWorkflowService(mockConfig as any);

const testCases: { name: string; input: string; expected: unknown }[] = [
  {
    name: "标准 JSON 数组",
    input: `[{"name": "登录成功", "priority": "P0"}]`,
    expected: [{ name: "登录成功", priority: "P0" }],
  },
  {
    name: "markdown 围栏包裹",
    input: '```json\n[{"name": "登录成功"}]\n```',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "中文标点冒号逗号",
    input: '[{"name"："登录成功"，"priority"："P0"}]',
    expected: [{ name: "登录成功", priority: "P0" }],
  },
  {
    name: "中文引号",
    input: '[{"name": "登录成功"}]',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "末尾多余逗号",
    input: '[{"name": "登录成功","priority": "P0",}]',
    expected: [{ name: "登录成功", priority: "P0" }],
  },
  {
    name: "中文标点 + 末尾逗号",
    input: '[{"name"："登录成功"，"priority"："P0"，}]',
    expected: [{ name: "登录成功", priority: "P0" }],
  },
  {
    name: "带解释文字",
    input:
      '好的，这是生成的案例：\n```json\n[{"name": "登录成功"}]\n```\n请查收。',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "嵌套数组解释",
    input: '这是结果 [{"name": "a"}] 和 ["无关"]，真正的是 [ {"name": "b"} ]',
    expected: [{ name: "a" }],
  },
  {
    name: "双转义 JSON",
    input: JSON.stringify(JSON.stringify([{ name: "登录成功" }])),
    expected: [{ name: "登录成功" }],
  },
  {
    name: "字符串里的中文标点不应破坏结构",
    input: '[{"name": "用户“登录成功”","desc":"注意：需要，验证"}]',
    expected: [{ name: "用户“登录成功”", desc: "注意：需要，验证" }],
  },
  {
    name: "中文括号",
    input: '[{"name": "登录（成功）"}]',
    expected: [{ name: "登录（成功）" }],
  },
  {
    name: "对象包装 data 数组",
    input: '{"data": [{"name": "登录成功"}], "total": 1}',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "对象包装 list 数组",
    input: '{"list": [{"name": "登录成功"}]}',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "对象包装中文标点",
    input: '{"data"：[{"name"："登录成功"}]}',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "尾部注释",
    input: '[{"name": "登录成功"}]\n// 这是 AI 返回的说明',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "BOM 头",
    input: '\uFEFF[{"name": "登录成功"}]',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "数组后带解释",
    input: '[{"name": "登录成功"}]\n以上是我生成的案例。',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "多层嵌套 markdown",
    input: '```json\n```json\n[{"name": "登录成功"}]\n```\n```',
    expected: [{ name: "登录成功" }],
  },
  {
    name: "完全非 JSON",
    input: "不好意思，我没理解你的需求",
    expected: null,
  },
  {
    name: "空数组",
    input: "[]",
    expected: [],
  },
  {
    name: "单引号 JSON",
    input: "[{name: '登录成功'}]",
    expected: null,
  },
  {
    name: "字段名未加引号",
    input: '[{name: "登录成功"}]',
    expected: null,
  },
];

let passed = 0;
let failed = 0;

for (const { name, input, expected } of testCases) {
  const result = service.parseJsonArray<any>(input);
  const ok = JSON.stringify(result) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name}`);
    console.log(
      `   输入: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`,
    );
    console.log(`   期望: ${JSON.stringify(expected)}`);
    console.log(`   实际: ${JSON.stringify(result)}`);
  }
}

console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
