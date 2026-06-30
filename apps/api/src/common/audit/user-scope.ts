import { NotFoundException } from "@nestjs/common";
import {
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from "typeorm";
import { RequestContext } from "./request-context";

/** 系统预置资源的 createdBy 标识 */
export const SYSTEM_OWNER = "system";

/** 当前请求用户（与 createdBy 字段对应） */
export function getScopedUserName() {
  return RequestContext.getUserName();
}

/** 在查询条件上附加 createdBy = 当前用户 */
export function scopedWhere<T extends ObjectLiteral>(
  where: FindOptionsWhere<T> = {} as FindOptionsWhere<T>,
): FindOptionsWhere<T> {
  return {
    ...where,
    createdBy: getScopedUserName(),
  } as FindOptionsWhere<T>;
}

/** 查询当前用户 + 系统预置资源（OR 条件，供 find 使用） */
export function scopedWhereWithSystem<T extends ObjectLiteral>(
  where: FindOptionsWhere<T> = {} as FindOptionsWhere<T>,
): FindOptionsWhere<T>[] {
  return [
    { ...where, createdBy: getScopedUserName() } as FindOptionsWhere<T>,
    { ...where, createdBy: SYSTEM_OWNER } as FindOptionsWhere<T>,
  ];
}

/** QueryBuilder 追加用户隔离 */
export function applyUserScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
) {
  return qb.andWhere(`${alias}.createdBy = :__scopedUser`, {
    __scopedUser: getScopedUserName(),
  });
}

/** 校验实体归属当前用户，否则返回 404（避免泄露是否存在） */
export function assertOwned<T extends { createdBy?: string | null }>(
  entity: T | null | undefined,
  resourceLabel = "资源",
): asserts entity is T {
  if (!entity) {
    throw new NotFoundException(`${resourceLabel}不存在`);
  }
  const owner = (entity.createdBy || SYSTEM_OWNER).trim();
  if (owner !== getScopedUserName()) {
    throw new NotFoundException(`${resourceLabel}不存在`);
  }
}

/** 校验实体对当前用户可见（本人或系统预置），否则 404 */
export function assertAccessible<T extends { createdBy?: string | null }>(
  entity: T | null | undefined,
  resourceLabel = "资源",
): asserts entity is T {
  if (!entity) {
    throw new NotFoundException(`${resourceLabel}不存在`);
  }
  const owner = (entity.createdBy || SYSTEM_OWNER).trim();
  const userName = getScopedUserName();
  if (owner !== userName && owner !== SYSTEM_OWNER) {
    throw new NotFoundException(`${resourceLabel}不存在`);
  }
}

/**
 * 查询当前用户拥有的项目，不存在或不属于当前用户时 404
 */
export async function findOwnedProject<T extends { id: string; createdBy?: string | null }>(
  projectRepo: Repository<T>,
  projectId: string,
): Promise<T> {
  const project = await projectRepo.findOne({
    where: scopedWhere({ id: projectId }) as FindOptionsWhere<T>,
  });
  assertOwned(project, "项目");
  return project;
}
