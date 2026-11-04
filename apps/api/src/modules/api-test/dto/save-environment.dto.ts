import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class SaveApiEnvironmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(INPUT_LIMITS.environmentName, {
    message: `环境名称不能超过 ${INPUT_LIMITS.environmentName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `环境名称${DISPLAY_NAME_HINT}`,
  })
  name!: string;

  @ApiPropertyOptional({ enum: ["global", "system", "personal"] })
  @IsOptional()
  @IsIn(["global", "system", "personal"])
  scope?: "global" | "system" | "personal";

  @ApiPropertyOptional({ description: "连接地址由环境服务配置，环境层可留空" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: "明文 Token，仅保存时提交" })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
