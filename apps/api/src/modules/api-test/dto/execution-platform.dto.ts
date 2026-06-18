import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class SaveApiEnvironmentServiceDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: "服务器地址，如 http://host:port/path 或 socket2://host:port",
  })
  @IsOptional()
  @IsString()
  serverAddress?: string;

  @ApiPropertyOptional({ description: "数据库 JDBC 连接串" })
  @IsOptional()
  @IsString()
  jdbcUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remoteConnection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectStorage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pathPrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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

export class RunExecutionSetDto {
  @ApiProperty()
  @IsString()
  environmentId!: string;

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
