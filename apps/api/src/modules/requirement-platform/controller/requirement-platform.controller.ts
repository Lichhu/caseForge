/**
 * @file 需求平台 HTTP 接口：需求列表、同步、分发、认领、拒绝、候选人查询
 */
import { Body, Controller, Get, Post, Param, Patch, Delete, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DispatchRequirementDto } from "../dto/dispatch-requirement.dto";
import { RefuseRequirementDto } from "../dto/refuse-requirement.dto";
import { RequirementPlatformService } from "../service/requirement-platform.service";
import { CreateRequirementDto } from "../dto/create-requirement.dto";
import { UpdateRequirementDto } from "../dto/update-requirement.dto";
import { UpdateDispatcherDto } from "../dto/update-dispatcher.dto";

@ApiTags("requirement-platform")
@Controller("requirement-platform")
export class RequirementPlatformController {
  constructor(private readonly platformService: RequirementPlatformService) {}

  /** 需求列表（分发人全量；普通用户仅与自己相关的） */
  @Get("requirements")
  @ApiOperation({ summary: "需求平台列表" })
  async list(
    @Query("page") page = "1",
    @Query("size") size = "20",
    @Query("status") status = "all",
    @Query("keyword") keyword = "",
    @Query("owner") owner = "",
    @Query("application") application = "",
  ) {
    return this.platformService.list({ page: Number(page), size: Number(size), status, keyword, owner, application });
  }

  @Post("requirements")
  @ApiOperation({ summary: "手动创建需求" })
  async create(@Body() dto: CreateRequirementDto) {
    return this.platformService.create(dto);
  }

  @Get("applications")
  @ApiOperation({ summary: "需求所属应用选项" })
  async listApplications() {
    return this.platformService.listApplications();
  }

  @Patch("requirements/:id")
  @ApiOperation({ summary: "编辑需求" })
  async update(@Param("id") id: string, @Body() dto: UpdateRequirementDto) {
    return this.platformService.update(id, dto);
  }

  @Delete("requirements/:id")
  @ApiOperation({ summary: "软删除需求（仅分发人）" })
  async remove(@Param("id") id: string) {
    return this.platformService.remove(id);
  }

  @Patch("requirements/:id/status")
  @ApiOperation({ summary: "更新需求测试状态" })
  async setStatus(@Param("id") id: string, @Body("status") status: "testing" | "completed") {
    return this.platformService.setStatus(id, status);
  }

  @Get("dispatchers")
  @ApiOperation({ summary: "分发人员池" })
  async listDispatchers() {
    return this.platformService.listDispatchers();
  }

  @Post("dispatchers")
  @ApiOperation({ summary: "添加分发人" })
  async addDispatcher(@Body() dto: UpdateDispatcherDto) {
    return this.platformService.addDispatcher(dto);
  }

  @Delete("dispatchers/:id")
  @ApiOperation({ summary: "移除分发人" })
  async removeDispatcher(@Param("id") id: string) {
    return this.platformService.removeDispatcher(id);
  }

  @Get("members")
  @ApiOperation({ summary: "需求人员池" })
  async listMembers() {
    return this.platformService.listPoolMembers();
  }

  @Get("members/candidates")
  @ApiOperation({ summary: "搜索可加入人员池的用户" })
  async searchMemberCandidates(@Query("keyword") keyword = "") {
    return this.platformService.searchPoolCandidates(keyword);
  }

  @Post("members")
  @ApiOperation({ summary: "添加需求人员池成员" })
  async addMember(@Body() dto: UpdateDispatcherDto) {
    return this.platformService.addPoolMember(dto);
  }

  @Delete("members/:id")
  @ApiOperation({ summary: "移除需求人员池成员" })
  async removeMember(@Param("id") id: string) {
    return this.platformService.removePoolMember(id);
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
