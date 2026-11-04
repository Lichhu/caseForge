/**
 * @file 更新项目请求 DTO
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  REQUIREMENT_CODE_PATTERN,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

/** 更新项目：标题、描述、需求编号（均为可选） */
export class UpdateProjectDto {
  @ApiPropertyOptional({ example: "案例生成" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.projectTitle)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `项目名称${DISPLAY_NAME_HINT}`,
  })
  title?: string;

  @ApiPropertyOptional({ example: "测试案例" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.projectDescription)
  description?: string;

  @ApiPropertyOptional({ example: "XQ2026-0295-01" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.requirementCode)
  @Matches(REQUIREMENT_CODE_PATTERN, {
    message: "需求编号格式必须为 XQxxxx-xxxx-xx，例如 XQ2026-0818-01",
  })
  requirementNo?: string;
}
