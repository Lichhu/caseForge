import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AuthImpersonationUser } from "@case-forge/shared";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { TestPlatformSysUserEntity } from "@common/test-platform/entity/test-platform-sys-user.entity";
import { Repository } from "typeorm";
import type { ImpersonationTargetDto } from "../dto/impersonation-target.dto";
import { AuthAuditService } from "./auth-audit.service";
import {
  AuthService,
  type AuthSessionContext,
  type LoginResult,
} from "./auth.service";

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuthAuditService,
    @InjectRepository(TestPlatformSysUserEntity, TEST_PLATFORM_CONNECTION)
    private readonly sysUserRepo: Repository<TestPlatformSysUserEntity>,
  ) {}

  async listUsers(
    cookieHeader: string | undefined,
    keyword = "",
  ): Promise<AuthImpersonationUser[]> {
    this.readAuthorizedContext(cookieHeader);
    const input = keyword.trim();
    const query = this.sysUserRepo
      .createQueryBuilder("user")
      .where("user.status = :status AND user.delFlag = :delFlag", {
        status: "0",
        delFlag: "0",
      });
    if (input) {
      query.andWhere(
        "(user.userName LIKE :keyword OR user.nickName LIKE :keyword)",
        { keyword: `%${escapeLike(input)}%` },
      );
    }

    const users = await query
      .orderBy("user.nickName", "ASC")
      .addOrderBy("user.userName", "ASC")
      .take(100)
      .getMany();
    return users
      .filter((user) => !this.authService.isImpersonationAdmin(user.userName))
      .map((user) => ({
        userName: user.userName,
        nickName: user.nickName || user.userName,
      }));
  }

  async switchUser(
    cookieHeader: string | undefined,
    dto: ImpersonationTargetDto,
    clientIp = "-",
    userAgent: string | null = null,
  ): Promise<LoginResult> {
    const context = this.readAuthorizedContext(cookieHeader);
    const targetUserName = dto.userName.trim();
    if (
      !targetUserName ||
      targetUserName === context.session.user.userName ||
      this.authService.isImpersonationAdmin(targetUserName)
    ) {
      throw new BadRequestException("目标账号不可切换");
    }

    const target = await this.sysUserRepo.findOne({
      where: {
        userName: targetUserName,
        status: "0",
        delFlag: "0",
      },
    });
    if (!target) {
      throw new NotFoundException("目标账号不存在或已停用");
    }

    const login = this.authService.issueImpersonationSession(
      context.claims,
      target.userName,
    );
    await this.auditService.recordStrict({
      eventType: "impersonation_start",
      userName: target.userName,
      actorUserName: context.claims.actorUserName ?? context.claims.userName,
      sessionId: login.sessionId,
      clientIp,
      sourceApp: "impersonation",
      userAgent,
      reason: dto.reason?.trim() || "SYSTEM 账号手动切换",
    });
    return login;
  }

  async exitImpersonation(
    cookieHeader: string | undefined,
    clientIp = "-",
    userAgent: string | null = null,
  ): Promise<LoginResult> {
    const context = this.readAuthorizedContext(cookieHeader);
    if (!context.claims.actorUserName) {
      throw new BadRequestException("当前不是代登录状态");
    }
    const login = this.authService.issueRestoredSession(context.claims);
    await this.auditService.recordStrict({
      eventType: "impersonation_exit",
      userName: context.claims.userName,
      actorUserName: context.claims.actorUserName,
      sessionId: context.claims.jti ?? null,
      clientIp,
      sourceApp: "impersonation",
      userAgent,
      reason: "退出代登录",
    });
    return login;
  }

  private readAuthorizedContext(
    cookieHeader: string | undefined,
  ): AuthSessionContext {
    const context = this.authService.readSessionContext(cookieHeader);
    const actorUserName =
      context.claims.actorUserName ?? context.claims.userName;
    if (!this.authService.isImpersonationAdmin(actorUserName)) {
      throw new ForbiddenException("当前账号无权切换登录身份");
    }
    return context;
  }

}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
