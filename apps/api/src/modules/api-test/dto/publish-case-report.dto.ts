import { IsString, IsNotEmpty } from "class-validator";

export class PublishCaseReportDto {
  @IsString()
  @IsNotEmpty()
  runId!: string;
  @IsString()
  @IsNotEmpty()
  versionId!: string;
  @IsString()
  @IsNotEmpty()
  applicationId!: string;
  @IsString()
  @IsNotEmpty()
  roundId!: string;
}
