import { Module } from "@nestjs/common";
import { AuthController } from "@auth/controller/auth.controller";
import { AuthService } from "@auth/service/auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
