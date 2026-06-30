/**
 * 写入「智能接口测试」批量调试数据（直连 MySQL，无需启动 Nest）。
 *
 * 用法：
 *   pnpm --filter @case-forge/api seed:api-test
 *   SEED_PROJECT_COUNT=30 pnpm --filter @case-forge/api seed:api-test
 *
 * 环境变量：
 *   SEED_USER            默认 system（与前端默认用户一致）
 *   SEED_PROJECT_COUNT   默认 24（便于分页 15/25/50 调试）
 *
 * 读取 apps/api/env/.local.env（NODE_ENV=local）。
 * 清理范围：requirementNo 为 XQ2026-9901-xx 或 API-DEMO-001 的 api-test 项目。
 */
import { randomUUID } from "node:crypto";
import { loadApiEnv } from "./load-env";
import mysql from "mysql2/promise";

loadApiEnv();

const SEED_USER = process.env.SEED_USER?.trim() || "system";
const SEED_PROJECT_COUNT = Math.max(
  1,
  Math.min(99, Number(process.env.SEED_PROJECT_COUNT ?? 24) || 24),
);
const SEED_REQ_BATCH = "XQ2026-9901";
const LEGACY_REQUIREMENT_NO = "API-DEMO-001";
const PORT = process.env.PORT ?? "34550";

type EndpointTemplate = {
  name: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
};

type TransactionTemplate = {
  code: string;
  name: string;
  description: string;
  endpoints: EndpointTemplate[];
};

type DomainTemplate = {
  domain: string;
  basePath: string;
  transactions: TransactionTemplate[];
};

const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    domain: "用户中心",
    basePath: "/users",
    transactions: [
      {
        code: "queryUserList",
        name: "查询用户列表",
        description: "分页查询用户列表",
        endpoints: [
          {
            name: "用户列表",
            method: "GET",
            path: "/users",
            summary: "分页查询用户",
            tags: ["用户"],
          },
          {
            name: "用户搜索",
            method: "GET",
            path: "/users",
            summary: "按关键字搜索用户",
            tags: ["用户"],
          },
        ],
      },
      {
        code: "getUserDetail",
        name: "查询用户详情",
        description: "按 ID 查询用户详情",
        endpoints: [
          {
            name: "用户详情",
            method: "GET",
            path: "/users/1",
            summary: "按 ID 查询",
            tags: ["用户"],
          },
        ],
      },
      {
        code: "createUser",
        name: "创建用户",
        description: "新增用户记录",
        endpoints: [
          {
            name: "创建用户",
            method: "POST",
            path: "/users",
            summary: "创建用户",
            tags: ["用户"],
          },
        ],
      },
    ],
  },
  {
    domain: "内容服务",
    basePath: "/posts",
    transactions: [
      {
        code: "queryPostList",
        name: "查询帖子列表",
        description: "分页查询帖子",
        endpoints: [
          {
            name: "帖子列表",
            method: "GET",
            path: "/posts",
            summary: "查询帖子列表",
            tags: ["内容"],
          },
        ],
      },
      {
        code: "createPost",
        name: "创建帖子",
        description: "发布新帖子",
        endpoints: [
          {
            name: "创建帖子",
            method: "POST",
            path: "/posts",
            summary: "创建帖子",
            tags: ["内容"],
          },
        ],
      },
      {
        code: "getPostDetail",
        name: "查询帖子详情",
        description: "按 ID 查询帖子",
        endpoints: [
          {
            name: "帖子详情",
            method: "GET",
            path: "/posts/1",
            summary: "帖子详情",
            tags: ["内容"],
          },
        ],
      },
    ],
  },
  {
    domain: "评论服务",
    basePath: "/comments",
    transactions: [
      {
        code: "queryComments",
        name: "查询评论",
        description: "按帖子查询评论",
        endpoints: [
          {
            name: "评论列表",
            method: "GET",
            path: "/comments",
            summary: "查询评论",
            tags: ["评论"],
          },
        ],
      },
      {
        code: "addComment",
        name: "新增评论",
        description: "对帖子发表评论",
        endpoints: [
          {
            name: "新增评论",
            method: "POST",
            path: "/comments",
            summary: "发表评论",
            tags: ["评论"],
          },
        ],
      },
    ],
  },
  {
    domain: "相册服务",
    basePath: "/albums",
    transactions: [
      {
        code: "queryAlbums",
        name: "查询相册",
        description: "查询相册列表",
        endpoints: [
          {
            name: "相册列表",
            method: "GET",
            path: "/albums",
            summary: "相册列表",
            tags: ["相册"],
          },
        ],
      },
      {
        code: "queryPhotos",
        name: "查询照片",
        description: "按相册查询照片",
        endpoints: [
          {
            name: "照片列表",
            method: "GET",
            path: "/photos",
            summary: "照片列表",
            tags: ["相册"],
          },
        ],
      },
    ],
  },
  {
    domain: "待办服务",
    basePath: "/todos",
    transactions: [
      {
        code: "queryTodos",
        name: "查询待办",
        description: "查询待办事项",
        endpoints: [
          {
            name: "待办列表",
            method: "GET",
            path: "/todos",
            summary: "待办列表",
            tags: ["待办"],
          },
        ],
      },
      {
        code: "createTodo",
        name: "创建待办",
        description: "新增待办事项",
        endpoints: [
          {
            name: "创建待办",
            method: "POST",
            path: "/todos",
            summary: "创建待办",
            tags: ["待办"],
          },
        ],
      },
    ],
  },
  {
    domain: "支付网关",
    basePath: "/payments",
    transactions: [
      {
        code: "createPayment",
        name: "发起支付",
        description: "创建支付订单（演示）",
        endpoints: [
          {
            name: "发起支付",
            method: "POST",
            path: "/posts",
            summary: "演示写接口",
            tags: ["支付"],
          },
        ],
      },
      {
        code: "queryPayment",
        name: "查询支付",
        description: "查询支付状态（演示）",
        endpoints: [
          {
            name: "支付详情",
            method: "GET",
            path: "/posts/1",
            summary: "演示读接口",
            tags: ["支付"],
          },
        ],
      },
    ],
  },
];

function formatRequirementNo(index: number) {
  return `${SEED_REQ_BATCH}-${String(index).padStart(2, "0")}`;
}

function buildStructuredMarkdown(
  requirementNo: string,
  domain: string,
  transactions: TransactionTemplate[],
) {
  const rows = transactions
    .flatMap((tx) =>
      tx.endpoints.map(
        (ep) => `| ${tx.code} | ${ep.name} | ${ep.method} | ${ep.path} | ${ep.summary} |`,
      ),
    )
    .join("\n");

  return `# ${requirementNo} ${domain} OpenAPI（调试）

> seed-api-test-demo 批量生成，端点指向 JSONPlaceholder，可直接跑通执行器。

## 接口清单

| 交易码 | 名称 | 方法 | 路径 | 说明 |
|--------|------|------|------|------|
${rows}
`;
}

function buildCaseRequest(method: string, path: string) {
  return JSON.stringify({
    method,
    path,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? { title: "demo", body: "demo", userId: 1 } : {},
  });
}

function buildCaseRows(
  projectId: string,
  endpointId: string,
  endpoint: EndpointTemplate,
  transactionCode: string,
  caseNoPrefix: string,
) {
  const base = {
    projectId,
    endpointId,
    enabled: 1,
    status: "ready",
    transactionCode,
    preconditions: JSON.stringify(["已选择有效执行环境"]),
    createdBy: SEED_USER,
    modifiedBy: SEED_USER,
  };

  return [
    {
      ...base,
      id: randomUUID(),
      caseNo: `${caseNoPrefix}-01`,
      title: `${endpoint.name} - 正向`,
      description: `验证 ${endpoint.method} ${endpoint.path} 正常返回`,
      priority: "P0",
      polarity: "positive",
      request: buildCaseRequest(endpoint.method, endpoint.path),
      expected: JSON.stringify({ statusCode: [200, 201, 204], statusOnly: true }),
      metadata: JSON.stringify({ source: "ai", inferredFields: ["body"] }),
    },
    {
      ...base,
      id: randomUUID(),
      caseNo: `${caseNoPrefix}-02`,
      title: `${endpoint.name} - 反向缺参`,
      description: `验证 ${endpoint.method} ${endpoint.path} 参数缺失`,
      priority: "P1",
      polarity: "negative",
      request: buildCaseRequest(endpoint.method, endpoint.path),
      expected: JSON.stringify({
        statusCode: [400, 401, 403, 404, 422],
        statusOnly: true,
      }),
      metadata: JSON.stringify({ source: "ai" }),
    },
  ];
}

async function clearSeedProjects(connection: mysql.Connection) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT id FROM case_project
     WHERE platform = 'api-test'
       AND createdBy = ?
       AND (requirementNo LIKE ? OR requirementNo = ?)`,
    [SEED_USER, `${SEED_REQ_BATCH}-%`, LEGACY_REQUIREMENT_NO],
  );

  if (!rows.length) {
    return 0;
  }

  for (const row of rows) {
    const projectId = row.id as string;

    const [runs] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM api_test_run WHERE projectId = ?`,
      [projectId],
    );
    for (const run of runs) {
      await connection.query(`DELETE FROM api_test_run_item WHERE runId = ?`, [run.id]);
    }
    await connection.query(`DELETE FROM api_test_run WHERE projectId = ?`, [projectId]);

    const [sets] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM api_test_execution_set WHERE projectId = ?`,
      [projectId],
    );
    for (const set of sets) {
      await connection.query(`DELETE FROM api_test_execution_set_case WHERE executionSetId = ?`, [
        set.id,
      ]);
    }
    await connection.query(`DELETE FROM api_test_execution_set WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM api_test_case WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM api_test_environment_service WHERE projectId = ?`, [
      projectId,
    ]);
    await connection.query(`DELETE FROM api_test_environment WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM api_endpoint WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM api_doc WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM api_transaction WHERE projectId = ?`, [projectId]);
    await connection.query(`DELETE FROM case_project WHERE id = ?`, [projectId]);
  }

  console.log(`已清理 ${rows.length} 个旧调试项目`);
  return rows.length;
}

async function seedProject(
  connection: mysql.Connection,
  index: number,
  now: Date,
) {
  const domainTemplate = DOMAIN_TEMPLATES[index % DOMAIN_TEMPLATES.length];
  const requirementNo = formatRequirementNo(index);
  const projectTitle = `[调试] ${domainTemplate.domain}接口 · ${String(index).padStart(2, "0")}`;
  const projectId = randomUUID();

  const txCount = 2 + (index % 2);
  const transactions = domainTemplate.transactions.slice(0, txCount);

  await connection.query(
    `INSERT INTO case_project (id, title, description, platform, requirementNo, createdBy, modifiedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, 'api-test', ?, ?, ?, ?, ?)`,
    [
      projectId,
      projectTitle,
      `seed-api-test-demo：${transactions.length} 交易码，JSONPlaceholder 可执行。`,
      requirementNo,
      SEED_USER,
      SEED_USER,
      now,
      now,
    ],
  );

  const envDefaultId = randomUUID();
  const envLocalId = randomUUID();

  await connection.query(
    `INSERT INTO api_test_environment (
      id, projectId, name, baseUrl, headers, variables, isDefault, enabled,
      createdBy, modifiedBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    [
      envDefaultId,
      projectId,
      "JSONPlaceholder（可执行）",
      "https://jsonplaceholder.typicode.com",
      JSON.stringify({ Accept: "application/json" }),
      JSON.stringify({ baseUrl: "https://jsonplaceholder.typicode.com" }),
      SEED_USER,
      SEED_USER,
      now,
      now,
    ],
  );

  await connection.query(
    `INSERT INTO api_test_environment (
      id, projectId, name, baseUrl, headers, isDefault, enabled,
      createdBy, modifiedBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
    [
      envLocalId,
      projectId,
      "本地 API（占位）",
      `http://127.0.0.1:${PORT}`,
      JSON.stringify({}),
      SEED_USER,
      SEED_USER,
      now,
      now,
    ],
  );

  const envServiceId = randomUUID();
  await connection.query(
    `INSERT INTO api_test_environment_service (
      id, projectId, environmentId, name, baseUrl, pathPrefix, headers, variables,
      sortOrder, enabled, createdBy, modifiedBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
    [
      envServiceId,
      projectId,
      envDefaultId,
      "默认服务",
      "https://jsonplaceholder.typicode.com",
      "",
      JSON.stringify({ Accept: "application/json" }),
      JSON.stringify({}),
      SEED_USER,
      SEED_USER,
      now,
      now,
    ],
  );

  let totalEndpoints = 0;
  let totalCases = 0;
  let totalRuns = 0;

  for (let txIndex = 0; txIndex < transactions.length; txIndex += 1) {
    const tx = transactions[txIndex];
    const transactionId = randomUUID();
    const apiDocId = randomUUID();
    const markdown = buildStructuredMarkdown(requirementNo, domainTemplate.domain, [tx]);

    await connection.query(
      `INSERT INTO api_transaction (
        id, projectId, code, name, description, sortOrder, createdBy, modifiedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        projectId,
        tx.code,
        tx.name,
        tx.description,
        txIndex,
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    await connection.query(
      `INSERT INTO api_doc (
        id, projectId, transactionId, structuredMarkdown, tempStructuredMarkdown,
        structuringStatus, createdBy, modifiedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        apiDocId,
        projectId,
        transactionId,
        markdown,
        markdown,
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    const endpointIds: string[] = [];
    for (let epIndex = 0; epIndex < tx.endpoints.length; epIndex += 1) {
      const ep = tx.endpoints[epIndex];
      const endpointId = randomUUID();
      endpointIds.push(endpointId);
      await connection.query(
        `INSERT INTO api_endpoint (
          id, projectId, transactionId, apiDocId, name, method, path, summary, tags, sortOrder, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          endpointId,
          projectId,
          transactionId,
          apiDocId,
          ep.name,
          ep.method,
          ep.path,
          ep.summary,
          JSON.stringify(ep.tags),
          epIndex,
          now,
          now,
        ],
      );
      totalEndpoints += 1;
    }

    const allCases: ReturnType<typeof buildCaseRows> = [];
    for (let epIndex = 0; epIndex < tx.endpoints.length; epIndex += 1) {
      const ep = tx.endpoints[epIndex];
      const caseNoPrefix = `${requirementNo.replace(/-/g, "")}-${tx.code.slice(0, 6).toUpperCase()}-${epIndex + 1}`;
      allCases.push(
        ...buildCaseRows(projectId, endpointIds[epIndex], ep, tx.code, caseNoPrefix),
      );
    }

    for (const c of allCases) {
      await connection.query(
        `INSERT INTO api_test_case (
          id, projectId, endpointId, title, caseNo, description, remark, transactionCode, owner,
          priority, polarity, status, enabled, preconditions, request, expected, metadata,
          createdBy, modifiedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.projectId,
          c.endpointId,
          c.title,
          c.caseNo,
          c.description,
          `交易码 ${tx.code}`,
          c.transactionCode,
          SEED_USER,
          c.priority,
          c.polarity,
          c.status,
          c.enabled,
          c.preconditions,
          c.request,
          c.expected,
          c.metadata,
          c.createdBy,
          c.modifiedBy,
          now,
          now,
        ],
      );
      totalCases += 1;
    }

    const executionSetId = randomUUID();
    const setCases = allCases.slice(0, Math.min(3, allCases.length));
    const passedCount = Math.max(1, setCases.length - 1);
    const failedCount = setCases.length > 1 ? 1 : 0;

    await connection.query(
      `INSERT INTO api_test_execution_set (
        id, projectId, transactionId, name, description, enabled,
        lastRunStatus, lastRunAt, lastPassedCount, lastTotalCount,
        createdBy, modifiedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, 1, 'completed', ?, ?, ?, ?, ?, ?, ?)`,
      [
        executionSetId,
        projectId,
        transactionId,
        `${tx.name} - 冒烟集`,
        `包含 ${setCases.length} 条案例的演示执行集`,
        now,
        passedCount,
        setCases.length,
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    for (let i = 0; i < setCases.length; i += 1) {
      await connection.query(
        `INSERT INTO api_test_execution_set_case (id, executionSetId, caseId, sortOrder, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), executionSetId, setCases[i].id, i, now],
      );
    }

    const runId = randomUUID();
    await connection.query(
      `INSERT INTO api_test_run (
        id, projectId, environmentId, environmentServiceId, executionSetId, transactionId,
        status, totalCount, passedCount, failedCount, errorCount, concurrency,
        createdBy, createdAt, finishedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, 0, 2, ?, ?, ?)`,
      [
        runId,
        projectId,
        envDefaultId,
        envServiceId,
        executionSetId,
        transactionId,
        setCases.length,
        passedCount,
        failedCount,
        SEED_USER,
        now,
        now,
      ],
    );

    await connection.query(
      `UPDATE api_test_execution_set SET lastRunId = ? WHERE id = ?`,
      [runId, executionSetId],
    );

    const statuses = ["passed", "failed", "passed"] as const;
    for (let i = 0; i < setCases.length; i += 1) {
      const c = setCases[i];
      const status = statuses[i] ?? "passed";
      const req = JSON.parse(c.request) as { method: string; path: string; body?: unknown };
      const assertions =
        status === "passed"
          ? [{ name: "HTTP 状态码", passed: true, expected: [200, 201, 204], actual: 200 }]
          : [
              {
                name: "HTTP 状态码",
                passed: false,
                expected: [200, 201, 204],
                actual: 500,
                message: "演示：断言失败",
              },
            ];

      await connection.query(
        `INSERT INTO api_test_run_item (
          id, runId, caseId, caseTitle, status, durationMs,
          requestSnapshot, responseSnapshot, assertions, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          runId,
          c.id,
          c.title,
          status,
          120 + i * 40,
          JSON.stringify({
            method: req.method,
            url: `https://jsonplaceholder.typicode.com${req.path}`,
            headers: { "Content-Type": "application/json" },
            body: req.body ?? null,
          }),
          JSON.stringify({
            status: status === "passed" ? 200 : 500,
            headers: { "content-type": "application/json" },
            body: { demo: true },
          }),
          JSON.stringify(assertions),
          now,
        ],
      );
    }
    totalRuns += 1;
  }

  return {
    projectId,
    requirementNo,
    projectTitle,
    transactions: transactions.length,
    endpoints: totalEndpoints,
    cases: totalCases,
    runs: totalRuns,
  };
}

async function main() {
  const dbConfig = {
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  };

  console.log(
    `连接 MySQL: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`,
  );

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection(dbConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n无法连接数据库 (${dbConfig.host}:${dbConfig.port}): ${message}`);
    if (dbConfig.host !== "localhost" && dbConfig.host !== "127.0.0.1") {
      console.error(
        "提示：seed 脚本默认读取 env/.local.env（NODE_ENV=local）。若需连远程库，请显式指定：NODE_ENV=development pnpm seed:api-test",
      );
    } else {
      console.error("提示：请确认本地 MySQL 已启动，且 env/.local.env 中的账号密码正确。");
    }
    process.exit(1);
  }

  try {
    await clearSeedProjects(connection);

    const now = new Date();
    const summaries: Awaited<ReturnType<typeof seedProject>>[] = [];

    for (let i = 1; i <= SEED_PROJECT_COUNT; i += 1) {
      summaries.push(await seedProject(connection, i, now));
    }

    const totals = summaries.reduce(
      (acc, item) => ({
        transactions: acc.transactions + item.transactions,
        endpoints: acc.endpoints + item.endpoints,
        cases: acc.cases + item.cases,
        runs: acc.runs + item.runs,
      }),
      { transactions: 0, endpoints: 0, cases: 0, runs: 0 },
    );

    console.log("\n接口测试批量调试数据写入完成：");
    console.log(`  用户:         ${SEED_USER}`);
    console.log(`  项目数量:     ${summaries.length}`);
    console.log(`  需求编号范围: ${formatRequirementNo(1)} ~ ${formatRequirementNo(SEED_PROJECT_COUNT)}`);
    console.log(`  交易码总数:   ${totals.transactions}`);
    console.log(`  端点总数:     ${totals.endpoints}`);
    console.log(`  案例总数:     ${totals.cases}`);
    console.log(`  执行记录:     ${totals.runs}`);
    console.log(`  示例项目:     ${summaries[0]?.projectTitle} (${summaries[0]?.projectId})`);
    console.log("\n前端：项目列表 → 平台「接口测试」→ 可测试分页与交易码切换。\n");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("seed 失败:", error);
  process.exit(1);
});
