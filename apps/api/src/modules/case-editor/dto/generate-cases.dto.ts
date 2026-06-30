/**
 * 生成案例树的请求 DTO
 *
 * - testPointIds 长度 = 1：同步生成，HTTP 阻塞至完成
 * - testPointIds 长度 > 1：批量模式，立即返回，后台逐条生成
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";

export class GenerateCasesDto {
  /** 覆盖默认 AI 模型（如 qwen-72b），不传则用环境变量 AI_CHAT_MODEL */
  @ApiPropertyOptional({ example: "qwen-72b" })
  @IsOptional()
  @IsString()
  model?: string;

  /** 要生成案例的测试要点 ID；单条或多条 */
  @ApiPropertyOptional({ type: [String], description: "指定生成的测试要点 ID 列表" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testPointIds?: string[];
}
