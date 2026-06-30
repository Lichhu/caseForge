/**
 * @file 批量保存动态指令请求 DTO
 */
import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsString } from "class-validator";
import { SaveDynamicInstructDto } from "./save-dynamic-instruct.dto";

/** 批量保存动态指令：在 SaveDynamicInstructDto 基础上增加测试要点 ID 列表 */
export class BatchSaveDynamicInstructDto extends SaveDynamicInstructDto {
  @ApiProperty({ type: [String], example: ["tp-1", "tp-2"] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testPointIds: string[];
}
