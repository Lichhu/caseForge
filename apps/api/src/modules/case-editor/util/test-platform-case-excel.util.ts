/**
 * 基于测管平台 Excel 模板填充案例数据后导出。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CaseExcelRow } from "@case-forge/shared";
import ExcelJS from "exceljs";

const DATA_START_ROW = 7;
const TEMPLATE_FILE = "test-case-export-template.xlsx";

/** apps/api 根目录（兼容 src 直跑与 dist 编译产物） */
function getApiRoot() {
  return resolve(__dirname, "../../../..");
}

function resolveTemplatePath() {
  const apiRoot = getApiRoot();
  const candidates = [
    join(__dirname, "../assets", TEMPLATE_FILE),
    join(apiRoot, "src/modules/case-editor/assets", TEMPLATE_FILE),
    join(apiRoot, "dist/modules/case-editor/assets", TEMPLATE_FILE),
    join(apiRoot, "../../doc/example.xlsx"),
    join(process.cwd(), "doc/example.xlsx"),
    join(process.cwd(), "../doc/example.xlsx"),
  ];
  const matched = candidates.find((path) => existsSync(path));
  if (!matched) {
    throw new Error(
      `未找到测试案例导出模板：${TEMPLATE_FILE}（已尝试：${candidates.join(" | ")}）`,
    );
  }
  return matched;
}

function mapCaseNatureName(caseNature: string) {
  return /反/.test(caseNature) ? "反" : "正";
}

function mapRowToTemplateValues(row: CaseExcelRow, serial: number) {
  return [
    serial,
    row.requirement,
    row.caseName,
    mapCaseNatureName(row.caseNature),
    "SIT",
    row.priority,
    "",
    "",
    row.caseTitle,
    row.caseCondition,
    row.caseStep,
    row.caseExpected,
    "",
    "",
    "",
    "否",
    "",
  ];
}

function fillDataRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  values: Array<string | number>,
) {
  const excelRow = sheet.getRow(rowIndex);
  values.forEach((value, colIndex) => {
    excelRow.getCell(colIndex + 1).value = value;
  });
}

/** 返回空白测管 Excel 模板文件 */
export function readTestPlatformCaseExcelTemplate(): Buffer {
  return readFileSync(resolveTemplatePath());
}

/** 读取模板并在第 7 行起写入案例数据，返回 xlsx Buffer */
export async function buildTestPlatformCaseExcel(
  rows: CaseExcelRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolveTemplatePath());
  const sheet =
    workbook.getWorksheet("测试案例") ?? workbook.worksheets[0];
  if (!sheet) {
    throw new Error("测试案例导出模板缺少工作表");
  }

  if (rows.length > 1) {
    sheet.duplicateRow(DATA_START_ROW, rows.length - 1, true);
  }

  rows.forEach((row, index) => {
    fillDataRow(
      sheet,
      DATA_START_ROW + index,
      mapRowToTemplateValues(row, index + 1),
    );
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
