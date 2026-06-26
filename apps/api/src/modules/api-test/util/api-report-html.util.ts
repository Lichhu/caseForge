import { formatRunItemStatus } from "@common/pdf/pdf-cjk-font.util";

interface HtmlRunItem {
  caseTitle: string;
  status: string;
  durationMs: number;
  requestSnapshot: { url?: unknown };
  responseSnapshot?: { status?: unknown };
  assertions: Array<{
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusClass(status: string) {
  if (status === "passed") return "status-pass";
  if (status === "failed") return "status-fail";
  return "status-error";
}

function formatTime(value?: Date) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function buildApiReportHtml(run: HtmlRunDetail) {
  const passRate =
    run.totalCount > 0
      ? ((run.passedCount / run.totalCount) * 100).toFixed(1)
      : "0";
  const rows = [
    { label: "通过", value: run.passedCount, color: "#16a34a" },
    { label: "失败", value: run.failedCount, color: "#dc2626" },
    { label: "错误", value: run.errorCount, color: "#d97706" },
  ];
  const bars = rows
    .map((row) => {
      const ratio = run.totalCount > 0 ? (row.value / run.totalCount) * 100 : 0;
      const width = row.value > 0 ? Math.max(ratio, 4) : 0;
      return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(row.label)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${row.color}"></div></div>
          <span class="bar-value">${row.value}</span>
        </div>`;
    })
    .join("");

  const tableRows = run.items
    .map((item) => {
      const statusLabel = formatRunItemStatus(item.status);
      const failed = item.assertions.filter((a) => !a.passed);
      const assertionHtml = failed.length
        ? `<ul class="assertion-list">${failed
            .slice(0, 5)
            .map(
              (a) =>
                `<li><strong>${escapeHtml(a.name)}</strong>：期望 ${escapeHtml(JSON.stringify(a.expected))}，实际 ${escapeHtml(JSON.stringify(a.actual))}</li>`,
            )
            .join("")}</ul>`
        : `<span class="assertion-ok">全部通过</span>`;
      return `
        <tr>
          <td>${escapeHtml(item.caseTitle)}</td>
          <td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel)}</span></td>
          <td>${item.durationMs}</td>
          <td class="mono">${escapeHtml(String(item.requestSnapshot.url ?? "—"))}</td>
          <td>${escapeHtml(String(item.responseSnapshot?.status ?? "—"))}</td>
          <td>${assertionHtml}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>接口测试执行报告 - ${escapeHtml(run.id)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 24px 48px;
      background: #f5f6f8;
      color: #101828;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.5;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 28px; }
    .header h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
    .header p { margin: 0; color: #667085; font-size: 13px; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 12px; color: #475467; font-size: 12px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat-card {
      padding: 16px;
      border: 1px solid #eaecf0;
      border-radius: 12px;
      background: #fff;
    }
    .stat-label { display: block; margin-bottom: 6px; color: #667085; font-size: 12px; }
    .stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; }
    .stat-pass .stat-value { color: #16a34a; }
    .stat-fail .stat-value { color: #dc2626; }
    .stat-rate .stat-value { color: #8c1f3d; }
    .panel {
      margin-bottom: 20px;
      padding: 18px 20px;
      border: 1px solid #eaecf0;
      border-radius: 14px;
      background: #fff;
    }
    .panel h2 { margin: 0 0 14px; font-size: 16px; }
    .bar-row { display: grid; grid-template-columns: 48px 1fr 32px; gap: 10px; align-items: center; margin-bottom: 10px; }
    .bar-label { color: #475467; font-size: 13px; }
    .bar-track { height: 14px; border-radius: 999px; background: #f2f4f7; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .bar-value { text-align: right; color: #344054; font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #667085; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
    .status-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-pass { background: #ecfdf3; color: #067647; }
    .status-fail { background: #fef3f2; color: #b42318; }
    .status-error { background: #fffaeb; color: #b54708; }
    .assertion-list { margin: 0; padding-left: 18px; color: #475467; }
    .assertion-ok { color: #16a34a; }
    .footer { margin-top: 24px; text-align: center; color: #98a2b3; font-size: 12px; }
    @media (max-width: 768px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table { display: block; overflow-x: auto; white-space: nowrap; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>接口测试执行报告</h1>
      <p>CaseForge 自动生成</p>
      <div class="meta">
        <span>批次 ID：${escapeHtml(run.id)}</span>
        <span>并发：${run.concurrency}</span>
        <span>开始：${escapeHtml(formatTime(run.createdAt))}</span>
        <span>结束：${escapeHtml(formatTime(run.finishedAt))}</span>
      </div>
    </header>

    <section class="stats">
      <div class="stat-card"><span class="stat-label">总数</span><span class="stat-value">${run.totalCount}</span></div>
      <div class="stat-card stat-pass"><span class="stat-label">通过</span><span class="stat-value">${run.passedCount}</span></div>
      <div class="stat-card stat-fail"><span class="stat-label">失败</span><span class="stat-value">${run.failedCount}</span></div>
      <div class="stat-card stat-rate"><span class="stat-label">通过率</span><span class="stat-value">${passRate}%</span></div>
    </section>

    <section class="panel">
      <h2>结果分布</h2>
      ${bars}
    </section>

    <section class="panel">
      <h2>案例明细</h2>
      <table>
        <thead>
          <tr>
            <th>案例</th>
            <th>状态</th>
            <th>耗时(ms)</th>
            <th>请求</th>
            <th>HTTP</th>
            <th>断言摘要</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>

    <footer class="footer">导出时间：${escapeHtml(formatTime(new Date()))}</footer>
  </div>
</body>
</html>`;
}
