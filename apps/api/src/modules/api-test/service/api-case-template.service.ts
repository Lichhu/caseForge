import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import ExcelJS from "exceljs";
import { join } from "node:path";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { RequestContext } from "@common/audit/request-context";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";

const PRECONDITIONS = "1.系统运行正常\n2.接口运行正常\n3.各上下游系统交互正常";
const STEPS = "1.调用接口发送报文_请求成功";
const priority = (v?: string) =>
  (({ P1: "高", P2: "中", P3: "低" }) as Record<string, string>)[v || ""] ||
  "中";
function serviceName(markdown?: string) {
  const match = markdown?.match(/服务名称\s*\|\s*([^\n|]+)/);
  return match?.[1]?.trim() || "";
}
function jsonText(value: unknown) {
  return value == null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
}

function exportExpectedResult(row: ApiTestCaseEntity) {
  const description = row.description?.trim();
  if (description) return description;

  return "接口响应结果符合预期";
}

@Injectable()
export class ApiCaseTemplateService {
  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDb: DataSource,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async listSystems() {
    return this.testDb.query(
      "SELECT system_id AS id, system_name AS name FROM t_pre_system WHERE data_status = 0 ORDER BY system_name",
    );
  }
  async listTreeChildren(parentId: string) {
    return this.testDb.query(
      "SELECT id, system_name AS name FROM b_asset_common_system_tree WHERE parent_id = ? AND data_status = 0 ORDER BY system_name",
      [parentId],
    );
  }
  async listDesigners() {
    return this.testDb.query(
      "SELECT user_name AS userName, nick_name AS nickName FROM sys_user WHERE status = '0' AND del_flag = '0' ORDER BY user_id",
    );
  }

  async export(input: {
    caseIds: string[];
    designer: string;
  }) {
    if (!input.caseIds.length || input.caseIds.length > 1000)
      throw new BadRequestException("一次最多导出 1000 条案例");
    const user = RequestContext.getUserName();
    const rows = await this.caseRepo
      .createQueryBuilder("c")
      .innerJoinAndSelect("c.endpoint", "e")
      .innerJoinAndSelect("e.apiDoc", "doc")
      .innerJoinAndSelect(ApiTransactionEntity, "t", "t.id = e.transactionId")
      .innerJoinAndSelect(
        ApiEndpointEntity,
        "endpoint",
        "endpoint.id = c.endpointId",
      )
      .innerJoinAndSelect(CaseProjectEntity, "p", "p.id = c.projectId")
      .where("c.id IN (:...ids)", { ids: input.caseIds })
      .andWhere(
        "c.createdBy = :user AND t.createdBy = :user AND p.createdBy = :user",
        { user },
      )
      .getMany();
    if (rows.length !== input.caseIds.length)
      throw new BadRequestException("部分案例不存在或无权访问");
    const missingApplications = rows.filter(
      (row) => !row.applicationPath?.trim(),
    );
    if (missingApplications.length)
      throw new BadRequestException(
        `有 ${missingApplications.length} 条案例未指定归属应用，请先指定后再导出`,
      );
    const txMap = new Map<string, ApiTransactionEntity>();
    const projectMap = new Map<string, CaseProjectEntity>();
    for (const id of input.caseIds) {
      /* preserve caller order below */ void id;
    }
    const txRows = await this.db.getRepository(ApiTransactionEntity).findBy({
      id: In([
        ...new Set(
          rows.map((r) => (r.endpoint as ApiEndpointEntity).transactionId!),
        ),
      ]),
    });
    txRows.forEach((row) => txMap.set(row.id, row));
    const projects = await this.db
      .getRepository(CaseProjectEntity)
      .findBy({ id: In([...new Set(rows.map((r) => r.projectId))]) });
    projects.forEach((row) => projectMap.set(row.id, row));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      join(__dirname, "../assets/autocase-example.xlsx"),
    );
    const sheet = workbook.getWorksheet("测试案例");
    if (!sheet) throw new BadRequestException("导出模板缺少测试案例页");
    const start = 7;
    const templateRow = sheet.getRow(start);
    rows.forEach((row, index) => {
      const out = sheet.getRow(start + index);
      if (index > 0) {
        for (let c = 1; c <= 19; c++)
          out.getCell(c).style = { ...templateRow.getCell(c).style };
        out.height = templateRow.height;
      }
      const endpoint = row.endpoint as ApiEndpointEntity;
      const tx = txMap.get(endpoint.transactionId || "");
      const project = projectMap.get(row.projectId);
      const name = row.title || "";
      // 功能点取接口文档“服务信息”中的服务名称，不使用交易 ID/交易码。
      const doc = (
        endpoint as ApiEndpointEntity & {
          apiDoc?: {
            structuredMarkdown?: string;
            tempStructuredMarkdown?: string;
          };
        }
      ).apiDoc;
      const service =
        serviceName(doc?.structuredMarkdown || doc?.tempStructuredMarkdown) ||
        tx?.name ||
        tx?.code ||
        "";
      const fields = [
        index + 1,
        `${service} - ${name}`,
        row.applicationPath!,
        name,
        row.polarity === "negative" ? "反" : "正",
        "准生产",
        priority(row.priority),
        input.designer,
        new Date(),
        `${name}${row.description ? ` ${row.description}` : ""}`,
        PRECONDITIONS,
        STEPS,
        exportExpectedResult(row),
        "",
        "",
        "",
        "是",
        `${'api-plaform:'}${row.id}`,
        row.remark || "",
      ];
      fields.forEach((value, col) => (out.getCell(col + 1).value = value));
      out.getCell(9).numFmt = "yyyy-mm-dd";
      void project;
    });
    for (
      let i = start + rows.length;
      i <= Math.max(sheet.rowCount, start + 2);
      i++
    ) {
      if (i > start + rows.length - 1) sheet.getRow(i).values = [];
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      fileName: `测试案例_${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }
}
