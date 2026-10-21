import {
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from "class-validator";
export class ExportApiCaseTemplateDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  caseIds!: string[];
  @IsString() @IsNotEmpty() designer!: string;
  @IsString() @IsNotEmpty() @MaxLength(2048) applicationPath!: string;
}
