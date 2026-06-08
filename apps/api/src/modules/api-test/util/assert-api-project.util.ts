import { BadRequestException } from "@nestjs/common";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { findOwnedProject } from "../../../common/audit/user-scope";
import { Repository } from "typeorm";

export async function assertApiTestProject(
  projectRepo: Repository<CaseProjectEntity>,
  projectId: string,
) {
  const project = await findOwnedProject(projectRepo, projectId);
  if (project.platform !== "api-test") {
    throw new BadRequestException("项目不属于智能接口测试平台");
  }
  return project;
}
