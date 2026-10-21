import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePreproductionCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
