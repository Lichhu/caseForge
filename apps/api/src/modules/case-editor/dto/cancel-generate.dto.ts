import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

/** 取消指定测试要点的案例生成 */
export class CancelGenerateDto {
  @ApiProperty({ type: [String], description: "测试要点 ID 列表" })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testPointIds!: string[];
}
