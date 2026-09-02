/**
 * 解析数据函数查询 SQL 的 SELECT 列名，供插入函数时「结果字段」下拉使用。
 * 支持别名（AS alias）与表名前缀列；SELECT * 或无法解析时返回空数组，
 * 此时下拉退化为手动输入。
 */
export function parseSqlSelectColumns(sql: string): string[] {
  const flattened = sql.replace(/\s+/g, " ").trim();
  const match = flattened.match(/^select\s+(.+?)\s+from\s/i);
  if (!match) return [];
  const list = match[1].trim();
  if (!list || list === "*") return [];
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  const columns: string[] = [];
  for (const item of items) {
    const alias = item.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
    const raw = alias ? alias[1] : (item.trim().split(".").pop() ?? "");
    const name = raw.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !columns.includes(name))
      columns.push(name);
  }
  return columns;
}
