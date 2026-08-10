import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { In, Repository } from "typeorm";
import {
  applyPdfCjkFont,
  formatRunItemStatus,
} from "@common/pdf/pdf-cjk-font.util";
import {
  buildApiReportHtml,
  extractReportSteps,
  type ApiReportContext,
  type ReportAssertionMeta,
  type ReportCaseMeta,
} from "@api-test/util/api-report-html.util";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { ApiTestEnvironmentEntity } from "@api-test/entity/api-test-environment.entity";
import { ApiReportExportEntity } from "@api-test/entity/api-report-export.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { auditFieldsForCreate } from "@common/audit/request-context";
import { ApiExecutionService } from "./api-execution.service";

function sanitizeExportFileToken(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function buildExportFileName(
  requirementNo: string,
  transactionCode: string,
  format: "xlsx" | "pdf" | "html",
  runId: string,
) {
  const ext = format === "xlsx" ? "xlsx" : format;
  const req = sanitizeExportFileToken(requirementNo);
  const tx = sanitizeExportFileToken(transactionCode);
  if (req && tx) {
    return `${req}_${tx}.${ext}`;
  }
  if (req) {
    return `${req}.${ext}`;
  }
  if (tx) {
    return `${tx}.${ext}`;
  }
  return `api-test-run-${runId}.${ext}`;
}

type RunDetail = Awaited<ReturnType<ApiExecutionService["getRunDetail"]>>;

@Injectable()
export class ApiReportService {
  constructor(
    private readonly executionService: ApiExecutionService,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(ApiTestEnvironmentEntity)
    private readonly envRepo: Repository<ApiTestEnvironmentEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiReportExportEntity)
    private readonly exportRepo: Repository<ApiReportExportEntity>,
  ) {}

  async recordExport(input: {
    projectId: string;
    transactionId: string;
    format: string;
    runId: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }) {
    await this.exportRepo.save(
      this.exportRepo.create({
        projectId: input.projectId,
        transactionId: input.transactionId,
        format: input.format,
        runId: input.runId,
        fileName: input.fileName,
        contentType: input.contentType,
        contentBase64: input.buffer.toString("base64"),
        ...auditFieldsForCreate(),
      }),
    );
    const old = await this.exportRepo.find({
      where: { projectId: input.projectId, transactionId: input.transactionId },
      order: { createdAt: "DESC" },
      skip: 20,
      take: 100,
    });
    if (old.length) await this.exportRepo.delete(old.map((row) => row.id));
  }

  async listReportExports(projectId: string, transactionId: string) {
    const rows = await this.exportRepo.find({
      where: { projectId, transactionId },
      order: { createdAt: "DESC" },
      take: 20,
    });
    return rows.map(({ contentBase64, ...rest }) => rest);
  }

  async getReportExport(projectId: string, transactionId: string, id: string) {
    const row = await this.exportRepo.findOne({ where: { id, projectId, transactionId } });
    if (!row) throw new NotFoundException("导出记录不存在");
    return row;
  }

  async lastReportExportByTransaction(projectId: string) {
    const rows = await this.exportRepo.find({
      where: { projectId },
      order: { createdAt: "DESC" },
    });
    const map = new Map<string, { id: string; format: string; fileName: string; createdAt: Date }>();
    for (const row of rows) {
      if (!map.has(row.transactionId)) {
        map.set(row.transactionId, { id: row.id, format: row.format, fileName: row.fileName, createdAt: row.createdAt });
      }
    }
    return map;
  }

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
    const fileName = await this.resolveExportFileName(
      projectId,
      transactionId,
      runId,
      format,
    );
    if (format === "xlsx") {
      return {
        buffer: await this.toExcel(run),
        fileName,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }
    if (format === "html") {
      const context = await this.buildReportContext(run);
      const html = buildApiReportHtml(run, context);
      return {
        buffer: Buffer.from(html, "utf-8"),
        fileName,
        contentType: "text/html; charset=utf-8",
      };
    }
    if (format === "pdf") {
      return {
        buffer: await this.toPdf(run),
        fileName,
        contentType: "application/pdf",
      };
    }
    throw new BadRequestException(`不支持的导出格式: ${format}`);
  }

  private async resolveExportFileName(
    projectId: string,
    transactionId: string | undefined,
    runId: string,
    format: "xlsx" | "pdf" | "html",
  ) {
    const [project, transaction] = await Promise.all([
      this.projectRepo.findOne({
        where: { id: projectId },
        select: ["id", "requirementNo"],
      }),
      transactionId
        ? this.transactionRepo.findOne({
            where: { id: transactionId, projectId },
            select: ["id", "code", "reqCode"],
          })
        : null,
    ]);
    const requirementNo =
      transaction?.reqCode?.trim() || project?.requirementNo?.trim() || "";
    const transactionCode = transaction?.code?.trim() || "";
    return buildExportFileName(requirementNo, transactionCode, format, runId);
  }

  private async filterRunByTransaction(
    projectId: string,
    transactionId: string,
    run: RunDetail,
  ) {
    if (run.transactionId && run.transactionId === transactionId) {
      return run;
    }
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

  private async buildReportContext(
    run: RunDetail,
  ): Promise<Partial<ApiReportContext>> {
    const [env, transaction, project] = await Promise.all([
      run.environmentId
        ? this.envRepo.findOne({
            where: { id: run.environmentId },
            select: ["id", "name"],
          })
        : null,
      run.transactionId
        ? this.transactionRepo.findOne({
            where: { id: run.transactionId },
            select: ["id", "code", "name"],
          })
        : null,
      this.projectRepo.findOne({
        where: { id: run.projectId },
        select: ["id", "title", "requirementNo"],
      }),
    ]);

    const caseIds = (run.items ?? [])
      .map((item) => item.caseId)
      .filter(Boolean);
    const cases = caseIds.length
      ? await this.caseRepo.find({
          where: { id: In(caseIds) },
          select: [
            "id",
            "caseNo",
            "transactionCode",
            "description",
            "expected",
          ],
        })
      : [];

    const caseMeta: Record<string, ReportCaseMeta> = {};
    const transactionCodes = new Set<string>();

    for (const c of cases) {
      if (c.transactionCode) transactionCodes.add(c.transactionCode);
      const assertionMeta: Record<string, ReportAssertionMeta> = {};

      if (c.expected?.assertions?.length) {
        for (const a of c.expected.assertions) {
          const name =
            a.description ||
            `${a.type} ${a.operator} ${a.expected ?? a.expression}`;
          assertionMeta[name] = {
            type: a.type,
            operator: a.operator,
            expression: a.expression,
            expected: a.expected,
          };
        }
      }

      caseMeta[c.id] = {
        caseNo: c.caseNo,
        transactionCode: c.transactionCode,
        description: c.description,
        assertionMeta,
      };
    }

    const reportCode =
      project?.requirementNo ||
      project?.title ||
      run.id.slice(0, 8).toUpperCase();

    return {
      reportCode,
      setName: transaction
        ? `${transaction.code} ${transaction.name}`
        : "—",
      envName: env?.name ?? "—",
      transactionCount: transactionCodes.size,
      caseMeta,
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
      { header: "步骤", key: "step", width: 24 },
      { header: "状态", key: "status", width: 12 },
      { header: "耗时(ms)", key: "duration", width: 12 },
      { header: "URL", key: "url", width: 40 },
      { header: "HTTP", key: "http", width: 8 },
      { header: "断言摘要", key: "assertions", width: 48 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const item of run.items) {
      const steps = extractReportSteps(item.requestSnapshot);
      if (steps.length) {
        for (const [index, step] of steps.entries()) {
          const stepAssertions = step.assertions ?? [];
          const failedAssertions = stepAssertions.filter((a) => !a.passed);
          sheet.addRow({
            title: item.caseTitle,
            step: `步骤${index + 1}：${step.stepName ?? "未命名步骤"}`,
            status: formatRunItemStatus(step.status ?? item.status),
            duration: step.durationMs ?? "",
            url: String(step.request?.url ?? ""),
            http: step.response?.status ?? "",
            assertions: failedAssertions.length
              ? failedAssertions.map((a) => a.name).join("; ")
              : stepAssertions.length
                ? "全部通过"
                : "—",
          });
        }
        continue;
      }
      const failedAssertions = item.assertions.filter((a) => !a.passed);
      sheet.addRow({
        title: item.caseTitle,
        step: "—",
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
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.fontSize(20).text("接口测试执行报告", { align: "center" });
      doc.moveDown(0.8);
      doc.fontSize(11).fillColor("#475467");
      doc.text(`批次 ID：${run.id}`, { align: "center" });
      doc.moveDown(1.2);

      this.drawPdfSummaryCards(doc, pageWidth, run, passRate);
      doc.moveDown(1.2);
      this.drawPdfStatusBars(doc, pageWidth, run);
      doc.moveDown(1.2);

      doc
        .fillColor("#101828")
        .fontSize(13)
        .text("案例明细", { underline: true });
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
        doc
          .fillColor("#101828")
          .text(`• ${item.caseTitle}`, { continued: true });
        doc
          .fillColor(statusColor)
          .text(`  [${statusLabel}]  ${item.durationMs}ms`);
        doc
          .fillColor("#667085")
          .fontSize(9)
          .text(`  请求：${String(item.requestSnapshot.url ?? "—")}`);
        const steps = extractReportSteps(item.requestSnapshot);
        for (const [index, step] of steps.entries()) {
          doc.text(
            `  步骤${index + 1}：${step.stepName ?? "未命名步骤"} ［${formatRunItemStatus(step.status ?? item.status)}］ ${step.durationMs ?? 0}ms — ${String(step.request?.url ?? "")}`,
          );
        }
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
      doc
        .roundedRect(x, startY, cardWidth, cardHeight, 6)
        .fillAndStroke("#f9fafb", "#eaecf0");
      doc
        .fillColor("#667085")
        .fontSize(9)
        .text(card.label, x + 10, startY + 10, {
          width: cardWidth - 20,
        });
      doc
        .fillColor(card.color)
        .fontSize(16)
        .text(card.value, x + 10, startY + 26, {
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
      doc
        .fillColor("#475467")
        .fontSize(10)
        .text(row.label, doc.page.margins.left, y, {
          width: labelWidth,
        });
      const ratio = run.totalCount > 0 ? row.value / run.totalCount : 0;
      const barWidth = Math.max(ratio > 0 ? 8 : 0, barMaxWidth * ratio);
      const barX = doc.page.margins.left + labelWidth;
      doc.roundedRect(barX, y + 1, barMaxWidth, barHeight, 3).fill("#f2f4f7");
      if (barWidth > 0) {
        doc.roundedRect(barX, y + 1, barWidth, barHeight, 3).fill(row.color);
      }
      doc
        .fillColor("#344054")
        .text(String(row.value), barX + barMaxWidth + 8, y + 2, {
          width: 40,
        });
      doc.y = y + barHeight + 10;
    }
  }
}
