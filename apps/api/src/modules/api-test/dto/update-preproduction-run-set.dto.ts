import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePreproductionRunSetDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
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
  roundLabel?: string | null;
}
