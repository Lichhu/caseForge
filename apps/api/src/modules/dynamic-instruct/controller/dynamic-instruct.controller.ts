/**
 * @file 动态指令 HTTP 接口：测试要点列表、单条/批量保存约束
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BatchSaveDynamicInstructDto } from "@dynamic-instruct/dto/batch-save-dynamic-instruct.dto";
import { CreateDynamicTestPointDto } from "@dynamic-instruct/dto/create-dynamic-test-point.dto";
import { DeleteDynamicTestPointsDto } from "@dynamic-instruct/dto/delete-dynamic-test-points.dto";
import { ListDynamicTestPointsDto } from "@dynamic-instruct/dto/list-dynamic-test-points.dto";
import { SaveDynamicInstructDto } from "@dynamic-instruct/dto/save-dynamic-instruct.dto";
import { UpdateTestPointDefinitionDto } from "@dynamic-instruct/dto/update-test-point-definition.dto";
import { DynamicInstructService } from "@dynamic-instruct/service/dynamic-instruct.service";

@ApiTags("dynamic-instruct")
@Controller("dynamic-instruct")
export class DynamicInstructController {
  constructor(
    @Inject(DynamicInstructService)
    private readonly dynamicInstructService: DynamicInstructService,
  ) {}

  /** 编辑区自动完成与筛选项元数据 */
  @Get("test-points/meta")
  async getTestPointWorkspaceMeta(
    @Query("projectId") projectId: string,
    @Query("structDocId") structDocId: string,
  ) {
    return this.dynamicInstructService.getWorkspaceMeta(projectId, structDocId);
  }

  /** 服务端仍为「生成中」的测试要点（恢复轮询） */
  @Get("test-points/generating")
  async listGeneratingTestPoints(
    @Query("projectId") projectId: string,
    @Query("structDocId") structDocId: string,
  ) {
    return this.dynamicInstructService.listGeneratingTestPoints(
      projectId,
      structDocId,
    );
  }

  /**
   * 分页查询测试要点摘要（支持按功能模块筛选）
   */
  @Get("test-points")
  async listTestPoints(@Query() query: ListDynamicTestPointsDto) {
    return this.dynamicInstructService.listByStructDoc(query);
  }

  /** 新增测试要点 */
  @Post("test-points")
  async createTestPoint(@Body() dto: CreateDynamicTestPointDto) {
    return this.dynamicInstructService.createTestPoint(dto);
  }

  /** 批量删除测试要点 */
  @Delete("test-points")
  async deleteTestPoints(@Body() dto: DeleteDynamicTestPointsDto) {
    return this.dynamicInstructService.deleteTestPoints(dto.testPointIds);
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

  /** 更新单个测试要点的定义字段 */
  @Patch("test-points/:testPointId/definition")
  async updateTestPointDefinition(
    @Param("testPointId") testPointId: string,
    @Body() dto: UpdateTestPointDefinitionDto,
  ) {
    return this.dynamicInstructService.updateTestPointDefinition(
      testPointId,
      dto,
    );
  }

  /** 批量保存多个测试要点的动态指令 */
  @Patch("test-points")
  async batchSaveTestPointInstruction(
    @Body() dto: BatchSaveDynamicInstructDto,
  ) {
    return this.dynamicInstructService.batchSave(dto);
  }
}
