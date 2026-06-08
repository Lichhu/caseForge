/**
 * @file 动态指令 HTTP 接口：测试要点列表、单条/批量保存约束
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BatchSaveDynamicInstructDto } from "@dynamic-instruct/dto/batch-save-dynamic-instruct.dto";
import { SaveDynamicInstructDto } from "@dynamic-instruct/dto/save-dynamic-instruct.dto";
import { DynamicInstructService } from "@dynamic-instruct/service/dynamic-instruct.service";

@ApiTags("dynamic-instruct")
@Controller("dynamic-instruct")
export class DynamicInstructController {
  constructor(
    @Inject(DynamicInstructService)
    private readonly dynamicInstructService: DynamicInstructService,
  ) {}

  /**
   * 按项目与结构化文档查询测试要点及动态指令
   */
  @Get("test-points")
  async listTestPoints(
    @Query("projectId") projectId: string,
    @Query("structDocId") structDocId: string,
  ) {
    return this.dynamicInstructService.listByStructDoc(projectId, structDocId);
  }

  /** 获取单个测试要点的动态指令详情 */
  @Get("test-points/:testPointId")
  async getTestPointInstruction(@Param("testPointId") testPointId: string) {
    return this.dynamicInstructService.listOne(testPointId);
  }

  /** 保存单个测试要点的动态指令 */
  @Patch("test-points/:testPointId")
  async saveTestPointInstruction(
    @Param("testPointId") testPointId: string,
    @Body() dto: SaveDynamicInstructDto,
  ) {
    return this.dynamicInstructService.saveByTestPoint(testPointId, dto);
  }

  /** 批量保存多个测试要点的动态指令 */
  @Patch("test-points")
  async batchSaveTestPointInstruction(
    @Body() dto: BatchSaveDynamicInstructDto,
  ) {
    return this.dynamicInstructService.batchSave(dto);
  }
}
