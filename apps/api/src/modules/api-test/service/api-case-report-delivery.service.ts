import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "@config/app-config.types";
import { RequestContext } from "@common/audit/request-context";
import { MinioStorageService } from "@minio/service/minio.service";
import { NotifyMessageService } from "@common/notify/service/notify-message.service";
import { ApiExecutionService } from "./api-execution.service";
import { ApiReportService } from "./api-report.service";

/** 发布已执行的单案例报告；重试发布不会重新执行交易。 */
@Injectable()
export class ApiCaseReportDeliveryService {
  constructor(
    private readonly execution: ApiExecutionService,
    private readonly reports: ApiReportService,
    private readonly storage: MinioStorageService,
    private readonly notify: NotifyMessageService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async publish(projectId: string, transactionId: string, runId: string) {
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
    // 以执行 ID 为稳定路径，上传重试不会创建重复对象。
    const objectPath = `case-reports/${projectId}/${runId}.html`;
    await this.storage.uploadFile(objectPath, report.buffer);
    const reportUrl = await this.storage.getAccessUrl(objectPath);
    if (!reportUrl)
      throw new BadRequestException(
        "报告已上传，但获取报告链接失败，请重试发布",
      );
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
