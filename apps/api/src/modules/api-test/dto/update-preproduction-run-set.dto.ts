import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class UpdatePreproductionRunSetDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(INPUT_LIMITS.runSetName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `推送集名称${DISPLAY_NAME_HINT}`,
  })
  name?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  versionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `版本名称${DISPLAY_NAME_HINT}`,
  })
  versionLabel!: string;

  @ApiPropertyOptional({ maxLength: 36, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  applicationId?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `应用名称${DISPLAY_NAME_HINT}`,
  })
  applicationLabel?: string | null;

  @ApiPropertyOptional({ maxLength: 36, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  roundId?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `轮次名称${DISPLAY_NAME_HINT}`,
  })
  roundLabel?: string | null;
}
