import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";
import {
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  REQUIREMENT_CODE_PATTERN,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

export class CreateRequirementDto {
  @ApiProperty({ example: "XQ2026-0818-01" })
  @IsString()
  @IsNotEmpty({ message: "需求编号不能为空" })
  @MaxLength(INPUT_LIMITS.requirementCode, {
    message: `需求编号不能超过 ${INPUT_LIMITS.requirementCode} 个字符`,
  })
  @Matches(REQUIREMENT_CODE_PATTERN, {
    message: "需求编号格式必须为 XQxxxx-xxxx-xx，例如 XQ2026-0818-01",
  })
  projectCode: string;

  @ApiProperty({ example: "订单查询接口改造" })
  @IsString()
  @IsNotEmpty({ message: "需求名不能为空" })
  @MaxLength(INPUT_LIMITS.requirementName, {
    message: `需求名不能超过 ${INPUT_LIMITS.requirementName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `需求名${DISPLAY_NAME_HINT}`,
  })
  projectName: string;

  @ApiProperty({
    example: "项目类版本",
    description: "可选择预设版本或输入自定义版本",
  })
  @IsString()
  @IsNotEmpty({ message: "需求版本不能为空" })
  @MaxLength(INPUT_LIMITS.requirementVersion, {
    message: `需求版本不能超过 ${INPUT_LIMITS.requirementVersion} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `需求版本${DISPLAY_NAME_HINT}`,
  })
  versionName: string;

  @ApiProperty({ example: "客户服务平台" })
  @IsString()
  @IsNotEmpty({ message: "归属应用不能为空" })
  @MaxLength(INPUT_LIMITS.applicationName, {
    message: `归属应用不能超过 ${INPUT_LIMITS.applicationName} 个字符`,
  })
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `归属应用${DISPLAY_NAME_HINT}`,
  })
  applicationName: string;
}
