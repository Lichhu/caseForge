/**
 * 格式化原始需求文档的请求 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

/** 提交原始需求文本进行格式化的请求体 */
export class FormatRequirementDto {
  @ApiProperty({ description: "原始需求文档文本或 Markdown", minLength: 10 })
  @IsString()
  @MinLength(10)
  rawText: string;

  @ApiPropertyOptional({ example: "XQ2026-0492-需求分析说明书.md" })
  @IsOptional()
  @IsString()
  fileName?: string;
}
