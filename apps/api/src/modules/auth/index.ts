import { Module } from "@nestjs/common";
import { AuthAuditModule } from "./auth-audit.module";
import { AuthController } from "@auth/controller/auth.controller";
import { AuthService } from "@auth/service/auth.service";

@Module({
  imports: [AuthAuditModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
