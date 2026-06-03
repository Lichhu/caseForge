/**
 * 案例编辑器 HTTP 接口：工作区查询、约束保存、案例生成、
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
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { BuildConstraintsDto } from "../dto/build-constraints.dto";
import { CancelGenerateDto } from "../dto/cancel-generate.dto";
import { GenerateCasesDto } from "../dto/generate-cases.dto";
import { RegenerateNodeDto } from "../dto/regenerate-node.dto";
import { UpdateRunTreeDto } from "../dto/update-run-tree.dto";
import { CaseEditorService } from "../service/case-editor.service";
import { CaseWorkspaceService } from "../service/case-workspace.service";
import { ExportService } from "../service/export.service";

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
  ) {}

  /** 获取项目工作区（文档、约束、案例运行） */
  @Get("projects/:projectId/workspace")
  @ApiOperation({ summary: "获取项目工作区（文档、约束、案例运行）" })
  getProjectWorkspace(@Param("projectId") projectId: string) {
    return this.workspaceService.getProjectWorkspace(projectId);
  }

  /** 保存约束快照 */
  @Post("projects/:projectId/constraints")
  @ApiOperation({ summary: "保存约束快照" })
  buildConstraints(
    @Param("projectId") projectId: string,
    @Body() dto: BuildConstraintsDto,
  ) {
    return this.workspaceService.buildConstraints(projectId, dto);
  }

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

  /** 局部重生成案例节点 */
  @Post("projects/:projectId/regenerate-node")
  @ApiOperation({ summary: "局部重生成案例节点" })
  regenerateNode(
    @Param("projectId") projectId: string,
    @Body() dto: RegenerateNodeDto,
  ) {
    return this.workspaceService.regenerateNode(projectId, dto);
  }

  /** 查询项目案例编辑运行记录 */
  @Get("projects/:projectId/runs")
  @ApiOperation({ summary: "查询项目案例编辑运行记录" })
  listRuns(@Param("projectId") projectId: string) {
    return this.caseEditorService.listRuns(projectId);
  }

  /** 查询单个案例树运行记录 */
  @Get("projects/:projectId/runs/:runId")
  @ApiOperation({ summary: "查询单个案例树运行记录" })
  getRun(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.caseEditorService.getRun(projectId, runId);
  }

  /** 导出案例树（支持 json、excel、xmind） */
  @Get("projects/:projectId/runs/:runId/export")
  @ApiOperation({ summary: "导出案例树" })
  async exportRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query("format") format: "json" | "excel" | "xmind" = "json",
    @Res() response: Response,
  ) {
    const run = await this.caseEditorService.getRun(projectId, runId);
    const fileBase = `${run.tree.title.replace(/[\\/:*?"<>|]/g, "_")}`;
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
      const buffer = await this.exporter.toExcel(run.tree);
      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileBase)}.xlsx"`,
      );
      return response.send(buffer);
    }
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileBase)}.json"`,
    );
    return response.send(this.exporter.toJson(run.tree, run.mindMapExtras));
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
