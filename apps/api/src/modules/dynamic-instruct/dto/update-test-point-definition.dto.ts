/**
 * @file 更新测试要点定义字段 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class UpdateTestPointDefinitionDto {
  @ApiPropertyOptional({ example: "订单系统" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.systemName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `系统名称${DISPLAY_NAME_HINT}`,
  })
  system?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.testPointDescription)
  systemDesc?: string;

  @ApiPropertyOptional({ example: "下单模块" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.featureModule)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `功能模块${DISPLAY_NAME_HINT}`,
  })
  featureModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.testPointDescription)
  featureDesc?: string;

  @ApiPropertyOptional({ example: "提交订单" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.testPoint)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `测试要点${DISPLAY_NAME_HINT}`,
  })
  testPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.testPointDescription)
  testPointDesc?: string;
}
