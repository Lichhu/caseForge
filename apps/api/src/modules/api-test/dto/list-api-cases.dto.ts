import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { CASE_FORGE_PAGE_SIZE_OPTIONS } from "@case-forge/shared";

export class ListApiCasesDto {
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

  @ApiPropertyOptional({ description: "按版本编码筛选（如 20260716-105144）" })
  @IsOptional()
  @IsString()
  versionCode?: string;

  @ApiPropertyOptional({ description: "按渠道 ID 筛选" })
  @IsOptional()
  @IsString()
  channelId?: string;
}
