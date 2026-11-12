import { Module } from "@nestjs/common";
import { AuthAuditModule } from "./auth-audit.module";
import { AuthModule } from "./index";
import { AuthAuditController } from "./controller/auth-audit.controller";
import { AuthAuditAdminGuard } from "./guard/auth-audit-admin.guard";

/** 登录审计管理接口：仅授权管理员可查询、导出和下载。 */
@Module({
  imports: [AuthModule, AuthAuditModule],
  controllers: [AuthAuditController],
  providers: [AuthAuditAdminGuard],
})
export class AuthAuditAdminModule {}
