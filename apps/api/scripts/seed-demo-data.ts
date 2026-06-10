/**
 * 写入案例编辑台调试用的演示数据（项目 / 结构化文档 / 测试要点 / 案例树）。
 *
 * 用法：pnpm --filter @case-forge/api seed:demo
 */
import "reflect-metadata";
import "../src/register-paths";
import { loadApiEnv } from "./load-env";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { CaseTreeNode, RequirementAnalysis } from "@case-forge/shared";
import { AppModule } from "../src/app.module";
import { CaseEditorService } from "../src/modules/case-editor/service/case-editor.service";
import { CaseConstraintEntity } from "../src/modules/case-editor/entity/case-constraint.entity";
import { CaseProjectEntity } from "../src/modules/project-manage/entity/project.entity";
import { StructDocEntity } from "../src/modules/struct-doc/entity/struct-doc.entity";
import { TestPointEntity } from "../src/modules/struct-doc/entity/test-point.entity";
import { TestPointInstructEntity } from "../src/modules/dynamic-instruct/entity/test-point-instruct.entity";
import { ScenarioEntity } from "../src/modules/scenario/entity/scenario.entity";
import { PromptEntity } from "../src/modules/scenario/entity/prompt.entity";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

loadApiEnv();

const DEMO_REQUIREMENT_NO = "XQ2026-DEMO-001";
const DEMO_PROJECT_TITLE = "[调试] ESB监控平台日志采集程序优化";

const STRUCTURED_MARKDOWN = `# ${DEMO_REQUIREMENT_NO} ESB监控平台日志采集程序优化 - 测试分析

## 需求概述

**需求编号**：${DEMO_REQUIREMENT_NO}
**需求名称**：ESB监控平台日志采集程序优化
**业务范围**：ESB监控平台（后台系统）

> 演示数据：用于本地调试案例编辑台、动态指令与导出功能。

---

## 系统与功能测试分析

### 系统：ESB监控平台

#### 功能模块：日志采集程序逻辑优化

**功能描述**：优化日志采集程序内部逻辑，增加入库线程异常捕获与恢复机制。

**业务规则**：
- 入库线程异常时不应直接终止采集线程
- 异常需记录日志并支持恢复或重试

**测试要点**：
1. **线程异常捕获与恢复验证**
   - **验证点**：模拟入库异常后线程不被终止
   - **测试方法**：注入数据库超时并观察进程状态
2. **异常日志记录完整性验证**
   - **验证点**：错误堆栈与时间戳记录完整
   - **测试方法**：检查系统日志字段

#### 功能模块：日志采集频率与批量提交调整

**功能描述**：批量提交阈值由 150 条调整为 30 条。

**测试要点**：
1. **批量提交参数配置验证**
   - **验证点**：运行时阈值为 30 条
   - **测试方法**：插入 29/30 条数据观察提交时机
`;

function buildAnalysis(): RequirementAnalysis {
  return {
    requirementId: DEMO_REQUIREMENT_NO,
    requirementName: "ESB监控平台日志采集程序优化",
    businessScope: "ESB监控平台（后台系统）",
    summary: "演示项目：日志采集异常处理与批量提交阈值调整。",
    modules: [
      {
        id: randomUUID(),
        system: "ESB监控平台",
        name: "日志采集程序逻辑优化",
        source: "需求文档演示数据",
        description: "入库线程异常捕获与恢复",
        rules: ["异常时不终止采集线程", "记录错误日志并重试"],
        interactions: ["日志采集模块 -> 异常处理 -> 数据库"],
      },
      {
        id: randomUUID(),
        system: "ESB监控平台",
        name: "日志采集频率与批量提交调整",
        source: "需求文档演示数据",
        description: "批量提交阈值 150 调整为 30",
        rules: ["达到 30 条立即提交", "不足 30 条需 Flush"],
        interactions: ["采集模块 -> 批量控制器 -> 数据库"],
      },
    ],
    risks: ["接口超时策略需明确", "重复提交需验证幂等"],
  };
}

function node(
  title: string,
  kind: CaseTreeNode["kind"],
  children: CaseTreeNode[] = [],
  metadata?: CaseTreeNode["metadata"],
): CaseTreeNode {
  return { id: randomUUID(), title, kind, children, metadata };
}

function sixLevelCase(
  title: string,
  caseNature: "正" | "反",
  priority: "高" | "中" | "低",
  conditions: string[],
  steps: string[],
  expectations: string[],
): CaseTreeNode {
  return node(`案例详情 [${caseNature}]`, "case", [
    node(title.replace(/^\[(正向|反向|异常|边界|接口)\]\s*/, ''), "case_title"),
    node(conditions.join("\n"), "case_condition"),
    node(steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), "case_step"),
    node(expectations.map((s, i) => `${i + 1}. ${s}`).join("\n"), "case_expected"),
  ], { caseNature, priority, caseType: "功能测试", knowledgeBaseIds: [] });
}

function buildDemoCaseTree(): CaseTreeNode {
  return node(
    `${DEMO_REQUIREMENT_NO} ESB监控平台日志采集程序优化 - 测试案例`,
    "root",
    [
      node("ESB监控平台", "system", [
        node("日志采集程序逻辑优化", "module", [
          node("线程异常捕获与恢复验证", "requirement", [
            sixLevelCase(
              "[正向] 模拟入库异常后线程继续运行",
              "正",
              "高",
              ["测试库可模拟连接中断", "采集进程已启动"],
              ["注入入库异常", "观察进程与线程状态", "检查错误日志"],
              ["线程未退出", "日志含堆栈与时间", "业务可继续采集"],
            ),
            sixLevelCase(
              "[异常] 连续异常时资源占用稳定",
              "反",
              "中",
              ["可连续触发 5 次入库异常"],
              ["循环触发异常", "监控 CPU/内存 10 分钟"],
              ["无内存泄漏", "CPU 无持续飙升"],
            ),
          ]),
        ]),
        node("日志采集频率与批量提交调整", "module", [
          node("批量提交参数配置验证", "requirement", [
            sixLevelCase(
              "[正向] 累计 30 条日志触发提交",
              "正",
              "高",
              ["批量阈值配置为 30"],
              ["写入 30 条日志", "检查入库批次记录"],
              ["触发一次批量提交", "库内记录数为 30"],
            ),
          ]),
        ]),
      ]),
    ],
  );
}

async function clearDemoProject(projectRepo: Repository<CaseProjectEntity>) {
  const existing = await projectRepo.findOne({
    where: { requirementNo: DEMO_REQUIREMENT_NO },
  });
  if (!existing) {
    return;
  }
  await projectRepo.delete(existing.id);
  console.log(`已删除旧演示项目: ${existing.id}`);
}

async function seedScenarios(scenarioRepo: Repository<ScenarioEntity>, promptRepo: Repository<PromptEntity>) {
  const existing = await scenarioRepo.findOne({ where: { name: "正向流程（演示）" } });
  if (existing) {
    return;
  }

  const positive = await scenarioRepo.save(
    scenarioRepo.create({
      name: "正向流程（演示）",
      description: "演示场景库数据",
      category: "流程类",
      isActive: true,
    }),
  );
  await promptRepo.save(
    promptRepo.create({
      scenarioId: positive.id,
      name: "主流程断言模板",
      content: "覆盖主流程成功路径，断言状态、落库与提示文案一致。",
      tags: ["正向", "演示"],
      usageCount: 0,
      sortOrder: 1,
      isSystem: false,
      isActive: true,
      isDefault: true,
    }),
  );

  const exception = await scenarioRepo.save(
    scenarioRepo.create({
      name: "异常流程（演示）",
      description: "演示场景库数据",
      category: "异常类",
      isActive: true,
    }),
  );
  await promptRepo.save(
    promptRepo.create({
      scenarioId: exception.id,
      name: "异常拦截模板",
      content: "覆盖业务拦截、超时、重复提交与错误码映射。",
      tags: ["异常", "演示"],
      usageCount: 0,
      sortOrder: 1,
      isSystem: false,
      isActive: true,
      isDefault: false,
    }),
  );
  console.log("已写入场景库演示数据");
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const projectRepo = app.get<Repository<CaseProjectEntity>>(
      getRepositoryToken(CaseProjectEntity),
    );
    const structDocRepo = app.get<Repository<StructDocEntity>>(
      getRepositoryToken(StructDocEntity),
    );
    const testPointRepo = app.get<Repository<TestPointEntity>>(
      getRepositoryToken(TestPointEntity),
    );
    const instructRepo = app.get<Repository<TestPointInstructEntity>>(
      getRepositoryToken(TestPointInstructEntity),
    );
    const constraintRepo = app.get<Repository<CaseConstraintEntity>>(
      getRepositoryToken(CaseConstraintEntity),
    );
    const scenarioRepo = app.get<Repository<ScenarioEntity>>(
      getRepositoryToken(ScenarioEntity),
    );
    const promptRepo = app.get<Repository<PromptEntity>>(
      getRepositoryToken(PromptEntity),
    );
    const caseEditorService = app.get(CaseEditorService);

    await clearDemoProject(projectRepo);
    await seedScenarios(scenarioRepo, promptRepo);

    const analysis = buildAnalysis();
    const now = new Date().toISOString();

    const project = await projectRepo.save(
      projectRepo.create({
        title: DEMO_PROJECT_TITLE,
        description: "本地 seed 脚本生成的演示项目，可直接打开案例编辑台调试。",
        requirementNo: DEMO_REQUIREMENT_NO,
      }),
    );

    const structDoc = await structDocRepo.save(
      structDocRepo.create({
        projectId: project.id,
        reqDocName: "ESB日志采集优化.docx",
        reqDocPath: `documents/demo/${project.id}/requirement.docx`,
        structuredDocName: `${DEMO_REQUIREMENT_NO}-structured.md`,
        structDocPath: `documents/demo/${project.id}/structured.md`,
        tempStructDoc: STRUCTURED_MARKDOWN,
        structuringStatus: "completed",
        aiResponse: {
          rawText: STRUCTURED_MARKDOWN,
          fileName: "ESB日志采集优化.docx",
          analysis,
          updatedAt: now,
        },
      }),
    );

    const testPointPayloads = [
      {
        system: "ESB监控平台",
        systemDesc: analysis.businessScope,
        featureModule: "日志采集程序逻辑优化",
        featureDesc: "入库线程异常捕获与恢复",
        testPoint: "线程异常捕获与恢复验证",
        testPointDesc: "验证点：模拟入库异常后线程不被终止",
        status: "生成完成" as const,
      },
      {
        system: "ESB监控平台",
        systemDesc: analysis.businessScope,
        featureModule: "日志采集程序逻辑优化",
        featureDesc: "异常日志记录",
        testPoint: "异常日志记录完整性验证",
        testPointDesc: "验证点：错误堆栈与时间戳完整",
        status: "已编辑" as const,
      },
      {
        system: "ESB监控平台",
        systemDesc: analysis.businessScope,
        featureModule: "日志采集频率与批量提交调整",
        featureDesc: "批量阈值 30 条",
        testPoint: "批量提交参数配置验证",
        testPointDesc: "验证点：运行时阈值为 30 条",
        status: "生成失败" as const,
      },
    ];

    const testPoints: TestPointEntity[] = [];
    for (const item of testPointPayloads) {
      const saved = await testPointRepo.save(
        testPointRepo.create({
          projectId: project.id,
          structDocId: structDoc.id,
          system: item.system,
          systemDesc: item.systemDesc,
          featureModule: item.featureModule,
          featureDesc: item.featureDesc,
          testPoint: item.testPoint,
          testPointDesc: item.testPointDesc,
        }),
      );
      testPoints.push(saved);
      await instructRepo.save(
        instructRepo.create({
          testPointId: saved.id,
          status: item.status,
          naturalText: "演示约束：覆盖正常、异常与边界，断言数据一致性。",
          generateError:
            item.status === "生成失败"
              ? "AI 未返回可解析的案例 JSON（演示数据）"
              : null,
          isFull: true,
          isAppend: false,
        }),
      );
    }

    const constraint = await constraintRepo.save(
      constraintRepo.create({
        projectId: project.id,
        structDocId: structDoc.id,
        input: {
          scenarioTags: ["positive", "exception", "boundary"],
          testDimensions: ["functional", "interface"],
          grouping: "bySystem",
          knowledgeBaseIds: [],
          naturalLanguage: "演示数据：重点验证异常恢复与批量提交。",
          featureInstructions: testPoints.map((tp) => ({
            moduleId: tp.id,
            system: tp.system,
            featureName: `${tp.featureModule} / ${tp.testPoint}`,
            instruction: tp.testPointDesc,
          })),
        },
        markdown: "# 约束指令\n\n演示项目自动生成的约束快照。",
      }),
    );

    const tree = buildDemoCaseTree();
    const run = await caseEditorService.createRun({
      projectId: project.id,
      structDocId: structDoc.id,
      constraintId: constraint.id,
      prompt: "演示案例树 seed 数据",
      model: "seed-demo",
      tree,
      status: "completed",
      sourceTestPointIds: testPoints.map((item) => item.id),
    });

    console.log("\n演示数据写入完成：");
    console.log(`  项目 ID:     ${project.id}`);
    console.log(`  项目名称:    ${project.title}`);
    console.log(`  需求编号:    ${DEMO_REQUIREMENT_NO}`);
    console.log(`  案例运行 ID: ${run.id}`);
    console.log(`  测试要点:    ${testPoints.length} 条`);
    console.log("\n请在前端项目列表中选择该项目，进入「03 案例编辑台」调试。\n");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("seed 失败:", error);
  process.exit(1);
});
