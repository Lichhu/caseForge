export const API_DOC_SECTION_TITLES = [
  '基础信息',
  '服务信息',
  '技术信息',
  '请求报文',
  '响应报文',
] as const;

export const API_DOC_SECTION_SEPARATOR = '----';

export type ApiDocSectionTitle = (typeof API_DOC_SECTION_TITLES)[number];

export interface ApiDocTableSection {
  title: ApiDocSectionTitle | string;
  rows: string[][];
}

export function parseApiDocTableText(text: string): ApiDocTableSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sectionPattern = API_DOC_SECTION_TITLES.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|');

  const sections: ApiDocTableSection[] = [];
  for (const title of API_DOC_SECTION_TITLES) {
    const pattern = new RegExp(
      `${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n${API_DOC_SECTION_SEPARATOR}\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:${sectionPattern})\\r?\\n${API_DOC_SECTION_SEPARATOR}|$)`,
    );
    const match = trimmed.match(pattern);
    if (!match?.[1]?.trim()) continue;
    const rows = match[1]
      .trim()
      .split('\n')
      .map((line) => line.split('|').map((cell) => cell.trim()));
    sections.push({ title, rows });
  }

  if (sections.length) return sections;

  const lines = trimmed.split('\n').filter(Boolean);
  if (lines.length) {
    return [{ title: '接口文档', rows: lines.map((line) => line.split('|').map((c) => c.trim())) }];
  }
  return [];
}

export function serializeApiDocTableText(sections: ApiDocTableSection[]) {
  return sections
    .map((section) => {
      const lines = section.rows
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => row.join(' | '));
      return [section.title, API_DOC_SECTION_SEPARATOR, ...lines, ''].join('\n');
    })
    .join('\n')
    .trim();
}

function sectionColumnWidth(section: ApiDocTableSection) {
  const header = section.rows[0] ?? [];
  return Math.max(header.length, ...section.rows.slice(1).map((row) => row.length), 1);
}

export function sectionTableHeaders(section: ApiDocTableSection) {
  const header = section.rows[0] ?? [];
  const width = sectionColumnWidth(section);
  return Array.from({ length: width }, (_, index) => header[index] || `列${index + 1}`);
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
  const bodyRows = section.rows.length > 1 ? section.rows.slice(1) : section.rows;
  const width = Math.max(...section.rows.map((row) => row.length), 1);
  return bodyRows.map((row, rowIndex) => {
    const record: Record<string, string> = { key: String(rowIndex) };
    for (let i = 0; i < width; i += 1) {
      record[`col${i}`] = row[i] ?? '';
    }
    return record;
  });
}

export function tableDataToRows(
  section: ApiDocTableSection,
  data: Record<string, string>[],
): string[][] {
  const header = section.rows[0] ?? [];
  const width = Math.max(header.length, ...data.map((row) => Object.keys(row).filter((k) => k.startsWith('col')).length));
  const headerRow = Array.from({ length: width }, (_, i) => header[i] ?? `列${i + 1}`);
  const bodyRows = data.map((record) =>
    Array.from({ length: width }, (_, i) => record[`col${i}`] ?? ''),
  );
  return [headerRow, ...bodyRows];
}
