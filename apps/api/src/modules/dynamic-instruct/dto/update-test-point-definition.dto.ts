/**
 * @file 更新测试要点定义字段 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateTestPointDefinitionDto {
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
