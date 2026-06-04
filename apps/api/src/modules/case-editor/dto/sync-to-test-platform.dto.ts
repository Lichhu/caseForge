import { ApiProperty } from "@nestjs/swagger";
import type { CaseTreeNode } from "@case-forge/shared";
import { ArrayNotEmpty, IsArray, IsObject, IsString } from "class-validator";

/** 同步至测管平台：当前编辑中的案例树 + 勾选的案例节点 */
export class SyncToTestPlatformDto {
  @ApiProperty({ description: "编辑台当前案例树（未保存也按此内容同步）" })
  @IsObject()
  tree!: CaseTreeNode;

  @ApiProperty({ type: [String], description: "案例树 case/scenario 节点 ID" })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  caseNodeIds!: string[];
}