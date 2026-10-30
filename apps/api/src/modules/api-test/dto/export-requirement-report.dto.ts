import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class RequirementReportSelectionDto {
  @ApiProperty()
  @IsUUID()
  transactionId!: string;

  @ApiProperty()
  @IsUUID()
  runId!: string;
}

export class ExportRequirementReportDto {
  @ApiProperty({ enum: ["xlsx", "pdf", "html"] })
  @IsIn(["xlsx", "pdf", "html"])
  format!: "xlsx" | "pdf" | "html";

  @ApiProperty({ type: [RequirementReportSelectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequirementReportSelectionDto)
  selections!: RequirementReportSelectionDto[];
}
