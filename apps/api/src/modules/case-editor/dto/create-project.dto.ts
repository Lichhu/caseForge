/**
 * 创建案例生成项目的请求 DTO。
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

/** 新建案例生成项目的请求体 */
export class CreateProjectDto {
  @ApiPropertyOptional({ example: "积存金 1 号有效户拦截案例生成" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.projectTitle)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `项目名称${DISPLAY_NAME_HINT}`,
  })
  title?: string;

  @ApiPropertyOptional({ example: "用于生成银行渠道系统测试案例" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.projectDescription)
  description?: string;
}
