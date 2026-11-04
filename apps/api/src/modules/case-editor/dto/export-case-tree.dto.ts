/**
 * 导出案例树的请求 DTO。
 *
 * 导出的案例 ID 数量可能较大，必须通过请求体传递，避免 GET URL 超过 Nginx
 * 的请求行大小限制。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

/** 案例树导出参数 */
export class ExportCaseTreeDto {
  @ApiProperty({ enum: ["excel", "xmind"] })
  @IsIn(["excel", "xmind"])
  format!: "excel" | "xmind";

  @ApiPropertyOptional({
    description: "仅 Excel 生效；为 true 时下载空白导入模板",
  })
  @IsOptional()
  @IsBoolean()
  template?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: "仅 Excel 生效；需要导出的案例节点 ID",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  caseNodeIds?: string[];
}
