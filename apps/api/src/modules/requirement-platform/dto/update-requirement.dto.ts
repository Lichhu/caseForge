import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateRequirementDto {
  @ApiPropertyOptional({ example: "XQ2026-0818-01" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @ApiPropertyOptional({ example: "订单查询接口改造" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectName?: string;
}
