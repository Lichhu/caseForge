import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class SaveDatabaseConnectionDto {
  @IsString() @IsNotEmpty() @MaxLength(128) name: string;
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
  @IsString() @IsNotEmpty() host: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsOptional() @IsString() databaseName?: string;
  @IsString() @IsNotEmpty() username: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsBoolean() readonly?: boolean;
}

export class SaveDataFunctionDto {
  @IsString() @IsNotEmpty() @MaxLength(64) name: string;
  @IsArray() @IsString({ each: true }) params: string[];
  @IsIn(["template", "sql"]) type: "template" | "sql";
  @IsObject() config: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
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

export class GenerateDataFunctionScriptDto {
  @IsIn(["javascript", "python"]) language: "javascript" | "python";
  @IsArray() @IsString({ each: true }) params: string[];
  @IsString() @IsNotEmpty() @MaxLength(2000) requirement: string;
}
