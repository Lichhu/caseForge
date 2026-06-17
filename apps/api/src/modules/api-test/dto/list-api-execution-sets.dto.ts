import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Min } from "class-validator";
import { CASE_FORGE_PAGE_SIZE_OPTIONS } from "@case-forge/shared";

export class ListApiExecutionSetsDto {
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
