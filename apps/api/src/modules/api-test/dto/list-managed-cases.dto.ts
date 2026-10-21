import type { ManagedCaseQuery } from "@case-forge/shared";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class ListManagedCasesDto implements ManagedCaseQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn([10, 20, 50, 100])
  pageSize = 10;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  applicationPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  versionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  latestOnly = true;
}

export class ManagedCaseDetailsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}

export class DeleteManagedCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  caseIds!: string[];
}
