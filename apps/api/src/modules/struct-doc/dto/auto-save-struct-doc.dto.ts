/**
 * 结构化文档自动保存请求 DTO。
 * 用于在线编辑过程中无感持久化临时 Markdown 内容。
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/** 自动保存结构化文档的请求体。 */
export class AutoSaveStructDocDto {
  /** 在线编辑中的临时结构化 Markdown 内容 */
  @ApiPropertyOptional({ example: "# 结构化需求文档\n\n..." })
  @IsOptional()
  @IsString()
  tempStructDoc?: string;
}
