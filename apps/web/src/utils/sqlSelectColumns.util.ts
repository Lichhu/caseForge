/**
 * 解析数据函数查询 SQL 的 SELECT 列名，供插入函数时「结果字段」下拉使用。
 * 支持别名（AS alias）与表名前缀列；WITH ... AS (...) 公共表表达式取外层
 * 最终 SELECT 的列；SELECT * 或无法解析时返回空数组，此时下拉退化为手动输入。
 */
export function parseSqlSelectColumns(sql: string): string[] {
  const flattened = sql.replace(/\s+/g, " ").trim();
  const list = topLevelSelectList(flattened);
  if (!list || list === "*") return [];
  const columns: string[] = [];
  for (const item of splitTopLevelItems(list)) {
    const alias = item.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
    const raw = alias ? alias[1] : (item.trim().split(".").pop() ?? "");
    const name = raw.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !columns.includes(name))
      columns.push(name);
  }
  return columns;
}

/**
 * 插入数据函数弹窗「结果字段」候选：优先取函数配置中保存的返回字段列表，
 * 缺失时回退解析查询 SQL 的 SELECT 列。
 */
export function dataFunctionFieldOptions(
  config?: Record<string, any>,
): string[] {
  const saved = config?.returnFields ?? config?.sqlReturnFields;
  if (Array.isArray(saved) && saved.length)
    return saved.filter((field: unknown) => typeof field === "string");
  return parseSqlSelectColumns(String(config?.sql ?? ""));
}

/**
 * 取第一个顶层（括号深度 0、字符串字面量外）SELECT 与其后顶层 FROM 之间的列段。
 * WITH 定义的子查询位于括号内（深度 ≥ 1），因此 CTE 语句命中的正是外层最终 SELECT。
 */
function topLevelSelectList(sql: string): string {
  const scanner = createScanner(sql);
  let selectEnd = -1;
  let fromStart = -1;
  for (let index = 0; index < sql.length; index += 1) {
    const step = scanner.step(index);
    if (step.skip !== undefined) {
      index = step.skip;
      continue;
    }
    if (selectEnd < 0) {
      if (step.depth === 0 && matchWordAt(sql, index, "select")) {
        selectEnd = index + "select".length;
        index = selectEnd - 1;
      }
    } else if (step.depth === 0 && matchWordAt(sql, index, "from")) {
      fromStart = index;
      break;
    }
  }
  if (selectEnd < 0 || fromStart <= selectEnd) return "";
  return sql.slice(selectEnd, fromStart).trim();
}

/** 按顶层逗号切分列段；跳过括号内内容与字符串字面量（含 '' 转义） */
function splitTopLevelItems(list: string): string[] {
  const scanner = createScanner(list);
  const items: string[] = [];
  let current = "";
  for (let index = 0; index < list.length; index += 1) {
    const step = scanner.step(index);
    if (step.skip !== undefined) {
      current += list.slice(index, step.skip + 1);
      index = step.skip;
      continue;
    }
    if (step.depth === 0 && list[index] === ",") {
      items.push(current);
      current = "";
    } else {
      current += list[index];
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

type ScanStep = { skip?: number; depth: number };

/**
 * 创建逐字符扫描器，维护括号深度与字符串字面量状态；返回 skip 时表示
 * 该字符属于字面量或括号边界，调用方应跳到 skip 位置并原样保留字符。
 * 状态随扫描器实例隔离，保证多次解析互不影响。
 */
function createScanner(source: string) {
  let depth = 0;
  let inLiteral = false;
  return {
    step(index: number): ScanStep {
      const char = source[index];
      if (inLiteral) {
        if (char === "'") {
          if (source[index + 1] === "'") return { skip: index + 1, depth };
          inLiteral = false;
        }
        return { skip: index, depth };
      }
      if (char === "'") {
        inLiteral = true;
        return { skip: index, depth };
      }
      if (char === "(") {
        depth += 1;
        return { skip: index, depth };
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1);
        return { skip: index, depth };
      }
      return { depth };
    },
  };
}

function matchWordAt(source: string, index: number, word: string) {
  if (source.slice(index, index + word.length).toLowerCase() !== word)
    return false;
  const before = source[index - 1];
  const after = source[index + word.length];
  const boundary = (char: string | undefined) =>
    char === undefined || !/[A-Za-z0-9_]/.test(char);
  return boundary(before) && boundary(after);
}
