import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthAuditExportEntity } from "./entity/auth-audit-export.entity";
import { AuthEventDailyStatEntity } from "./entity/auth-event-daily-stat.entity";
import { AuthEventLogEntity } from "./entity/auth-event-log.entity";
import { AuthAuditMaintenanceService } from "./service/auth-audit-maintenance.service";
import { AuthAuditService } from "./service/auth-audit.service";

/** 审计数据层：只依赖数据库，不依赖认证服务，避免模块循环。 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuthEventLogEntity,
      AuthEventDailyStatEntity,
      AuthAuditExportEntity,
    ]),
  ],
  providers: [AuthAuditService, AuthAuditMaintenanceService],
  exports: [AuthAuditService],
})
export class AuthAuditModule {}
