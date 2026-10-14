import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
export class ExportApiCaseTemplateDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  caseIds!: string[];
  @IsString() @IsNotEmpty() designer!: string;
}

export class SetManagedCaseApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  applicationPath?: string | null;
}

export class BatchSetManagedCaseApplicationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  caseIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  applicationPath!: string;
}
