/**
 * @file 动态指令测试要点列表查询 DTO（分页 + 系统 / 功能模块筛选）
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { CASE_FORGE_PAGE_SIZE_OPTIONS } from "@case-forge/shared";

/** 分页列表查询参数 */
export class ListDynamicTestPointsDto {
  @ApiPropertyOptional({ example: "project-uuid" })
  @IsString()
  projectId: string;

  @ApiPropertyOptional({ example: "struct-doc-uuid" })
  @IsString()
  structDocId: string;

  @ApiPropertyOptional({ description: "按系统精确筛选" })
  @IsOptional()
  @IsString()
  system?: string;

  @ApiPropertyOptional({ description: "按功能模块精确筛选" })
  @IsOptional()
  @IsString()
  featureModule?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, enum: CASE_FORGE_PAGE_SIZE_OPTIONS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...CASE_FORGE_PAGE_SIZE_OPTIONS])
  pageSize?: number;
}
