/**
 * 保存结构化文档请求 DTO。
 * 包含结构化 Markdown、文档文件名及可选的测试要点列表。
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** 单个测试要点的保存数据。 */
export class SaveTestPointDto {
  /** 已有测试要点 ID，更新时传入；新建时可省略 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  /** 所属系统名称 */
  @ApiPropertyOptional({ example: "手机银行" })
  @IsOptional()
  @IsString()
  system?: string;

  /** 系统描述 */
  @ApiPropertyOptional({ example: "移动端渠道" })
  @IsOptional()
  @IsString()
  systemDesc?: string;

  /** 功能模块名称 */
  @ApiPropertyOptional({ example: "积存金1号-主动积存功能关闭" })
  @IsOptional()
  @IsString()
  featureModule?: string;

  /** 功能描述 */
  @ApiPropertyOptional({ example: "关闭主动积存入口并进行引导" })
  @IsOptional()
  @IsString()
  featureDesc?: string;

  /** 测试要点标题 */
  @ApiPropertyOptional({ example: "前端交互与提示验证" })
  @IsOptional()
  @IsString()
  testPoint?: string;

  /** 测试要点详细描述 */
  @ApiPropertyOptional({ example: "验证提示文案和流程阻断" })
  @IsOptional()
  @IsString()
  testPointDesc?: string;
}

/** 保存结构化文档到 MinIO 并同步测试要点的请求体。 */
export class SaveStructDocDto {
  /** 结构化文档文件名，未传则根据需求文档名自动生成 */
  @ApiPropertyOptional({ example: "XQ2026-0295-01-结构化文档.md" })
  @IsOptional()
  @IsString()
  structuredDocName?: string;

  /** 结构化 Markdown 正文，未传则使用库中已有的 tempStructDoc */
  @ApiPropertyOptional({ example: "# 结构化需求文档\n\n..." })
  @IsOptional()
  @IsString()
  tempStructDoc?: string;

  /** 测试要点列表；未传则从 tempStructDoc 自动解析 */
  @ApiPropertyOptional({ type: [SaveTestPointDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveTestPointDto)
  testPoints?: SaveTestPointDto[];
}
