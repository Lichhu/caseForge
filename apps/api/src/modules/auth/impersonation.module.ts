import { Module } from "@nestjs/common";
import { TestPlatformModule } from "@common/test-platform";
import { AuthAuditModule } from "./auth-audit.module";
import { AuthModule } from "./index";
import { ImpersonationController } from "./controller/impersonation.controller";
import { ImpersonationService } from "./service/impersonation.service";

/** 代登录依赖测管平台用户目录，与基础认证模块分开加载。 */
@Module({
  imports: [AuthModule, AuthAuditModule, TestPlatformModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
})
export class ImpersonationModule {}
