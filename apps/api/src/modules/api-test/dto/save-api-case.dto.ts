import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promptIds?: string[];

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
  promptIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  endpointIds?: string[];
}

export class RunApiCasesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  caseIds!: string[];

  @ApiProperty()
  @IsUUID()
  environmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  environmentServiceId?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  concurrency?: number;
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
