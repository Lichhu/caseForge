/**
 * @file 批量删除测试要点 DTO
 */
import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class DeleteDynamicTestPointsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testPointIds: string[];
}
