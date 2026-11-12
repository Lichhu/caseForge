import { Type } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** 切换为指定用户，reason 仅用于审计记录。 */
export class ImpersonationTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  userName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/** 代登录用户搜索条件。 */
export class ImpersonationUserQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}
