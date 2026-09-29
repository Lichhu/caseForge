import { IsString, IsNotEmpty } from "class-validator";

export class PublishCaseReportDto {
  @IsString()
  @IsNotEmpty()
  runId!: string;
}
