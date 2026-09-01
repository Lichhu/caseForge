/**
 * @file 需求平台 HTTP 接口：需求列表、同步、分发、认领、拒绝、候选人查询
 */
import { Body, Controller, Get, Post, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DispatchRequirementDto } from "../dto/dispatch-requirement.dto";
import { RefuseRequirementDto } from "../dto/refuse-requirement.dto";
import { RequirementPlatformService } from "../service/requirement-platform.service";

@ApiTags("requirement-platform")
@Controller("requirement-platform")
export class RequirementPlatformController {
  constructor(private readonly platformService: RequirementPlatformService) {}

  /** 需求列表（分发人全量；普通用户仅与自己相关的） */
  @Get("requirements")
  @ApiOperation({ summary: "需求平台列表" })
  async list() {
    return this.platformService.list();
  }

  /** 手动触发同步：源库筛选 + 服管校验 + 增量入库（仅分发人） */
  @Post("requirements/sync")
  @ApiOperation({ summary: "手动同步需求" })
  async sync() {
    return this.platformService.sync();
  }

  /** 认领候选人列表（源库在职用户，仅分发人） */
  @Get("requirements/claim-candidates")
  @ApiOperation({ summary: "认领候选人列表" })
  async listClaimCandidates() {
    return this.platformService.listClaimCandidates();
  }

  /** 分发需求给指定候选人（仅分发人） */
  @Post("requirements/:id/dispatch")
  @ApiOperation({ summary: "分发需求" })
  async dispatch(@Param("id") id: string, @Body() dto: DispatchRequirementDto) {
    return this.platformService.dispatch(id, dto.dispatchedTo.trim());
  }

  /** 认领需求（仅被分发人），事务内自动创建接口测试项目 */
  @Post("requirements/:id/claim")
  @ApiOperation({ summary: "认领需求" })
  async claim(@Param("id") id: string) {
    return this.platformService.claim(id);
  }

  /** 拒绝认领（仅被分发人），需求回到待分发 */
  @Post("requirements/:id/refuse")
  @ApiOperation({ summary: "拒绝认领" })
  async refuse(@Param("id") id: string, @Body() dto: RefuseRequirementDto) {
    return this.platformService.refuse(id, dto.reason);
  }
}
