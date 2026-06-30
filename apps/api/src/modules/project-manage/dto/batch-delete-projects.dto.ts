/**
 * @file 批量删除项目请求 DTO
 */
import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

/** 批量删除项目：项目 ID 数组 */
export class BatchDeleteProjectsDto {
  @ApiProperty({ type: [String], example: ["1", "2"] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
