import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { ApiCaseStep } from "@case-forge/shared";
import { RequestContext } from "@common/audit/request-context";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "@common/audit/request-context";
import { ApiStepLibraryEntity } from "../entity/api-step-library.entity";

@Injectable()
export class ApiStepLibraryService {
  constructor(
    @InjectRepository(ApiStepLibraryEntity)
    private readonly repo: Repository<ApiStepLibraryEntity>,
  ) {}

  list() {
    return this.repo.find({
      where: { createdBy: RequestContext.getUserName() },
      order: { updatedAt: "DESC" },
    });
  }

  async save(input: { name: string; step: ApiCaseStep }, id?: string) {
    if (!input.name?.trim()) throw new BadRequestException("请填写步骤名称");
    if (!input.step?.request || !input.step?.expected)
      throw new BadRequestException("步骤内容不完整");
    if (!id)
      return this.repo.save(
        this.repo.create({
          name: input.name.trim(),
          step: input.step,
          ...auditFieldsForCreate(),
        }),
      );
    const row = await this.repo.findOne({
      where: { id, createdBy: RequestContext.getUserName() },
    });
    if (!row) throw new NotFoundException("步骤不存在");
    row.name = input.name.trim();
    row.step = input.step;
    return this.repo.save({ ...row, ...auditFieldsForUpdate() });
  }

  async remove(id: string) {
    const result = await this.repo.softDelete({
      id,
      createdBy: RequestContext.getUserName(),
    });
    if (!result.affected) throw new NotFoundException("步骤不存在");
    return { deleted: true };
  }
}
