import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateDispatcherDto {
  @ApiProperty({ example: "01048" })
  @IsString()
  @MaxLength(50)
  userName: string;

  @ApiPropertyOptional({ example: "接口测试人员" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
