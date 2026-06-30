/**
 * @file 创建项目请求 DTO
 */
import { PROJECT_PLATFORMS, type ProjectPlatform } from "@case-forge/shared";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/** 创建项目：标题、描述、需求编号（均为可选，标题缺省由服务生成） */
export class CreateProjectDto {
  @ApiPropertyOptional({ example: "案例生成" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: "测试案例" })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  description?: string;

  @ApiPropertyOptional({ example: "XQ2026-0295-01" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requirementNo?: string;

  @ApiPropertyOptional({ enum: PROJECT_PLATFORMS, default: "case-forge" })
  @IsOptional()
  @IsIn(PROJECT_PLATFORMS)
  platform?: ProjectPlatform;
}
