/**
 * @file 接口质量测试报告 HTML 模板（参考行内标准报告样式）
 */

export interface ReportAssertionMeta {
  type: string;
  operator: string;
  expression: string;
}

export interface ReportCaseMeta {
  caseNo?: string;
  transactionCode?: string;
  description?: string;
  /** 断言名称 -> 断言定义（类型/比较符/表达式） */
  assertionMeta: Record<string, ReportAssertionMeta>;
}

export interface ApiReportContext {
  /** 报告编号（默认取项目 ID） */
  reportCode: string;
  /** 测试集名称 */
  setName: string;
  /** 测试环境名称 */
  envName: string;
  /** 总交易数（去重交易码数量） */
  transactionCount: number;
  /** caseId -> 案例补充信息 */
  caseMeta: Record<string, ReportCaseMeta>;
}

interface HtmlRunItem {
  caseId: string;
  caseTitle: string;
  status: string;
  durationMs: number;
  requestSnapshot: Record<string, unknown>;
  responseSnapshot?: {
    status?: unknown;
    body?: unknown;
    error?: string;
  };
  assertions: Array<{
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
    message?: string;
  }>;
}

interface HtmlRunDetail {
  id: string;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  concurrency: number;
  createdAt?: Date;
  finishedAt?: Date;
  items: HtmlRunItem[];
}

const PASS_COLOR = "green";
const FAIL_COLOR = "#c9061f";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resultLabel(status: string) {
  if (status === "passed") return "Pass";
  if (status === "failed") return "Fail";
  return "Error";
}

function resultColor(status: string) {
  return status === "passed" ? PASS_COLOR : FAIL_COLOR;
}

function formatDateTime(value?: Date) {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatBannerDate(value?: Date) {
  const d = value ? new Date(value) : new Date();
  const text = d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const suffix =
    abs % 60 === 0
      ? `GMT${sign}${hh}:00`
      : `GMT${sign}${hh}:${String(abs % 60).padStart(2, "0")}`;
  return `${text} ${suffix}`;
}

function formatElapsed(createdAt?: Date, finishedAt?: Date) {
  if (!createdAt || !finishedAt) return "—";
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(finishedAt).getTime() - new Date(createdAt).getTime()) / 1000,
    ),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function prettyPayload(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 4);
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 4);
  } catch {
    return String(value);
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function requestUrl(snapshot: Record<string, unknown>): string {
  const url = snapshot.url ?? snapshot.target ?? "";
  return String(url || "—");
}

function requestMethodLabel(snapshot: Record<string, unknown>): string {
  const transport = String(snapshot.transport ?? "http").toLowerCase();
  if (transport === "tcp") return "TCP请求";
  const method = String(snapshot.method ?? "POST").toUpperCase();
  return `${method}请求`;
}

/** 案例分块头部（表头 + 数据行） */
function buildCaseHeaderRow(
  index: number,
  item: HtmlRunItem,
  meta: ReportCaseMeta | undefined,
) {
  const color = resultColor(item.status);
  const header = `
    <div class="testcase-tr testcase-head">
      <div style="width:5%;">#</div>
      <div style="width:15%;">案例编号</div>
      <div style="width:10%;">交易码</div>
      <div style="width:19%;">案例名称</div>
      <div style="width:16%;">数据描述</div>
      <div style="width:10%;">返回码</div>
      <div style="width:10%;">返回信息</div>
      <div style="width:8%;color:${color};">结果</div>
      <div style="width:7%;">耗时</div>
    </div>`;
  const httpStatus = item.responseSnapshot?.status;
  const returnMessage = item.responseSnapshot?.error ?? "";
  const row = `
    <div class="testcase-tr">
      <div style="width:5%;">${index}</div>
      <div style="width:15%;">${escapeHtml(meta?.caseNo || "—")}</div>
      <div style="width:10%;">${escapeHtml(meta?.transactionCode || "—")}</div>
      <div style="width:19%;">${escapeHtml(item.caseTitle)}</div>
      <div style="width:16%;">${escapeHtml(meta?.description || "")}</div>
      <div style="width:10%;">${escapeHtml(httpStatus ?? "")}</div>
      <div style="width:10%;">${escapeHtml(returnMessage)}</div>
      <div style="width:8%;color:${color};">${resultLabel(item.status)}</div>
      <div style="width:7%;">${item.durationMs}ms</div>
    </div>`;
  return header + row;
}

/** 请求 / 响应报文区块 */
function buildPayloadSection(item: HtmlRunItem) {
  const requestBody = prettyPayload(item.requestSnapshot?.body);
  const responseBody = prettyPayload(item.responseSnapshot?.body);
  const sections: string[] = [];
  sections.push(
    `<div class="step-bar">步骤1：${escapeHtml(requestMethodLabel(item.requestSnapshot))}</div>`,
  );
  sections.push(
    `<div class="step-bar step-bar--url">请求地址：${escapeHtml(requestUrl(item.requestSnapshot))}</div>`,
  );
  sections.push(`<div class="step-bar">请求报文</div>`);
  sections.push(
    `<pre class="payload"><code>${escapeHtml(requestBody || "（无请求报文）")}</code></pre>`,
  );
  sections.push(`<div class="step-bar">响应报文</div>`);
  sections.push(
    `<pre class="payload"><code>${escapeHtml(responseBody || "（无响应报文）")}</code></pre>`,
  );
  return sections.join("\n");
}

/** 断言检查表 */
function buildAssertionSection(
  item: HtmlRunItem,
  meta: ReportCaseMeta | undefined,
) {
  if (!item.assertions.length) return "";
  const header = `
    <div class="step-bar">断言检查</div>
    <div class="testcase-tr testcase-head assertion-tr">
      <div style="width:6%;">#</div>
      <div style="width:18%;">描述</div>
      <div style="width:10%;">类型</div>
      <div style="width:8%;">比较符</div>
      <div style="width:28%;">表达式</div>
      <div style="width:18%;">比较值</div>
      <div style="width:12%;">结果</div>
    </div>`;
  const rows = item.assertions
    .map((assertion, idx) => {
      const def = meta?.assertionMeta[assertion.name];
      const color = assertion.passed ? PASS_COLOR : FAIL_COLOR;
      return `
    <div class="testcase-tr assertion-tr">
      <div style="width:6%;">${idx + 1}</div>
      <div style="width:18%;">${escapeHtml(assertion.name)}</div>
      <div style="width:10%;">${escapeHtml(def?.type ?? "—")}</div>
      <div style="width:8%;">${escapeHtml(def?.operator ?? "eq")}</div>
      <div style="width:28%;" class="mono">${escapeHtml(def?.expression ?? "—")}</div>
      <div style="width:18%;" class="mono">${escapeHtml(stringifyValue(assertion.expected))}</div>
      <div style="width:12%;color:${color};">${assertion.passed ? "Pass" : "Fail"}</div>
    </div>`;
    })
    .join("");
  return header + rows;
}

export function buildApiReportHtml(
  run: HtmlRunDetail,
  context?: Partial<ApiReportContext>,
) {
  const reportCode = context?.reportCode ?? run.id.slice(0, 8).toUpperCase();
  const setName = context?.setName ?? "—";
  const envName = context?.envName ?? "—";
  const transactionCount = context?.transactionCount ?? 0;
  const caseMeta = context?.caseMeta ?? {};
  const passRate =
    run.totalCount > 0
      ? ((run.passedCount / run.totalCount) * 100).toFixed(2)
      : "0.00";
  const failedCount = run.failedCount + run.errorCount;
  const allPassed = failedCount === 0 && run.totalCount > 0;

  const outline = run.items
    .map((item, idx) => {
      const color = resultColor(item.status);
      return `<li style="color:${color};"><a href="#case-${idx + 1}">${idx + 1}.${escapeHtml(item.caseTitle)}</a></li>`;
    })
    .join("\n");

  const caseBlocks = run.items
    .map((item, idx) => {
      const meta = caseMeta[item.caseId];
      return `
  <div class="testcase" id="case-${idx + 1}">
    ${buildCaseHeaderRow(idx + 1, item, meta)}
    <div class="testcase-detail">
      ${buildPayloadSection(item)}
      ${buildAssertionSection(item, meta)}
    </div>
  </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>接口质量测试报告 - ${escapeHtml(setName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f0f1f3;
      color: #21252b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }
    a { color: inherit; text-decoration: none; }
    .outline {
      max-width: 1080px;
      margin: 0 auto;
      padding: 20px 24px 4px;
      background: #fff;
    }
    .outline h3 { margin: 0 0 8px; font-size: 15px; }
    .outline ul { margin: 0; padding-left: 22px; }
    .outline li { margin: 2px 0; font-size: 13px; }
    .main {
      max-width: 1080px;
      margin: 0 auto 32px;
      background: #fff;
    }
    .top-bar { height: 4px; background: #ae0a29; }
    .banner {
      display: flex;
      align-items: center;
      gap: 4%;
      padding: 12px 24px;
      border-bottom: 1px solid #eaecf0;
    }
    .banner .title { font-weight: bold; font-size: 15px; }
    .banner .confidential { margin-left: auto; font-weight: bolder; font-size: 15px; }
    .banner .date { font-size: 13px; color: #475467; }
    .report-head { padding: 16px 24px 0; }
    .report-head .project { font-size: 20px; color: #246a97; font-weight: bold; }
    .report-head .set-name { font-size: 12px; font-weight: bold; margin-top: 4px; }
    .summary { padding: 10px 24px 20px; }
    .summary table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .summary th, .summary td {
      padding: 8px 10px;
      border: 1px solid #e3e3e3;
      text-align: center;
    }
    .summary th { background: #f8f8f9; color: #6d7585; }
    .bannerinfo {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 0 24px;
      padding: 8px 16px;
      color: #fff;
      font-weight: bold;
      background-color: ${allPassed ? "green" : FAIL_COLOR};
    }
    .bannerinfo .fail-count {
      position: absolute;
      right: 30px;
      text-decoration: underline;
      text-underline-offset: 4px;
    }
    .cases { padding: 20px 4px 8px; }
    .testcase { margin: 0 20px 30px; border: 1px solid gray; }
    .testcase-tr {
      display: flex;
      align-items: center;
      min-height: 34px;
      padding: 4px 6px;
      font-size: 13px;
      border-bottom: 1px solid #ececec;
    }
    .testcase-tr > div { padding: 0 4px; word-break: break-all; }
    .testcase-head {
      background-color: #f8f8f9;
      color: #6d7585;
      font-weight: bolder;
    }
    .assertion-tr { color: #6d7585; }
    .testcase-detail { border-top: 1px solid #dcdcdc; }
    .step-bar {
      display: flex;
      align-items: center;
      min-height: 30px;
      padding: 4px 10px;
      font-size: 14px;
      background-color: #e3e3e3;
      color: #000;
      font-weight: bolder;
    }
    .step-bar--url { text-decoration: underline; }
    .payload {
      width: 100%;
      margin: 0;
      padding: 10px;
      color: #212121;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    @media print {
      body { background: #fff; }
      .testcase { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="outline">
    <h3>案例大纲</h3>
    <ul>
${outline}
    </ul>
  </div>
  <div class="main">
    <div class="top-bar"></div>
    <div class="banner">
      <span class="title">接口质量测试报告</span>
      <span class="confidential">Confidential</span>
      <span class="date">${escapeHtml(formatBannerDate(run.finishedAt ?? run.createdAt))}</span>
    </div>
    <div class="report-head">
      <div class="project">${escapeHtml(reportCode)}</div>
      <div class="set-name">${escapeHtml(setName)}</div>
    </div>
    <div class="summary">
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>测试集</th>
            <th>测试环境</th>
            <th>总交易数</th>
            <th>总案例数</th>
            <th>通过率(%)</th>
            <th>执行时间</th>
            <th>耗时</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(reportCode)}</td>
            <td>${escapeHtml(setName)}</td>
            <td>${escapeHtml(envName)}</td>
            <td>${transactionCount}</td>
            <td>${run.totalCount}</td>
            <td>${passRate}%</td>
            <td>${escapeHtml(formatDateTime(run.createdAt))}</td>
            <td>${escapeHtml(formatElapsed(run.createdAt, run.finishedAt))}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="bannerinfo">
      <span>执行结果</span>
      <span>${allPassed ? "通过" : "失败"}</span>
      <span class="fail-count">失败案例数：${failedCount}</span>
    </div>
    <div class="cases">
${caseBlocks}
    </div>
  </div>
</body>
</html>`;
}
