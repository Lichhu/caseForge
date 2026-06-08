import { Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { ApiExecutionService } from "./api-execution.service";

@Injectable()
export class ApiReportService {
  constructor(private readonly executionService: ApiExecutionService) {}

  async summary(projectId: string, runId?: string) {
    if (runId) {
      const run = await this.executionService.getRunDetail(projectId, runId);
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
          { name: "通过", value: run.passedCount },
          { name: "失败", value: run.failedCount },
          { name: "错误", value: run.errorCount },
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
    format: "xlsx" | "pdf",
  ): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const run = await this.executionService.getRunDetail(projectId, runId);
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
    return {
      buffer: await this.toPdf(run),
      fileName: `api-test-run-${runId}.pdf`,
      contentType: "application/pdf",
    };
  }

  private async toExcel(run: Awaited<ReturnType<ApiExecutionService["getRunDetail"]>>) {
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
        status: item.status,
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

  private async toPdf(run: Awaited<ReturnType<ApiExecutionService["getRunDetail"]>>) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text("接口测试执行报告", { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`批次 ID: ${run.id}`);
      doc.text(`总数: ${run.totalCount}  通过: ${run.passedCount}  失败: ${run.failedCount}  错误: ${run.errorCount}`);
      const rate =
        run.totalCount > 0
          ? ((run.passedCount / run.totalCount) * 100).toFixed(1)
          : "0";
      doc.text(`通过率: ${rate}%`);
      doc.text(`并发: ${run.concurrency}`);
      doc.moveDown();
      doc.text("失败与错误案例:", { underline: true });
      doc.moveDown(0.5);
      for (const item of run.items) {
        if (item.status === "passed") continue;
        doc.fontSize(10).text(`• ${item.caseTitle} [${item.status}] ${item.durationMs}ms`);
        doc.text(`  URL: ${String(item.requestSnapshot.url ?? "")}`);
        const failed = item.assertions.filter((a) => !a.passed);
        for (const assertion of failed.slice(0, 3)) {
          doc.text(`  - ${assertion.name}: 期望 ${JSON.stringify(assertion.expected)} 实际 ${JSON.stringify(assertion.actual)}`);
        }
        doc.moveDown(0.3);
      }
      doc.end();
    });
  }
}
