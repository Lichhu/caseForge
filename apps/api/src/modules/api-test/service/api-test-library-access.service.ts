import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { RequestContext } from "@common/audit/request-context";
import { ApiRequirementDispatcherEntity } from "@requirement-platform/entity/api-requirement-dispatcher.entity";
import { Repository } from "typeorm";

/** 全局测试库：全员可见可用，创建人或分发人可维护。 */
@Injectable()
export class ApiTestLibraryAccessService {
  constructor(
    @InjectRepository(ApiRequirementDispatcherEntity)
    private readonly dispatcherRepo: Repository<ApiRequirementDispatcherEntity>,
  ) {}

  async isDispatcher() {
    return this.dispatcherRepo.exists({
      where: { userName: RequestContext.getUserName() },
    });
  }

  canManage(createdBy: string | null | undefined, isDispatcher: boolean) {
    if (isDispatcher) return true;
    return (createdBy || "system").trim() === RequestContext.getUserName();
  }

  async assertCanManage(
    createdBy: string | null | undefined,
    resourceLabel: string,
  ) {
    if (this.canManage(createdBy, await this.isDispatcher())) return;
    throw new ForbiddenException(
      `${resourceLabel}仅创建人或管理员可修改或删除`,
    );
  }
}
