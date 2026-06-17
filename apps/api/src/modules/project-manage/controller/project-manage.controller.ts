/**
 * @file 项目管理 HTTP 接口：侧边栏、列表、增删改查
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
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { BatchDeleteProjectsDto } from "@project-manage/dto/batch-delete-projects.dto";
import { CreateProjectDto } from "@project-manage/dto/create-project.dto";
import { UpdateProjectDto } from "@project-manage/dto/update-project.dto";
import type { ProjectPlatform } from "@case-forge/shared";
import { PROJECT_PLATFORMS } from "@case-forge/shared";
import { ProjectManageService } from "@project-manage/service/project-manage.service";

@ApiTags("project-manage")
@Controller("project-manage")
export class ProjectManageController {
  constructor(
    @Inject(ProjectManageService)
    private readonly pmService: ProjectManageService,
  ) {}

  /** 创建新项目 */
  @Post("project")
  @ApiOperation({ summary: "创建项目" })
  async createProject(@Body() dto: CreateProjectDto) {
    return await this.pmService.createProject(dto);
  }

  /** 获取侧边栏展示用的项目列表（含运行次数等摘要字段） */
  @Get("projects/sidebar")
  @ApiOperation({ summary: "获取侧边栏项目列表" })
  @ApiQuery({
    name: "platform",
    enum: PROJECT_PLATFORMS,
    required: false,
    description: "case-forge=案例生成平台，api-test=接口测试平台",
  })
  @ApiQuery({ name: "page", type: Number, required: false, example: 1 })
  @ApiQuery({ name: "size", type: Number, required: false, example: 15 })
  @ApiQuery({
    name: "input",
    type: String,
    required: false,
    description: "项目名称或需求编号",
  })
  async listProjectsForSidebar(
    @Query("platform") platform: ProjectPlatform = "case-forge",
    @Query("page") page: number = 1,
    @Query("size") size: number = 15,
    @Query("input") input?: string,
  ) {
    const result = await this.pmService.listProjects(
      Number(page) || 1,
      Number(size) || 15,
      input,
      platform,
    );
    return {
      count: result.count,
      rows: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        requirementNo: row.requirementNo,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        runCount: row.generationCount,
      })),
    };
  }

  /** 分页查询项目列表，支持按标题或需求编号模糊搜索 */
  @Get("projects")
  @ApiOperation({ summary: "获取项目列表" })
  @ApiQuery({
    name: "input",
    type: String,
    required: false,
    description: "项目名称或需求编号",
  })
  @ApiQuery({ name: "page", type: Number, required: false, example: 1 })
  @ApiQuery({ name: "size", type: Number, required: false, example: 15 })
  @ApiQuery({ name: "platform", enum: PROJECT_PLATFORMS, required: false })
  async listProjects(
    @Query("page") page: number = 1,
    @Query("size") size: number = 15,
    @Query("input") input?: string,
    @Query("platform") platform: ProjectPlatform = "case-forge",
  ) {
    return await this.pmService.listProjects(
      Number(page) || 1,
      Number(size) || 15,
      input,
      platform,
    );
  }

  /** 批量删除项目及其关联数据 */
  @Post("projects/batch-delete")
  @ApiOperation({ summary: "批量删除项目" })
  async batchDeleteProjects(@Body() dto: BatchDeleteProjectsDto) {
    return await this.pmService.batchDeleteProjects(dto.ids);
  }

  /** 获取单个项目详情 */
  @Get("projects/:projectId")
  @ApiOperation({ summary: "获取项目详情" })
  async getProject(@Param("projectId") projectId: string) {
    return await this.pmService.getProject(projectId);
  }

  /** 更新项目标题、描述、需求编号等信息 */
  @Patch("projects/:projectId")
  @ApiOperation({ summary: "修改项目" })
  async updateProject(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return await this.pmService.updateProject(projectId, dto);
  }

  /** 删除单个项目及其关联数据 */
  @Delete("projects/:projectId")
  @ApiOperation({ summary: "删除项目" })
  async deleteProject(@Param("projectId") projectId: string) {
    return await this.pmService.deleteProject(projectId);
  }
}
