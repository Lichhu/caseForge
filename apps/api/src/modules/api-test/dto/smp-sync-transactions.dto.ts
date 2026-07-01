/**
 * @file SMP 交易码同步请求 DTO
 */
import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class SmpTransactionCandidateDto {
  @ApiProperty({ description: "交易码" })
  @IsString()
  code: string;

  @ApiProperty({ description: "接口名称" })
  @IsString()
  name: string;

  @ApiProperty({ description: "备注/需求名称", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "需求编号" })
  @IsString()
  reqCode: string;

  @ApiProperty({ description: "任务ID" })
  @IsString()
  taskId: string;

  @ApiProperty({ description: "服务编码" })
  @IsString()
  serviceCode: string;

  @ApiProperty({ description: "需求系统ID" })
  @IsString()
  reqSystemId: string;

  @ApiProperty({ description: "响应系统名称", required: false })
  @IsOptional()
  @IsString()
  resSystemName?: string;

  @ApiProperty({ description: "服务属性", required: false })
  @IsOptional()
  @IsString()
  serviceAttribute?: string;

  @ApiProperty({ description: "服务类型", required: false })
  @IsOptional()
  @IsString()
  serviceType?: string;
}

export class SmpSyncTransactionsDto {
  @ApiProperty({ description: "要同步的交易码列表", type: () => [SmpTransactionCandidateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmpTransactionCandidateDto)
  items: SmpTransactionCandidateDto[];
}
