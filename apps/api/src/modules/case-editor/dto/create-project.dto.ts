/**
 * 创建案例生成项目的请求 DTO。
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** 新建案例生成项目的请求体 */
export class CreateProjectDto {
  @ApiPropertyOptional({ example: "积存金 1 号有效户拦截案例生成" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: "用于生成银行渠道系统测试案例" })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  description?: string;
}
