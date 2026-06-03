/**
 * 构建约束指令的请求 DTO：定义场景标签、测试维度、
 * 分组策略、知识库关联及功能点级动态指令。
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import type {
  FeatureInstruction,
  GroupingStrategy,
  SceneTag,
  TestDimension,
} from "@case-forge/shared";

const sceneTags: SceneTag[] = [
  "positive",
  "negative",
  "exception",
  "boundary",
  "permission",
  "e2e",
  "api",
  "ui",
  "concurrency",
];

const testDimensions: TestDimension[] = [
  "functional",
  "interface",
  "ui",
  "data",
  "nonFunctional",
];

const groupingStrategies: GroupingStrategy[] = [
  "flat",
  "bySystem",
  "byModule",
  "byScenarioType",
  "byPriority",
];

/** 单个功能点的动态生成指令 */
export class FeatureInstructionDto implements FeatureInstruction {
  @ApiProperty({ example: "module-id" })
  @IsString()
  moduleId = "";

  @ApiProperty({ example: "手机银行渠道系统" })
  @IsString()
  system = "";

  @ApiProperty({ example: "积存金2号定期开户校验" })
  @IsString()
  featureName = "";

  @ApiProperty({ example: "重点覆盖有效协议拦截、提示文案和公告弹窗关闭。" })
  @IsString()
  instruction = "";
}

/** 构建案例生成约束的请求体 */
export class BuildConstraintsDto {
  /** 案例极性标签（与 case-skill 对齐：每个测试要点生成正向/反向案例） */
  @ApiProperty({ enum: sceneTags, isArray: true })
  @IsArray()
  @IsIn(sceneTags, { each: true })
  scenarioTags: SceneTag[] = ["positive", "negative"];

  @ApiProperty({ enum: testDimensions, isArray: true })
  @IsArray()
  @IsIn(testDimensions, { each: true })
  testDimensions: TestDimension[] = ["functional", "interface"];

  /** 案例树分组策略 */
  @ApiProperty({ enum: groupingStrategies, default: "bySystem" })
  @IsIn(groupingStrategies)
  grouping: GroupingStrategy = "bySystem";

  @ApiPropertyOptional({ example: ["KB-API-2026-04"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds: string[] = [];

  /** 自然语言补充约束描述 */
  @ApiPropertyOptional({
    example: "重点生成并发冲突和接口超时的案例，忽略 UI 布局验证",
  })
  @IsOptional()
  @IsString()
  naturalLanguage = "";

  /** 各功能模块的动态生成指令 */
  @ApiPropertyOptional({ type: FeatureInstructionDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureInstructionDto)
  featureInstructions: FeatureInstructionDto[] = [];
}
