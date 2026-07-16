export const API_DOC_SECTION_TITLES = [
  "基础信息",
  "服务信息",
  "请求报文",
  "示例报文",
] as const;

/** 历史文档分区，仅用于解析边界，不在编辑器展示 */
export const API_DOC_LEGACY_SECTION_TITLES = ["技术信息", "响应报文"] as const;

export const API_DOC_SECTION_BOUNDARY_TITLES = [
  ...API_DOC_SECTION_TITLES,
  ...API_DOC_LEGACY_SECTION_TITLES,
] as const;

export const API_DOC_SECTION_SEPARATOR = "----";

export type ApiDocSectionTitle = (typeof API_DOC_SECTION_TITLES)[number];

export interface ApiDocTableSection {
  title: ApiDocSectionTitle | string;
  rows: string[][];
  freeText?: string;
}

export function parseApiDocTableText(text: string): ApiDocTableSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sectionPattern = API_DOC_SECTION_BOUNDARY_TITLES.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");

  const sections: ApiDocTableSection[] = [];
  for (const title of API_DOC_SECTION_TITLES) {
    const pattern = new RegExp(
      `${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n${API_DOC_SECTION_SEPARATOR}\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:${sectionPattern})\\r?\\n${API_DOC_SECTION_SEPARATOR}|$)`,
    );
    const match = trimmed.match(pattern);
    if (title === "示例报文") {
      if (!match) continue;
      sections.push({ title, rows: [], freeText: match[1] ?? "" });
      continue;
    }
    if (!match?.[1]?.trim()) continue;
    const sectionText = match[1].trim();
    let rows = sectionText
      .split("\n")
      .map((line) => line.split("|").map((cell) => cell.trim()));
    rows = normalizeVisibleSection(title, rows, sections);
    sections.push({ title, rows });
  }

  if (sections.length) return sections;

  const lines = trimmed.split("\n").filter(Boolean);
  if (lines.length) {
    return [
      {
        title: "接口文档",
        rows: lines.map((line) => line.split("|").map((c) => c.trim())),
      },
    ];
  }
  return [];
}

function normalizeVisibleSection(
  title: string,
  rows: string[][],
  parsed: ApiDocTableSection[],
) {
  if (title === "请求报文") return rows;
  if (title !== "基础信息" && title !== "服务信息") return rows;

  const valueMap = new Map(
    rows
      .filter((row) => !(row[0]?.trim() === "服务属性" && row[1]?.trim() === "属性值"))
      .map((row) => [row[0]?.trim(), row[1]?.trim() ?? ""]),
  );
  const basicRows = parsed.find((section) => section.title === "基础信息")?.rows ?? [];
  const basicValues = new Map(
    basicRows
      .filter((row) => !(row[0]?.trim() === "服务属性" && row[1]?.trim() === "属性值"))
      .map((row) => [row[0]?.trim(), row[1]?.trim() ?? ""]),
  );
  const keys = title === "基础信息"
    ? ["服务编码", "原服务交易码", "服务名称", "服务属性"]
    : ["功能描述", "业务规则", "服务名称", "服务属性"];
  const result: string[][] = [];
  for (const key of keys) {
    if (key === "服务名称") {
      const value = valueMap.get(key) || valueMap.get("服务名称(中)") || basicValues.get("服务名称(中)") || basicValues.get("服务名称");
      if (value !== undefined) result.push(["服务名称", value]);
      continue;
    }
    if (key === "服务属性" && title === "服务信息") {
      const value = valueMap.get(key) || basicValues.get(key);
      if (value !== undefined) result.push([key, value]);
      continue;
    }
    if (valueMap.has(key)) result.push([key, valueMap.get(key) ?? ""]);
  }
  const deduped = new Map<string, string[]>();
  for (const row of result) deduped.set(row[0], row);
  return [["服务属性", "属性值"], ...deduped.values()];
}

export function serializeApiDocTableText(sections: ApiDocTableSection[]) {
  return sections
    .map((section) => {
      if (section.title === "示例报文") {
        return [
          section.title,
          API_DOC_SECTION_SEPARATOR,
          section.freeText ?? "",
          "",
        ].join("\n");
      }
      const lines = section.rows
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => row.join(" | "));
      return [section.title, API_DOC_SECTION_SEPARATOR, ...lines, ""].join(
        "\n",
      );
    })
    .join("\n")
    .trim();
}

function sectionColumnWidth(section: ApiDocTableSection) {
  const header = section.rows[0] ?? [];
  return Math.max(
    header.length,
    ...section.rows.slice(1).map((row) => row.length),
    1,
  );
}

export function sectionTableHeaders(section: ApiDocTableSection) {
  const header = section.rows[0] ?? [];
  const width = sectionColumnWidth(section);
  return Array.from(
    { length: width },
    (_, index) => header[index] || `列${index + 1}`,
  );
}

export function sectionTableColumnKeys(section: ApiDocTableSection) {
  const width = sectionColumnWidth(section);
  return Array.from({ length: width }, (_, index) => `col${index}`);
}

/** @deprecated 接口文档编辑器已改用原生 table，保留供其他调用方使用 */
export function sectionTableColumns(section: ApiDocTableSection) {
  return sectionTableHeaders(section).map((title, index) => ({
    title,
    dataIndex: `col${index}`,
    key: `col${index}`,
    ellipsis: true,
  }));
}

export function sectionTableData(section: ApiDocTableSection) {
  const bodyRows =
    section.rows.length > 1 ? section.rows.slice(1) : section.rows;
  const width = Math.max(...section.rows.map((row) => row.length), 1);
  return bodyRows.map((row, rowIndex) => {
    const record: Record<string, string> = { key: String(rowIndex) };
    for (let i = 0; i < width; i += 1) {
      record[`col${i}`] = row[i] ?? "";
    }
    return record;
  });
}

export function tableDataToRows(
  section: ApiDocTableSection,
  data: Record<string, string>[],
): string[][] {
  const header = section.rows[0] ?? [];
  const width = Math.max(
    header.length,
    ...data.map(
      (row) => Object.keys(row).filter((k) => k.startsWith("col")).length,
    ),
  );
  const headerRow = Array.from(
    { length: width },
    (_, i) => header[i] ?? `列${i + 1}`,
  );
  const bodyRows = data.map((record) =>
    Array.from({ length: width }, (_, i) => record[`col${i}`] ?? ""),
  );
  return [headerRow, ...bodyRows];
}
