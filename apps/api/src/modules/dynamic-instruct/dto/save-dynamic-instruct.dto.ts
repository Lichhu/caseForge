/**
 * @file 保存单条测试要点动态指令请求 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

const statuses = [
  "待编辑",
  "已编辑",
  "再编辑",
  "生成中",
  "生成失败",
  "生成完成",
] as const;

/** 保存动态指令：提示词 ID、自然语言、状态及全量/追加选项 */
export class SaveDynamicInstructDto {
  @ApiPropertyOptional({ type: [String], example: ["prompt-1", "prompt-2"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promptIds?: string[];

  @ApiPropertyOptional({ example: "重点覆盖异常分支、错误码映射和重复提交。" })
  @IsOptional()
  @IsString()
  naturalText?: string;

  @ApiPropertyOptional({ enum: statuses, example: "已编辑" })
  @IsOptional()
  @IsIn(statuses)
  status?: (typeof statuses)[number];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isFull?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isAppend?: boolean;
}
