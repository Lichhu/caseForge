import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";

type PdfDocument = InstanceType<typeof PDFDocument>;

const PDF_FONT_NAME = "CaseForgeCjk";

interface FontCandidate {
  path: string;
  postscriptName?: string;
}

function bundledFontCandidates(): FontCandidate[] {
  const roots = [
    join(__dirname, "../../assets/fonts"),
    join(__dirname, "../../../assets/fonts"),
    join(process.cwd(), "apps/api/src/assets/fonts"),
    join(process.cwd(), "src/assets/fonts"),
  ];
  const names = [
    "NotoSansSC-Regular.otf",
    "NotoSansSC-Regular.ttf",
    "SourceHanSansSC-Regular.otf",
  ];
  const candidates: FontCandidate[] = [];
  for (const root of roots) {
    for (const name of names) {
      candidates.push({ path: join(root, name) });
    }
  }
  return candidates;
}

function systemFontCandidates(): FontCandidate[] {
  return [
    {
      path: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    },
    {
      path: "/Library/Fonts/Arial Unicode.ttf",
    },
    {
      path: "/System/Library/Fonts/PingFang.ttc",
      postscriptName: "PingFangSC-Regular",
    },
    {
      path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      postscriptName: "NotoSansCJKsc-Regular",
    },
    {
      path: "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
      postscriptName: "WenQuanYi Micro Hei",
    },
    {
      path: "C:\\Windows\\Fonts\\msyh.ttc",
      postscriptName: "MicrosoftYaHei",
    },
    {
      path: "C:\\Windows\\Fonts\\simhei.ttf",
    },
  ];
}

function resolveFontCandidate(): FontCandidate | null {
  const envPath = process.env.PDF_CJK_FONT_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    return { path: envPath };
  }
  for (const candidate of [...bundledFontCandidates(), ...systemFontCandidates()]) {
    if (existsSync(candidate.path)) {
      return candidate;
    }
  }
  return null;
}

/** 为 PDFDocument 注册并启用支持中文的字体 */
export function applyPdfCjkFont(doc: PdfDocument): void {
  const candidate = resolveFontCandidate();
  if (!candidate) {
    throw new Error(
      "未找到可用的中文字体。请设置 PDF_CJK_FONT_PATH，或在 apps/api/src/assets/fonts 放置 NotoSansSC-Regular.otf",
    );
  }
  if (candidate.postscriptName) {
    doc.registerFont(PDF_FONT_NAME, candidate.path, candidate.postscriptName);
  } else {
    doc.registerFont(PDF_FONT_NAME, candidate.path);
  }
  doc.font(PDF_FONT_NAME);
}

export function formatRunItemStatus(status: string) {
  if (status === "passed") return "通过";
  if (status === "failed") return "失败";
  if (status === "error") return "错误";
  return status;
}
