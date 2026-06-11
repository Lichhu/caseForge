/**
 * 案例编辑器 HTTP 接口：工作区查询、案例生成、
 * 运行记录管理与多格式导出。
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  BadRequestException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CancelGenerateDto } from "../dto/cancel-generate.dto";
import { GenerateCasesDto } from "../dto/generate-cases.dto";
import { RegenerateNodeDto } from "../dto/regenerate-node.dto";
import { SyncToTestPlatformDto } from "../dto/sync-to-test-platform.dto";
import { UpdateRunTreeDto } from "../dto/update-run-tree.dto";
import { ListCaseRowsDto } from "../dto/list-case-rows.dto";
import { CaseEditorService } from "../service/case-editor.service";
import { CaseWorkspaceService } from "../service/case-workspace.service";
import { ExportService } from "../service/export.service";
import { CaseTestPlatformSyncService } from "../service/case-test-platform-sync.service";

/** 案例编辑器 REST 控制器 */
@ApiTags("case-editor")
@Controller("case-editor")
export class CaseEditorController {
  constructor(
    @Inject(CaseEditorService)
    private readonly caseEditorService: CaseEditorService,
    @Inject(CaseWorkspaceService)
    private readonly workspaceService: CaseWorkspaceService,
    @Inject(ExportService)
    private readonly exporter: ExportService,
    @Inject(CaseTestPlatformSyncService)
    private readonly testPlatformSync: CaseTestPlatformSyncService,
  ) {}

  /**
   * 触发案例生成
   *
   * Body: { testPointIds: string[], model?: string }
   * - 1 条：同步，响应中含最新案例树
   * - 多条：异步，立即返回；全部 testPoint 已标「生成中」，后台逐条生成
   */
  @Post("projects/:projectId/generate")
  @ApiOperation({ summary: "根据测试要点生成案例树" })
  generateCases(
    @Param("projectId") projectId: string,
    @Body() dto: GenerateCasesDto,
  ) {
    return this.workspaceService.generateCases(projectId, dto);
  }

  /** 用户主动停止生成（动态指令页「停止」按钮），非刷新触发 */
  @Post("projects/:projectId/generate/cancel")
  @ApiOperation({ summary: "取消测试要点案例生成" })
  cancelGenerateCases(
    @Param("projectId") projectId: string,
    @Body() dto: CancelGenerateDto,
  ) {
    return this.workspaceService.cancelGenerateCases(projectId, dto);
  }

  /** 查询案例生成队列进度与 ETA */
  @Get("projects/:projectId/generate/queue")
  @ApiOperation({ summary: "查询案例生成队列进度" })
  getGenerateQueueStatus(
    @Param("projectId") projectId: string,
    @Query("testPointIds") testPointIdsRaw?: string,
  ) {
    const testPointIds = (testPointIdsRaw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return this.workspaceService.getGenerateQueueStatus(
      projectId,
      testPointIds.length ? testPointIds : undefined,
    );
  }

  /** 局部重生成案例节点 */
  @Post("projects/:projectId/regenerate-node")
  @ApiOperation({ summary: "局部重生成案例节点" })
  regenerateNode(
    @Param("projectId") projectId: string,
    @Body() dto: RegenerateNodeDto,
  ) {
    return this.workspaceService.regenerateNode(projectId, dto);
  }

  /** 查询项目案例编辑运行摘要（不含案例树） */
  @Get("projects/:projectId/runs")
  @ApiOperation({ summary: "查询项目案例编辑运行摘要" })
  listRuns(@Param("projectId") projectId: string) {
    return this.caseEditorService.listRunSummaries(projectId);
  }

  /** 查询单个案例树运行记录 */
  @Get("projects/:projectId/runs/:runId")
  @ApiOperation({ summary: "查询单个案例树运行记录" })
  getRun(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.caseEditorService.getRun(projectId, runId);
  }

  /** 按需加载测试要点下的案例子树 */
  @Get("projects/:projectId/runs/:runId/nodes/:nodeId/children")
  @ApiOperation({ summary: "按需加载测试要点下的案例子树" })
  listRunNodeChildren(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Param("nodeId") nodeId: string,
  ) {
    return this.caseEditorService.listRunNodeChildren(projectId, runId, nodeId);
  }

  /** 分页查询案例 Excel 行 */
  @Get("projects/:projectId/runs/:runId/case-rows")
  @ApiOperation({ summary: "分页查询案例 Excel 行" })
  listCaseRows(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query() query: ListCaseRowsDto,
  ) {
    return this.caseEditorService.listCaseRows(projectId, runId, query);
  }

  /** 导出案例树（支持 excel、xmind；excel 可按 caseNodeIds 筛选） */
  @Get("projects/:projectId/runs/:runId/export")
  @ApiOperation({ summary: "导出案例树" })
  async exportRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query("format") format: "excel" | "xmind",
    @Query("template") template: string | undefined,
    @Query("caseNodeIds") caseNodeIdsRaw: string | undefined,
    @Res() response: Response,
  ) {
    const run = await this.caseEditorService.getRun(projectId, runId);
    const fileBase = `${run.tree.title.replace(/[\\/:*?"<>|]/g, "_")}`;
    const caseNodeIds = (caseNodeIdsRaw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const downloadTemplate = template === "1" || template === "true";
    if (format === "xmind") {
      const buffer = await this.exporter.toXmind(run.tree, run.mindMapExtras);
      response.setHeader("Content-Type", "application/vnd.xmind.workbook");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileBase)}.xmind"`,
      );
      return response.send(buffer);
    }
    if (format === "excel") {
      const buffer = downloadTemplate
        ? this.exporter.toExcelTemplate()
        : await this.exporter.toExcel(
            run.tree,
            caseNodeIds.length ? caseNodeIds : undefined,
          );
      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(
          downloadTemplate ? "测试案例模板" : fileBase,
        )}.xlsx"`,
      );
      return response.send(buffer);
    }
    throw new BadRequestException("format 仅支持 excel 或 xmind");
  }

  /** 将案例树同步至测管平台 */
  @Post("projects/:projectId/runs/:runId/sync-test-platform")
  @ApiOperation({ summary: "同步案例树至测管平台" })
  syncRunToTestPlatform(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() dto: SyncToTestPlatformDto,
  ) {
    return this.testPlatformSync.syncRunToTestPlatform(
      projectId,
      runId,
      dto.tree,
      dto.caseNodeIds,
    );
  }

  /** 保存编辑后的案例树 */
  @Patch("projects/:projectId/runs/:runId/tree")
  @ApiOperation({ summary: "保存案例树" })
  updateRunTree(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() dto: UpdateRunTreeDto,
  ) {
    return this.caseEditorService.updateRunTree(
      projectId,
      runId,
      dto.tree,
      dto.mindMapExtras,
    );
  }
}
