/**
 * 局部重生成案例节点的请求 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

/** 局部重生成案例节点的请求体 */
export class RegenerateNodeDto {
  @ApiProperty()
  @IsString()
  runId: string;

  @ApiProperty()
  @IsString()
  nodeId: string;

  @ApiProperty({ example: "补充接口超时与重复提交场景" })
  @IsString()
  @MinLength(2)
  instruction: string;

  /** 扩展模式：append 追加、replace 替换、complete 仅补全空子节点 */
  @ApiPropertyOptional({
    enum: ["append", "replace", "complete"],
    default: "append",
  })
  @IsOptional()
  @IsIn(["append", "replace", "complete"])
  mode: "append" | "replace" | "complete" = "append";
}
