/**
 * 更新结构化需求文档的请求 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

/** 人工修订结构化需求文档的请求体 */
export class UpdateDocumentDto {
  @ApiProperty({ description: "人工修订后的结构化 Markdown" })
  @IsString()
  @MinLength(10)
  structuredMarkdown: string;

  @ApiPropertyOptional({ description: "同步更新原始文本" })
  @IsOptional()
  @IsString()
  rawText?: string;
}
