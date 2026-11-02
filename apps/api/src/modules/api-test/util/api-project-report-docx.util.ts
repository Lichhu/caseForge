import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as CFB from "cfb";
import iconv from "iconv-lite";
import JSZip from "jszip";
import type { ProjectRiskAnalysisRow } from "./api-project-report-risk.util";

// xmldom exports its own DOM classes alongside the standard DOM lib types.
// Local aliases keep this deterministic OOXML patching code isolated from that
// declaration-level mismatch while every node still comes from xmldom.
type XmlDocument = any;
type XmlElement = any;

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const TEMPLATE_PATH = join(
  __dirname,
  "../assets/project-interface-test-report.docx",
);
const ZIP_ICON_PATH = join(__dirname, "../assets/project-report-zip-icon.emf");

export interface ProjectReportDocxInput {
  requirementNo: string;
  requirementNoShort: string;
  projectName: string;
  draftName: string;
  reviewerName: string;
  approverName: string;
  overview: string;
  conclusion: string;
  riskRows: ProjectRiskAnalysisRow[];
  zipFileName: string;
  zipBuffer: Buffer;
}

export async function buildProjectReportDocx(input: ProjectReportDocxInput) {
  const [template, zipIcon] = await Promise.all([
    readFile(TEMPLATE_PATH),
    readFile(ZIP_ICON_PATH),
  ]);
  const archive = await JSZip.loadAsync(template);
  const documentPart = archive.file("word/document.xml");
  const olePart = archive.file("word/embeddings/oleObject1.bin");
  if (!documentPart || !olePart) {
    throw new Error("项目类报告模板结构不完整");
  }

  const documentXml = await documentPart.async("string");
  const document = new DOMParser().parseFromString(
    documentXml,
    "application/xml",
  );
  patchDocumentFields(document, input);

  const oleTemplate = await olePart.async("nodebuffer");
  const updatedOle = buildOlePackage(
    oleTemplate,
    input.zipFileName,
    input.zipBuffer,
  );
  archive.file("word/embeddings/oleObject1.bin", updatedOle);
  archive.file("word/media/image2.emf", zipIcon);
  archive.file(
    "word/document.xml",
    new XMLSerializer().serializeToString(document),
  );

  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function patchDocumentFields(
  document: XmlDocument,
  input: ProjectReportDocxInput,
) {
  for (const textNode of elements(document, "t")) {
    if (textNode.textContent === "XQXXXX-XXXX-XX") {
      textNode.textContent = input.requirementNo;
    }
  }

  const tables = elements(document, "tbl");
  if (tables.length < 3) {
    throw new Error("项目类报告模板缺少必要表格");
  }

  const identityTable = tables[0];
  setCellText(
    document,
    identityTable,
    0,
    0,
    `需求点编号：${input.requirementNo}`,
  );
  setCellText(
    document,
    identityTable,
    0,
    1,
    `需求编号：${input.requirementNoShort}`,
  );
  setCellText(document, identityTable, 1, 0, `项目名称：${input.projectName}`);
  setCellText(document, identityTable, 1, 1, `起草人：${input.draftName}`);
  setCellText(document, identityTable, 2, 0, `审核人：${input.reviewerName}`);
  setCellText(document, identityTable, 2, 1, `批准人：${input.approverName}`);

  const revisionTable = tables[1];
  setCellText(document, revisionTable, 1, 1, formatDate(new Date()));
  setCellText(document, revisionTable, 1, 2, input.draftName);
  setCellText(document, revisionTable, 1, 3, input.reviewerName);
  setCellText(document, revisionTable, 1, 4, input.approverName);
  setCellText(document, revisionTable, 1, 5, "文档创建");

  const riskTable = tables[2];
  input.riskRows.forEach((row, index) => {
    setCellText(document, riskTable, index + 1, 2, row.actual, "18");
    setCellText(document, riskTable, index + 1, 3, row.conclusion, "18");
  });

  insertParagraphAfterHeading(document, "接口测试概况", input.overview, false);
  insertParagraphAfterHeading(
    document,
    "接口测试结论",
    input.conclusion,
    false,
  );
  insertZipCaption(document, input.zipFileName);
}

function elements(parent: XmlDocument | XmlElement, localName: string) {
  const list = parent.getElementsByTagNameNS(WORD_NAMESPACE, localName);
  return Array.from({ length: list.length }, (_, index) => list.item(index)!);
}

function directChildren(parent: XmlElement, localName: string) {
  const result: XmlElement[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const node = parent.childNodes.item(index) as XmlElement | null;
    if (node?.nodeType === 1 && node.localName === localName) {
      result.push(node);
    }
  }
  return result;
}

function setCellText(
  document: XmlDocument,
  table: XmlElement,
  rowIndex: number,
  cellIndex: number,
  value: string,
  halfPointSize?: string,
) {
  const row = directChildren(table, "tr")[rowIndex];
  const cell = row ? directChildren(row, "tc")[cellIndex] : undefined;
  const paragraph = cell ? elements(cell, "p")[0] : undefined;
  if (!paragraph) {
    throw new Error(`项目类报告模板缺少表格单元格 ${rowIndex}:${cellIndex}`);
  }
  setParagraphText(document, paragraph, value, halfPointSize);
}

function setParagraphText(
  document: XmlDocument,
  paragraph: XmlElement,
  value: string,
  halfPointSize?: string,
) {
  const paragraphProperties = directChildren(paragraph, "pPr")[0];
  const sourceRun = elements(paragraph, "r")[0];
  const run = sourceRun
    ? (sourceRun.cloneNode(true) as XmlElement)
    : createRun(document, "宋体", "28");
  if (halfPointSize) {
    for (const localName of ["sz", "szCs"]) {
      const size = elements(run, localName)[0];
      if (size) {
        size.setAttributeNS(WORD_NAMESPACE, "w:val", halfPointSize);
      }
    }
  }

  for (let index = run.childNodes.length - 1; index >= 0; index -= 1) {
    const child = run.childNodes.item(index) as XmlElement | null;
    if (!child || child.localName !== "rPr") {
      run.removeChild(child);
    }
  }
  run.appendChild(createTextElement(document, value));

  while (paragraph.firstChild) {
    paragraph.removeChild(paragraph.firstChild);
  }
  if (paragraphProperties) {
    paragraph.appendChild(paragraphProperties);
  }
  paragraph.appendChild(run);
}

function insertParagraphAfterHeading(
  document: XmlDocument,
  headingText: string,
  content: string,
  centered: boolean,
) {
  const body = directChildren(document.documentElement, "body")[0];
  if (!body) {
    throw new Error("项目类报告模板缺少正文");
  }
  const paragraphs = directChildren(body, "p");
  const heading = paragraphs.find((paragraph) =>
    (paragraph.textContent ?? "").replace(/\s+/g, "").includes(headingText),
  );
  if (!heading) {
    throw new Error(`项目类报告模板缺少章节：${headingText}`);
  }

  const paragraph = document.createElementNS(WORD_NAMESPACE, "w:p");
  const paragraphProperties = document.createElementNS(WORD_NAMESPACE, "w:pPr");
  const spacing = document.createElementNS(WORD_NAMESPACE, "w:spacing");
  spacing.setAttributeNS(WORD_NAMESPACE, "w:before", "120");
  spacing.setAttributeNS(WORD_NAMESPACE, "w:after", "180");
  spacing.setAttributeNS(WORD_NAMESPACE, "w:line", "360");
  spacing.setAttributeNS(WORD_NAMESPACE, "w:lineRule", "auto");
  paragraphProperties.appendChild(spacing);
  if (centered) {
    const alignment = document.createElementNS(WORD_NAMESPACE, "w:jc");
    alignment.setAttributeNS(WORD_NAMESPACE, "w:val", "center");
    paragraphProperties.appendChild(alignment);
  }
  paragraph.appendChild(paragraphProperties);
  paragraph.appendChild(createRun(document, "宋体", "21", content));
  body.insertBefore(paragraph, heading.nextSibling);
}

function insertZipCaption(document: XmlDocument, zipFileName: string) {
  const objectElement = elements(document, "object")[0];
  if (!objectElement) {
    throw new Error("项目类报告模板缺少内嵌报告对象");
  }
  let paragraph: XmlElement | null = objectElement;
  while (paragraph && paragraph.localName !== "p") {
    paragraph = paragraph.parentNode as XmlElement | null;
  }
  if (!paragraph?.parentNode) {
    throw new Error("无法定位项目类报告附件区域");
  }

  const caption = document.createElementNS(WORD_NAMESPACE, "w:p");
  const paragraphProperties = document.createElementNS(WORD_NAMESPACE, "w:pPr");
  const alignment = document.createElementNS(WORD_NAMESPACE, "w:jc");
  alignment.setAttributeNS(WORD_NAMESPACE, "w:val", "center");
  paragraphProperties.appendChild(alignment);
  caption.appendChild(paragraphProperties);
  caption.appendChild(createRun(document, "宋体", "18", zipFileName));
  paragraph.parentNode.insertBefore(caption, paragraph.nextSibling);
}

function createRun(
  document: XmlDocument,
  fontFamily: string,
  halfPointSize: string,
  text?: string,
) {
  const run = document.createElementNS(WORD_NAMESPACE, "w:r");
  const runProperties = document.createElementNS(WORD_NAMESPACE, "w:rPr");
  const fonts = document.createElementNS(WORD_NAMESPACE, "w:rFonts");
  fonts.setAttributeNS(WORD_NAMESPACE, "w:hint", "eastAsia");
  fonts.setAttributeNS(WORD_NAMESPACE, "w:ascii", fontFamily);
  fonts.setAttributeNS(WORD_NAMESPACE, "w:hAnsi", fontFamily);
  fonts.setAttributeNS(WORD_NAMESPACE, "w:eastAsia", fontFamily);
  const size = document.createElementNS(WORD_NAMESPACE, "w:sz");
  size.setAttributeNS(WORD_NAMESPACE, "w:val", halfPointSize);
  const sizeCs = document.createElementNS(WORD_NAMESPACE, "w:szCs");
  sizeCs.setAttributeNS(WORD_NAMESPACE, "w:val", halfPointSize);
  runProperties.appendChild(fonts);
  runProperties.appendChild(size);
  runProperties.appendChild(sizeCs);
  run.appendChild(runProperties);
  if (text !== undefined) {
    run.appendChild(createTextElement(document, text));
  }
  return run;
}

function createTextElement(document: XmlDocument, text: string) {
  const textElement = document.createElementNS(WORD_NAMESPACE, "w:t");
  textElement.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve");
  textElement.textContent = text;
  return textElement;
}

function buildOlePackage(
  template: Buffer,
  zipFileName: string,
  zipBuffer: Buffer,
) {
  const container = CFB.read(template, { type: "buffer" });
  const nativeEntry = container.FileIndex.find(
    (entry) => entry.name === "\u0001Ole10Native",
  );
  if (!nativeEntry) {
    throw new Error("项目类报告模板缺少 OLE Package 数据");
  }

  const tempPath = `C:\\Users\\User\\AppData\\Local\\Temp\\${zipFileName}`;
  const sourcePath = `D:/Users/User/Desktop/${zipFileName}`;
  const encodedLabel = iconv.encode(zipFileName, "gbk");
  const encodedSourcePath = iconv.encode(sourcePath, "gbk");
  const encodedTempPath = iconv.encode(tempPath, "gbk");
  const header = Buffer.alloc(6);
  header.writeUInt16LE(2, 4);
  const packageMetadata = Buffer.alloc(8);
  packageMetadata.writeUInt16LE(0, 0);
  packageMetadata.writeUInt16LE(3, 2);
  packageMetadata.writeUInt32LE(encodedTempPath.length + 1, 4);
  const fileSize = Buffer.alloc(4);
  fileSize.writeUInt32LE(zipBuffer.length, 0);
  const native = Buffer.concat([
    header,
    encodedLabel,
    Buffer.from([0]),
    encodedSourcePath,
    Buffer.from([0]),
    packageMetadata,
    encodedTempPath,
    Buffer.from([0]),
    fileSize,
    zipBuffer,
    unicodePackageMetadata(tempPath, zipFileName, sourcePath),
  ]);
  native.writeUInt32LE(native.length - 4, 0);
  nativeEntry.content = native;
  return CFB.write(container, { type: "buffer" }) as Buffer;
}

function unicodePackageMetadata(...values: string[]) {
  return Buffer.concat(
    values.flatMap((value) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(value.length, 0);
      return [length, Buffer.from(value, "utf16le")];
    }),
  );
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
