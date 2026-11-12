import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  AUTH_AUDIT_EVENT_TYPES,
  AUTH_AUDIT_MAX_PAGE_SIZE,
  type AuthAuditEventType,
} from "@case-forge/shared";

/** 审计明细查询参数；from/to 必填，避免无时间范围全表扫描。 */
export class ListAuthAuditEventsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsIn(AUTH_AUDIT_EVENT_TYPES)
  eventType?: AuthAuditEventType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userName?: string;

  @IsOptional()
  @IsIP()
  ip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUTH_AUDIT_MAX_PAGE_SIZE)
  limit?: number;
}

/** 审计日汇总查询参数。 */
export class AuthAuditSummaryQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

/** 创建异步导出任务参数。 */
export class CreateAuthAuditExportDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsIn(AUTH_AUDIT_EVENT_TYPES)
  eventType?: AuthAuditEventType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userName?: string;

  @IsOptional()
  @IsIP()
  ip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  sessionId?: string;
}
