import type { ApiTransport } from "@case-forge/shared";
import { Allow, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePreproductionStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  targetAddress?: string;

  @IsOptional()
  @IsIn(["http", "tcp", "mq", "tuxedo", "other"])
  transport?: ApiTransport;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  encoding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  path?: string;

  @IsOptional()
  @Allow()
  body?: unknown;

  /** 完整请求步骤；由前端步骤编辑器生成，服务端只合并允许的字段 */
  @IsOptional()
  @Allow()
  step?: Record<string, unknown>;
}
