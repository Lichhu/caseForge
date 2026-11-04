/**
 * @file 场景与提示词保存请求 DTO
 */
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  SCENARIO_SCOPE_API,
  SCENARIO_SCOPE_CASE,
  type ScenarioScope,
  BUSINESS_CODE_PATTERN,
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

/** 场景下单个提示词的保存结构 */
export class SavePromptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: "接口超时重试" })
  @IsString()
  @MaxLength(INPUT_LIMITS.promptName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `提示词名称${DISPLAY_NAME_HINT}`,
  })
  name: string;

  @ApiProperty({ example: "覆盖超时、重试、幂等与日志记录。" })
  @IsString()
  @MaxLength(INPUT_LIMITS.promptContent)
  content: string;

  @ApiPropertyOptional({ type: [String], example: ["api", "timeout"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  usageCount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isSystem?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isDefault?: boolean;
}

/** 保存场景：名称、类别、描述及嵌套提示词列表 */
export class SaveScenarioDto {
  @ApiProperty({ example: "接口测试" })
  @IsString()
  @MaxLength(INPUT_LIMITS.scenarioName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `场景名称${DISPLAY_NAME_HINT}`,
  })
  name: string;

  @ApiPropertyOptional({
    example: "聚焦接口可用性、幂等、错误码和链路稳定性。",
  })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.testPointDescription)
  description?: string;

  @ApiProperty({ example: "banking" })
  @IsString()
  @MaxLength(INPUT_LIMITS.dataFunctionName)
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "场景类别仅支持字母、数字、点、下划线和连字符",
  })
  category: string;

  @ApiPropertyOptional({ example: "pagination" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.dataFunctionName)
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "生成标识仅支持字母、数字、点、下划线和连字符",
  })
  generationKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: [SCENARIO_SCOPE_CASE, SCENARIO_SCOPE_API] })
  @IsOptional()
  @IsString()
  @IsIn([SCENARIO_SCOPE_CASE, SCENARIO_SCOPE_API])
  scope?: ScenarioScope;

  @ApiPropertyOptional({ type: [SavePromptDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePromptDto)
  prompts?: SavePromptDto[];
}
