import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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

export class SaveApiEnvironmentServiceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(INPUT_LIMITS.environmentServiceName, {
    message: `服务名不能超过 ${INPUT_LIMITS.environmentServiceName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `服务名${DISPLAY_NAME_HINT}`,
  })
  name!: string;

  @ApiPropertyOptional({
    description: "服务器地址，如 http://host:port/path 或 socket2://host:port",
  })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.serverAddress)
  serverAddress?: string;

  @ApiPropertyOptional({ description: "数据库 JDBC 连接串" })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.serverAddress)
  jdbcUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remoteConnection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  objectStorage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.environmentRemark)
  remark?: string;

  @ApiPropertyOptional({ enum: ["http", "tcp"] })
  @IsOptional()
  @IsIn(["http", "tcp"])
  transport?: "http" | "tcp";

  @ApiPropertyOptional({ enum: ["json", "xml", "text", "soap", "other"] })
  @IsOptional()
  @IsIn(["json", "xml", "text", "soap", "other"])
  payloadFormat?: "json" | "xml" | "text" | "soap" | "other";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  pathPrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.databaseHost)
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  encoding?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  framing?: { type: "length-prefix"; width: number; encoding?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ApiPropertyOptional({
    description: "忽略 HTTPS 证书校验（自签名/测试环境）",
  })
  @IsOptional()
  @IsBoolean()
  ignoreSslVerify?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ReorderEnvironmentServiceDto {
  @ApiProperty({ enum: ["up", "down", "top"] })
  @IsIn(["up", "down", "top"])
  direction!: "up" | "down" | "top";
}

export class SaveApiExecutionSetDto {
  @ApiProperty()
  @IsString()
  @MaxLength(INPUT_LIMITS.executionSetName, {
    message: `推送集名称不能超过 ${INPUT_LIMITS.executionSetName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `推送集名称${DISPLAY_NAME_HINT}`,
  })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.executionSetDescription)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ReplaceExecutionSetCasesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  caseIds!: string[];
}

export class ReplaceRunnerCasesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  caseIds!: string[];
}

export class RunExecutionSetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  environmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  environmentServiceId?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  concurrency?: number;

  @ApiPropertyOptional({ description: "传输给接口的编码格式", example: "GBK" })
  @IsOptional()
  @IsString()
  encoding?: string;
}
