import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  INPUT_LIMITS,
  SAFE_LANGUAGE_IDENTIFIER_PATTERN,
} from "@case-forge/shared";

export class SaveDatabaseConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.databaseConnectionName)
  name: string;
  @IsString()
  @IsNotEmpty()
  @IsIn([
    "MariaDB",
    "MySQL",
    "TiDB",
    "OceanBase-MySQL",
    "OceanBase-Oracle",
    "GoldenDB",
    "PostgreSQL",
    "KingbaseES",
    "GaussDB",
    "GaussDB-MySQL",
    "Oracle",
    "DM8",
  ])
  type: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.databaseHost)
  host: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.databaseName)
  databaseName?: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.databaseUsername)
  username: string;
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.databasePassword)
  password?: string;
  @IsOptional() @IsBoolean() readonly?: boolean;
}

export class SaveDataFunctionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.dataFunctionName)
  @Matches(SAFE_LANGUAGE_IDENTIFIER_PATTERN, {
    message: "函数名称仅支持中英文、数字和下划线，且不能以数字开头",
  })
  name: string;
  @IsArray() @IsString({ each: true }) params: string[];
  @IsIn(["template", "sql"]) type: "template" | "sql";
  @IsObject() config: Record<string, unknown>;
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.dataFunctionDescription)
  description?: string;
}

export class PreviewDataFunctionDto extends SaveDataFunctionDto {
  @IsObject() values: Record<string, unknown>;
}

/** SQL 步骤试运行：只跑查询，返回列名与前若干行 */
export class PreviewSqlStepDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() sql: string;
  @IsOptional() @IsInt() @Min(1000) @Max(60000) timeoutMs?: number;
}

/** SQL 单步调试：试运行并可选写入案例步骤调试记录。 */
export class DebugSqlStepDto extends PreviewSqlStepDto {
  @IsOptional() @IsString() @MaxLength(36) caseId?: string;
  @IsOptional() @IsString() @MaxLength(36) stepId?: string;
  @IsOptional()
  @IsIn(["project", "preproduction"])
  caseSource?: "project" | "preproduction";
}

export class GenerateDataFunctionScriptDto {
  @IsIn(["javascript", "python"]) language: "javascript" | "python";
  @IsArray() @IsString({ each: true }) params: string[];
  @IsString() @IsNotEmpty() @MaxLength(2000) requirement: string;
}
