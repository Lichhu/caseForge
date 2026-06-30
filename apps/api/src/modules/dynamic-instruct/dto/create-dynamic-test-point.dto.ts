/**
 * @file 新增测试要点 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateDynamicTestPointDto {
  @ApiPropertyOptional({ example: "project-uuid" })
  @IsString()
  projectId: string;

  @ApiPropertyOptional({ example: "struct-doc-uuid" })
  @IsString()
  structDocId: string;

  @ApiPropertyOptional({ example: "订单系统" })
  @IsOptional()
  @IsString()
  system?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemDesc?: string;

  @ApiPropertyOptional({ example: "下单模块" })
  @IsOptional()
  @IsString()
  featureModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featureDesc?: string;

  @ApiPropertyOptional({ example: "提交订单" })
  @IsOptional()
  @IsString()
  testPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testPointDesc?: string;
}
