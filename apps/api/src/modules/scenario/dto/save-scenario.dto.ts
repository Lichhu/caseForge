/**
 * @file 场景与提示词保存请求 DTO
 */
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** 场景下单个提示词的保存结构 */
export class SavePromptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: "接口超时重试" })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: "覆盖超时、重试、幂等与日志记录。" })
  @IsString()
  @MaxLength(4000)
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
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    example: "聚焦接口可用性、幂等、错误码和链路稳定性。",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "banking" })
  @IsString()
  @MaxLength(64)
  category: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [SavePromptDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePromptDto)
  prompts?: SavePromptDto[];
}
