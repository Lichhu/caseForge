/**
 * @file 更新项目请求 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** 更新项目：标题、描述、需求编号（均为可选） */
export class UpdateProjectDto {
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
}
