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
  @IsString() @IsNotEmpty() type: string;
  @IsString() @IsNotEmpty() host: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsString() @IsNotEmpty() databaseName: string;
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

export class GenerateDataFunctionScriptDto {
  @IsIn(["javascript", "python"]) language: "javascript" | "python";
  @IsArray() @IsString({ each: true }) params: string[];
  @IsString() @IsNotEmpty() @MaxLength(2000) requirement: string;
}
