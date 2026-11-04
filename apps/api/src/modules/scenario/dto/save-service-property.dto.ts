import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class SaveServicePropertyDto {
  @ApiProperty({ example: "management_non_accounting" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: "服务属性编码只能使用小写字母、数字和下划线",
  })
  code: string;

  @ApiProperty({ example: "管理类非涉账" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.servicePropertyName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `显示名称${DISPLAY_NAME_HINT}`,
  })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.servicePropertyDescription)
  description?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  scenarioIds: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
