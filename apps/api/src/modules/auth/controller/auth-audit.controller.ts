import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { createReadStream } from "node:fs";
import type { Request, Response } from "express";
import type {
  AuthAuditEventPage,
  AuthAuditExportJob,
  AuthAuditSummary,
} from "@case-forge/shared";
import {
  AuthAuditSummaryQueryDto,
  CreateAuthAuditExportDto,
  ListAuthAuditEventsDto,
} from "../dto/list-auth-audit-events.dto";
import { AuthAuditAdminGuard } from "../guard/auth-audit-admin.guard";
import { AuthService } from "../service/auth.service";
import { AuthAuditService } from "../service/auth-audit.service";

@ApiTags("auth")
@Controller("auth/audit")
@UseGuards(AuthAuditAdminGuard)
export class AuthAuditController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuthAuditService,
  ) {}

  @Get("events")
  @ApiOperation({ summary: "查询认证审计明细（游标分页）" })
  listEvents(
    @Query() query: ListAuthAuditEventsDto,
  ): Promise<AuthAuditEventPage> {
    return this.auditService.queryEvents(query);
  }

  @Get("summary")
  @ApiOperation({ summary: "查询认证审计日汇总" })
  summary(
    @Query() query: AuthAuditSummaryQueryDto,
  ): Promise<AuthAuditSummary> {
    return this.auditService.summarize(query);
  }

  @Post("exports")
  @HttpCode(202)
  @ApiOperation({ summary: "创建认证审计异步导出任务" })
  createExport(
    @Req() request: Request,
    @Body() dto: CreateAuthAuditExportDto,
  ): Promise<AuthAuditExportJob> {
    const current = this.authService.readSessionContext(request.headers.cookie);
    return this.auditService.createExport({
      ...dto,
      requestedBy:
        current.claims.actorUserName ?? current.claims.userName,
    });
  }

  @Get("exports/:id")
  @ApiOperation({ summary: "查询认证审计导出任务" })
  getExport(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AuthAuditExportJob> {
    return this.auditService.getExport(id);
  }

  @Get("exports/:id/download")
  @ApiOperation({ summary: "下载认证审计导出文件" })
  async downloadExport(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.auditService.openExportFile(id);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName.replace(/"/g, "")}"`,
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(createReadStream(file.filePath));
  }
}
