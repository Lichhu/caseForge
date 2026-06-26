import type { Repository } from "typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { auditFieldsForUpdate } from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";

/** 将项目置顶到侧边栏列表（列表按 updatedAt 降序） */
export async function touchProjectUpdatedAt(
  projectRepo: Repository<CaseProjectEntity>,
  projectId: string,
  extra?: Partial<Pick<CaseProjectEntity, "title" | "requirementNo" | "description">>,
) {
  await projectRepo.update(scopedWhere({ id: projectId }), {
    ...extra,
    updatedAt: new Date(),
    ...auditFieldsForUpdate(),
  });
}
