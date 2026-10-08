import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "@config/app-config.types";
import { RequestContext } from "@common/audit/request-context";
import { NotifyMessageService } from "@common/notify/service/notify-message.service";
import { ApiExecutionService } from "./api-execution.service";
import { ApiReportService } from "./api-report.service";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { SmpClientService } from "./smp-client.service";

/** 发布已执行的单案例报告；重试发布不会重新执行交易。 */
@Injectable()
export class ApiCaseReportDeliveryService {
  constructor(
    private readonly execution: ApiExecutionService,
    private readonly reports: ApiReportService,
    private readonly notify: NotifyMessageService,
    private readonly config: ConfigService<AppConfig>,
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDb: DataSource,
    private readonly smp: SmpClientService,
  ) {}

  async publish(
    projectId: string,
    transactionId: string,
    runId: string,
    selection: { versionId: string; applicationId: string; roundId: string },
  ) {
    const run = await this.execution.getRunDetail(projectId, runId);
    if (run.transactionId !== transactionId || run.items.length !== 1) {
      throw new BadRequestException("仅可发布当前交易下的单案例执行报告");
    }
    const report = await this.reports.exportReport(
      projectId,
      runId,
      "html",
      transactionId,
    );
    const fileName = `${runId}.html`;
    const [version] = await this.testDb.query<Array<{ versionTime: string }>>(
      "SELECT version_time AS versionTime FROM t_pre_version WHERE id = ? AND data_status = 0",
      [selection.versionId],
    );
    const [application] = await this.testDb.query<Array<{ name: string }>>(
      "SELECT name FROM t_pre_execute_plan WHERE id = ? AND version_id = ? AND pid = 0 AND data_status = 0",
      [selection.applicationId, selection.versionId],
    );
    const [round] = await this.testDb.query<
      Array<{ roundNum: string | number }>
    >(
      "SELECT round_num AS roundNum FROM t_pre_execute_plan WHERE id = ? AND version_id = ? AND pid = ? AND data_status = 0",
      [selection.roundId, selection.versionId, selection.applicationId],
    );
    if (!version || !application || !round)
      throw new BadRequestException("执行版本、应用或轮次已失效");
    const item = run.items[0] as {
      caseId?: string;
      caseNo?: string;
      caseTitle?: string;
      status?: string;
    };
    // 报告只上传测管，不写入本地对象存储。
    const uploaded = await this.smp.uploadFile(fileName, report.buffer);
    const reportUrl = uploaded.fileUrl || uploaded.downloadUrl;
    await this.smp.receiveAutoResult({
      version: version.versionTime,
      system: application.name,
      round: String(round.roundNum),
      code: "200",
      total: 1,
      data: [
        {
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          casesNo: item?.caseId ? `${'api-plaform:'}${item?.caseId}` : `${'api-plaform:'}${item?.caseNo}`,
          caseName: item.caseTitle,
          result: item.status === "passed" ? "成功" : "失败",
          message: "",
          files: uploaded,
        },
      ],
    });
    const receiver = RequestContext.getUserName();
    if (
      !this.config.get("ocuPush", { infer: true })?.enabled ||
      receiver === "system"
    ) {
      return {
        runId,
        fileName,
        reportUrl,
        notificationStatus: "disabled" as const,
      };
    }
    await this.notify.enqueue({
      scene: "api.case.executed",
      receiver,
      bizType: "api_test_run",
      bizId: runId,
      content: `案例「${run.items[0].caseTitle}」执行完成：${run.passedCount}/${run.totalCount} 通过。测试报告（链接有效期 7 天）：${reportUrl}`,
    });
    return {
      runId,
      fileName,
      reportUrl,
      notificationStatus: "queued" as const,
    };
  }
}
