/**
 * @file 场景维护 HTTP 接口
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
import { ListScenariosQueryDto } from "@scenario/dto/list-scenarios-query.dto";
import { SaveScenarioDto } from "@scenario/dto/save-scenario.dto";
import { ScenarioService } from "@scenario/service/scenario.service";
import { normalizeScenarioScope, SCENARIO_SCOPE_CASE } from "@case-forge/shared";

@ApiTags("scenario")
@Controller("scenario")
export class ScenarioController {
  constructor(
    @Inject(ScenarioService)
    private readonly scenarioService: ScenarioService,
  ) {}

  /** 获取场景列表 */
  @Get("list")
  async listScenarios(@Query() query: ListScenariosQueryDto) {
    return this.scenarioService.listScenarios(
      normalizeScenarioScope(query.scope, SCENARIO_SCOPE_CASE),
    );
  }

  /** 获取单个场景详情 */
  @Get(":id")
  async getScenario(@Param("id") id: string) {
    return this.scenarioService.getScenario(id);
  }

  /** 创建场景 */
  @Post()
  async createScenario(@Body() dto: SaveScenarioDto) {
    return this.scenarioService.createScenario(dto);
  }

  /** 更新场景 */
  @Patch(":id")
  async updateScenario(@Param("id") id: string, @Body() dto: SaveScenarioDto) {
    return this.scenarioService.updateScenario(id, dto);
  }

  /** 删除场景 */
  @Delete(":id")
  async deleteScenario(@Param("id") id: string) {
    return this.scenarioService.deleteScenario(id);
  }
}
