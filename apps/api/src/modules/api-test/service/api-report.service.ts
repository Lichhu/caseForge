import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { In, Repository } from "typeorm";
import {
  applyPdfCjkFont,
  formatRunItemStatus,
} from "@common/pdf/pdf-cjk-font.util";
import { buildApiReportHtml } from "@api-test/util/api-report-html.util";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { ApiExecutionService } from "./api-execution.service";

type RunDetail = Awaited<ReturnType<ApiExecutionService["getRunDetail"]>>;

@Injectable()
export class ApiReportService {
  constructor(
    private readonly executionService: ApiExecutionService,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
  ) {}

  async summary(projectId: string, runId?: string, transactionId?: string) {
    if (runId) {
      let run = await this.executionService.getRunDetail(projectId, runId);
      if (transactionId) {
        run = await this.filterRunByTransaction(projectId, transactionId, run);
      }
      return {
        runId: run.id,
        total: run.totalCount,
        passed: run.passedCount,
        failed: run.failedCount,
        error: run.errorCount,
        passRate:
          run.totalCount > 0
            ? Math.round((run.passedCount / run.totalCount) * 1000) / 10
            : 0,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
        byStatus: [
          { name: "通过", value: run.passedCount, key: "passed" },
          { name: "失败", value: run.failedCount, key: "failed" },
          { name: "错误", value: run.errorCount, key: "error" },
        ],
      };
    }
    const runs = await this.executionService.listRuns(projectId);
    const recent = runs.slice(0, 10);
    return {
      recentRuns: recent.map((run) => ({
        id: run.id,
        total: run.totalCount,
        passed: run.passedCount,
        failed: run.failedCount,
        error: run.errorCount,
        passRate:
          run.totalCount > 0
            ? Math.round((run.passedCount / run.totalCount) * 1000) / 10
            : 0,
        createdAt: run.createdAt,
      })),
    };
  }

  async exportReport(
    projectId: string,
    runId: string,
    format: "xlsx" | "pdf" | "html",
    transactionId?: string,
  ): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    let run = await this.executionService.getRunDetail(projectId, runId);
    if (transactionId) {
      run = await this.filterRunByTransaction(projectId, transactionId, run);
    }
    if (!run.items?.length) {
      throw new NotFoundException("执行记录无明细，无法导出");
    }
    if (format === "xlsx") {
      return {
        buffer: await this.toExcel(run),
        fileName: `api-test-run-${runId}.xlsx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }
    if (format === "html") {
      const html = buildApiReportHtml(run);
      return {
        buffer: Buffer.from(html, "utf-8"),
        fileName: `api-test-run-${runId}.html`,
        contentType: "text/html; charset=utf-8",
      };
    }
    if (format === "pdf") {
      return {
        buffer: await this.toPdf(run),
        fileName: `api-test-run-${runId}.pdf`,
        contentType: "application/pdf",
      };
    }
    throw new BadRequestException(`不支持的导出格式: ${format}`);
  }

  private async filterRunByTransaction(
    projectId: string,
    transactionId: string,
    run: RunDetail,
  ) {
    const endpoints = await this.endpointRepo.find({
      where: { projectId, transactionId },
      select: ["id"],
    });
    const endpointIds = endpoints.map((item) => item.id);
    if (!endpointIds.length) {
      return {
        ...run,
        items: [],
        totalCount: 0,
        passedCount: 0,
        failedCount: 0,
        errorCount: 0,
      };
    }
    const cases = await this.caseRepo.find({
      where: { projectId, endpointId: In(endpointIds) },
      select: ["id"],
    });
    const caseIds = new Set(cases.map((item) => item.id));
    const items = (run.items ?? []).filter((item) => caseIds.has(item.caseId));
    const passedCount = items.filter((item) => item.status === "passed").length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const errorCount = items.filter((item) => item.status === "error").length;
    return {
      ...run,
      items,
      totalCount: items.length,
      passedCount,
      failedCount,
      errorCount,
    };
  }

  private async toExcel(run: RunDetail) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CaseForge";
    const summary = workbook.addWorksheet("汇总");
    summary.addRow(["执行批次", run.id]);
    summary.addRow(["总数", run.totalCount]);
    summary.addRow(["通过", run.passedCount]);
    summary.addRow(["失败", run.failedCount]);
    summary.addRow(["错误", run.errorCount]);
    summary.addRow(["并发数", run.concurrency]);
    summary.addRow(["开始时间", run.createdAt?.toISOString() ?? ""]);
    summary.addRow(["结束时间", run.finishedAt?.toISOString() ?? ""]);

    const sheet = workbook.addWorksheet("明细");
    sheet.columns = [
      { header: "案例", key: "title", width: 28 },
      { header: "状态", key: "status", width: 12 },
      { header: "耗时(ms)", key: "duration", width: 12 },
      { header: "URL", key: "url", width: 40 },
      { header: "HTTP", key: "http", width: 8 },
      { header: "断言摘要", key: "assertions", width: 48 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const item of run.items) {
      const failedAssertions = item.assertions.filter((a) => !a.passed);
      sheet.addRow({
        title: item.caseTitle,
        status: formatRunItemStatus(item.status),
        duration: item.durationMs,
        url: String(item.requestSnapshot.url ?? ""),
        http: item.responseSnapshot?.status ?? "",
        assertions: failedAssertions.length
          ? failedAssertions.map((a) => a.name).join("; ")
          : "全部通过",
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async toPdf(run: RunDetail) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        applyPdfCjkFont(doc);
      } catch (error) {
        reject(error);
        return;
      }

      const passRate =
        run.totalCount > 0
          ? ((run.passedCount / run.totalCount) * 100).toFixed(1)
          : "0";
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.fontSize(20).text("接口测试执行报告", { align: "center" });
      doc.moveDown(0.8);
      doc.fontSize(11).fillColor("#475467");
      doc.text(`批次 ID：${run.id}`, { align: "center" });
      doc.moveDown(1.2);

      this.drawPdfSummaryCards(doc, pageWidth, run, passRate);
      doc.moveDown(1.2);
      this.drawPdfStatusBars(doc, pageWidth, run);
      doc.moveDown(1.2);

      doc.fillColor("#101828").fontSize(13).text("案例明细", { underline: true });
      doc.moveDown(0.6);
      doc.fontSize(10);
      for (const item of run.items) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
          doc.addPage();
          applyPdfCjkFont(doc);
          doc.fontSize(10);
        }
        const statusLabel = formatRunItemStatus(item.status);
        const statusColor =
          item.status === "passed"
            ? "#16a34a"
            : item.status === "failed"
              ? "#dc2626"
              : "#d97706";
        doc.fillColor("#101828").text(`• ${item.caseTitle}`, { continued: true });
        doc.fillColor(statusColor).text(`  [${statusLabel}]  ${item.durationMs}ms`);
        doc.fillColor("#667085").fontSize(9).text(
          `  请求：${String(item.requestSnapshot.url ?? "—")}`,
        );
        if (item.status !== "passed") {
          const failed = item.assertions.filter((a) => !a.passed);
          for (const assertion of failed.slice(0, 3)) {
            doc.text(
              `  - ${assertion.name}：期望 ${JSON.stringify(assertion.expected)}，实际 ${JSON.stringify(assertion.actual)}`,
            );
          }
        }
        doc.fontSize(10).fillColor("#101828");
        doc.moveDown(0.4);
      }

      doc.end();
    });
  }

  private drawPdfSummaryCards(
    doc: InstanceType<typeof PDFDocument>,
    pageWidth: number,
    run: RunDetail,
    passRate: string,
  ) {
    const gap = 10;
    const cardWidth = (pageWidth - gap * 3) / 4;
    const cardHeight = 52;
    const startX = doc.page.margins.left;
    const startY = doc.y;
    const cards = [
      { label: "总数", value: String(run.totalCount), color: "#344054" },
      { label: "通过", value: String(run.passedCount), color: "#16a34a" },
      { label: "失败", value: String(run.failedCount), color: "#dc2626" },
      { label: "通过率", value: `${passRate}%`, color: "#8c1f3d" },
    ];
    cards.forEach((card, index) => {
      const x = startX + index * (cardWidth + gap);
      doc.roundedRect(x, startY, cardWidth, cardHeight, 6).fillAndStroke("#f9fafb", "#eaecf0");
      doc.fillColor("#667085").fontSize(9).text(card.label, x + 10, startY + 10, {
        width: cardWidth - 20,
      });
      doc.fillColor(card.color).fontSize(16).text(card.value, x + 10, startY + 26, {
        width: cardWidth - 20,
      });
    });
    doc.y = startY + cardHeight;
  }

  private drawPdfStatusBars(
    doc: InstanceType<typeof PDFDocument>,
    pageWidth: number,
    run: RunDetail,
  ) {
    const rows = [
      { label: "通过", value: run.passedCount, color: "#16a34a" },
      { label: "失败", value: run.failedCount, color: "#dc2626" },
      { label: "错误", value: run.errorCount, color: "#d97706" },
    ];
    const labelWidth = 48;
    const barMaxWidth = pageWidth - labelWidth - 56;
    const barHeight = 14;
    doc.fontSize(11).fillColor("#101828").text("结果分布", { underline: true });
    doc.moveDown(0.5);
    for (const row of rows) {
      const y = doc.y;
      doc.fillColor("#475467").fontSize(10).text(row.label, doc.page.margins.left, y, {
        width: labelWidth,
      });
      const ratio = run.totalCount > 0 ? row.value / run.totalCount : 0;
      const barWidth = Math.max(ratio > 0 ? 8 : 0, barMaxWidth * ratio);
      const barX = doc.page.margins.left + labelWidth;
      doc.roundedRect(barX, y + 1, barMaxWidth, barHeight, 3).fill("#f2f4f7");
      if (barWidth > 0) {
        doc.roundedRect(barX, y + 1, barWidth, barHeight, 3).fill(row.color);
      }
      doc.fillColor("#344054").text(String(row.value), barX + barMaxWidth + 8, y + 2, {
        width: 40,
      });
      doc.y = y + barHeight + 10;
    }
  }
}
