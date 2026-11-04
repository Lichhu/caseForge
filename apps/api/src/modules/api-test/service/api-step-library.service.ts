import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { isDbStep, type ApiCaseStep } from "@case-forge/shared";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "@common/audit/request-context";
import { ApiStepLibraryEntity } from "../entity/api-step-library.entity";
import { ApiTestLibraryAccessService } from "./api-test-library-access.service";
import {
  INPUT_LIMITS,
  SAFE_LANGUAGE_IDENTIFIER_PATTERN,
} from "@case-forge/shared";
import { normalizeRequiredDisplayText } from "@common/validation/input-validation.util";

@Injectable()
export class ApiStepLibraryService {
  constructor(
    @InjectRepository(ApiStepLibraryEntity)
    private readonly repo: Repository<ApiStepLibraryEntity>,
    private readonly access: ApiTestLibraryAccessService,
  ) {}

  async list() {
    const [rows, isDispatcher] = await Promise.all([
      this.repo.find({ order: { updatedAt: "DESC" } }),
      this.access.isDispatcher(),
    ]);
    return rows.map((row) => ({
      ...row,
      canManage: this.access.canManage(row.createdBy, isDispatcher),
    }));
  }

  async save(input: { name: string; step: ApiCaseStep }, id?: string) {
    const name = normalizeRequiredDisplayText(
      input.name,
      "步骤名称",
      INPUT_LIMITS.stepName,
    );
    const step = input.step;
    if (!step) throw new BadRequestException("步骤内容不完整");
    step.name = normalizeRequiredDisplayText(
      step.name || name,
      "步骤名称",
      INPUT_LIMITS.stepName,
    );
    const invalidExportName = (step.exports ?? [])
      .map((item) => item.name.trim())
      .find(
        (item) =>
          !item ||
          Array.from(item).length > INPUT_LIMITS.dataFunctionName ||
          !SAFE_LANGUAGE_IDENTIFIER_PATTERN.test(item),
      );
    if (invalidExportName !== undefined) {
      throw new BadRequestException(
        `变量名「${invalidExportName}」仅支持中英文、数字和下划线，且不能以数字开头`,
      );
    }
    // SQL 步骤没有请求报文，改判连接与 SQL 是否齐全
    const incomplete = isDbStep(step)
      ? !step.db?.connectionId || !step.db.sql?.trim()
      : !step.request || !step.expected;
    if (incomplete) throw new BadRequestException("步骤内容不完整");
    if (!id)
      return this.repo.save(
        this.repo.create({
          name,
          step,
          ...auditFieldsForCreate(),
        }),
      );
    const row = await this.repo.findOne({
      where: { id },
    });
    if (!row) throw new NotFoundException("步骤不存在");
    await this.access.assertCanManage(row.createdBy, "步骤");
    row.name = name;
    row.step = step;
    return this.repo.save({ ...row, ...auditFieldsForUpdate() });
  }

  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("步骤不存在");
    await this.access.assertCanManage(row.createdBy, "步骤");
    await this.repo.softDelete({ id });
    return { deleted: true };
  }
}
