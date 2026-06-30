/**
 * 保存案例树编辑结果的请求 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";
import type { CaseTreeNode, MindMapExtras } from "@case-forge/shared";

/** 更新运行记录案例树的请求体 */
export class UpdateRunTreeDto {
  @ApiProperty({ description: "编辑后的案例树" })
  @IsObject()
  tree: CaseTreeNode;

  @ApiPropertyOptional({ description: "思维导图扩展数据（摘要等）" })
  @IsOptional()
  @IsObject()
  mindMapExtras?: MindMapExtras;
}
