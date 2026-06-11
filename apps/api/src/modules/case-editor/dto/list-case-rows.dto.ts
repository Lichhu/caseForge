/**
 * @file 案例 Excel 行分页列表查询 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { CASE_FORGE_PAGE_SIZE_OPTIONS } from "@case-forge/shared";

/** 案例 Excel 行分页查询参数 */
export class ListCaseRowsDto {
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

  @ApiPropertyOptional({ description: "按测试要点精确筛选" })
  @IsOptional()
  @IsString()
  requirement?: string;

  @ApiPropertyOptional({ enum: ["高", "中", "低"] })
  @IsOptional()
  @IsIn(["高", "中", "低"])
  priority?: "高" | "中" | "低";

  @ApiPropertyOptional({ enum: ["正", "反"] })
  @IsOptional()
  @IsIn(["正", "反"])
  caseNature?: "正" | "反";

  @ApiPropertyOptional({ description: "搜索案例名称、标题、步骤等" })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: "定位案例所在页（用于滚动高亮）" })
  @IsOptional()
  @IsString()
  focusCaseNodeId?: string;

  @ApiPropertyOptional({ description: "仅返回符合筛选的 caseNodeId 列表（用于全选）" })
  @IsOptional()
  @Transform(({ value }) => value === "1" || value === "true" || value === true)
  @IsBoolean()
  idsOnly?: boolean;
}
