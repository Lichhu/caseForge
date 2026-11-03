import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateRequirementDto {
  @ApiProperty({ example: "XQ2026-0818-01" })
  @IsString()
  @MaxLength(64)
  projectCode: string;

  @ApiProperty({ example: "订单查询接口改造" })
  @IsString()
  @MaxLength(120)
  projectName: string;

  @ApiProperty({
    example: "项目类版本",
    description: "可选择预设版本或输入自定义版本",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  versionName: string;

  @ApiProperty({ example: "客户服务平台" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  applicationName: string;
}
