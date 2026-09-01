/**
 * @file 拒绝认领请求 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** 拒绝认领：原因选填 */
export class RefuseRequirementDto {
  @ApiPropertyOptional({ example: "该需求不在本人负责范围内" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
