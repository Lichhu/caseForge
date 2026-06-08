import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import type { ApiEndpointPayload } from "@case-forge/shared";

export class SaveApiDocDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  structuredMarkdown?: string;

  @ApiPropertyOptional({ type: "array" })
  @IsOptional()
  endpoints?: ApiEndpointPayload[];
}

export class AutoSaveApiDocDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tempStructuredMarkdown?: string;
}
