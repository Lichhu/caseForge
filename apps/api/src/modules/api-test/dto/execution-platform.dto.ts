import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class SaveApiEnvironmentServiceDto {
  @ApiProperty()
  @IsString()
  name!: string;

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
}
