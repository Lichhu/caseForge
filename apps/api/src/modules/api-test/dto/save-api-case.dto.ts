import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiCaseExport,
  CaseLastDebugRun,
  ApiCaseStep,
} from "@case-forge/shared";

export class SaveApiCaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caseNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: ApiCasePriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  polarity?: ApiCasePolarity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: ApiCaseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  preconditions?: string[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  steps?: ApiCaseStep[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promptIds?: string[];

  @ApiPropertyOptional({ description: "归入指定 AI 生成版本，便于版本筛选" })
  @IsOptional()
  @IsInt()
  generateVersion?: number;

  @ApiPropertyOptional({
    description: "归入指定版本编码（如 20260716-105144）",
  })
  @IsOptional()
  @IsString()
  versionCode?: string;

  @ApiPropertyOptional({ description: "案例调试默认环境" })
  @IsOptional()
  @IsUUID()
  debugEnvironmentId?: string;

  @ApiPropertyOptional({ description: "案例调试默认环境服务" })
  @IsOptional()
  @IsUUID()
  debugEnvironmentServiceId?: string;

  @ApiPropertyOptional({ description: "案例调试传输编码" })
  @IsOptional()
  @IsString()
  debugEncoding?: string;

  @ApiPropertyOptional({ description: "最近一次调试执行快照" })
  @IsOptional()
  @IsObject()
  lastDebugRun?: CaseLastDebugRun;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  exports?: ApiCaseExport[];

  @ApiProperty()
  @IsObject()
  request!: ApiCaseRequest;

  @ApiProperty()
  @IsObject()
  expected!: ApiCaseExpected;
}

export class GenerateApiCasesDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  beforeSteps?: ApiCaseStep[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  afterSteps?: ApiCaseStep[];
}

export class BatchPatchApiCaseRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  caseIds!: string[];

  @ApiProperty()
  @IsObject()
  patch!: Partial<ApiCaseRequest>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  environmentServiceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  encoding?: string;
}

export class RunApiCasesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  caseIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  environmentServiceId?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  concurrency?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  encoding?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  executionSetId?: string;

  @ApiPropertyOptional({ description: "传入则覆盖该次执行记录，不新建历史" })
  @IsOptional()
  @IsUUID()
  runId?: string;
}

export class ExportApiReportDto {
  @ApiProperty({ enum: ["xlsx", "pdf", "html"] })
  @IsString()
  @IsIn(["xlsx", "pdf", "html"])
  format!: "xlsx" | "pdf" | "html";

  @ApiProperty()
  @IsUUID()
  runId!: string;
}
