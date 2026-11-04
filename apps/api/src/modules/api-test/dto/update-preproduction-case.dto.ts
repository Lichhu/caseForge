import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class UpdatePreproductionCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.caseName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `案例名称${DISPLAY_NAME_HINT}`,
  })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.caseText)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.caseText)
  remark?: string;
}
