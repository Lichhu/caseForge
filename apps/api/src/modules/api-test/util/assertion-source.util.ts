import type { AssertionValueSource } from "@case-forge/shared";

export interface ExpectedSourceFunctionMeta {
  type?: string;
  description?: string;
}

const FUNCTION_PATTERN =
  /\$\{([A-Z][A-Z0-9_-]*)\(([^{}]*)\)(?:\.([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*))?\}/g;
const VARIABLE_PATTERN =
  /\$\{\s*([^}()]+?)\s*\}|\{\{\s*([^}()]+?)\s*\}\}/g;

/**
 * 从断言解析前的期望值模板里提取来源：
 * - `${FUNC(...)}`：数据函数（SQL 函数会标记为「SQL 查询函数」）
 * - `${共享变量}` / `{{共享变量}}`：前序步骤提取的变量
 *
 * 纯字面量不返回来源，避免结果卡片出现无意义的信息。
 */
export function collectExpectedSource(input: {
  template?: unknown;
  variableSources?: Record<string, string>;
  functions?: Map<string, ExpectedSourceFunctionMeta>;
}): AssertionValueSource | undefined {
  const template =
    typeof input.template === "string" ? input.template.trim() : "";
  if (
    !template ||
    (!template.includes("${") && !template.includes("{{"))
  ) {
    return undefined;
  }

  const variableSources = input.variableSources ?? {};
  const functions = input.functions ?? new Map();
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const match of template.matchAll(FUNCTION_PATTERN)) {
    const name = match[1];
    if (!name || seen.has(`fn:${name}`)) continue;
    seen.add(`fn:${name}`);
    const meta = functions.get(name);
    const kindLabel = meta?.type === "sql" ? "SQL 查询函数" : "数据函数";
    const description = meta?.description?.trim();
    labels.push(
      `${kindLabel} ${name}${description ? `（${description}）` : ""}`,
    );
  }

  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const key = (match[1] ?? match[2] ?? "").trim();
    if (!key || key.includes("(") || seen.has(`var:${key}`)) continue;
    seen.add(`var:${key}`);
    const source = variableSources[key]?.trim();
    labels.push(source ? `${key}（${source}）` : `共享变量 ${key}`);
  }

  if (!labels.length) return undefined;
  const hasFunction = [...seen].some((item) => item.startsWith("fn:"));
  const hasVariable = [...seen].some((item) => item.startsWith("var:"));
  return {
    kind:
      hasFunction && hasVariable
        ? "mixed"
        : hasFunction
          ? "data_function"
          : "variable",
    label: labels.join(" · "),
    expression:
      template.length > 300 ? `${template.slice(0, 300)}…` : template,
  };
}
