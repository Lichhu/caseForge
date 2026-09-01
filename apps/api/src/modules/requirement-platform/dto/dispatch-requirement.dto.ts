/**
 * @file 需求分发请求 DTO
 */
import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

/** 分发：指定认领候选人账号（源库 sys_user.user_name） */
export class DispatchRequirementDto {
  @ApiProperty({ example: "01048", description: "认领候选人账号" })
  @IsString()
  @MaxLength(50)
  dispatchedTo: string;
}
