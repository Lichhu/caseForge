import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  BUSINESS_CODE_PATTERN,
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class SaveApiTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.transactionCode, {
    message: `交易码不能超过 ${INPUT_LIMITS.transactionCode} 个字符`,
  })
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "交易码仅支持字母、数字、点、下划线和连字符",
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.transactionName, {
    message: `交易名称不能超过 ${INPUT_LIMITS.transactionName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `交易名称${DISPLAY_NAME_HINT}`,
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.transactionDescription)
  description?: string;
}
