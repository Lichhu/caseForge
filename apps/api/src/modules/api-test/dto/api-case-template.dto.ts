import {
  IsArray,
  IsNotEmpty,
  IsString,
} from "class-validator";
export class ExportApiCaseTemplateDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  caseIds!: string[];
  @IsString() @IsNotEmpty() designer!: string;
}
