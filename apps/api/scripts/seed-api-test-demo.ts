/**
 * 写入「智能接口测试」调试演示数据（直连 MySQL，无需启动 Nest）。
 *
 * 用法：
 *   pnpm --filter @case-forge/api seed:api-test
 *
 * 读取 apps/api/env/.local.env（NODE_ENV=local）。
 * 与前端默认用户一致：SEED_USER=system（默认）。
 */
import { randomUUID } from "node:crypto";
import { loadApiEnv } from "./load-env";
import mysql from "mysql2/promise";

loadApiEnv();

const DEMO_REQUIREMENT_NO = "API-DEMO-001";
const DEMO_PROJECT_TITLE = "[调试] 用户中心接口测试（JSONPlaceholder）";
const SEED_USER = process.env.SEED_USER?.trim() || "system";

const DEMO_ENDPOINTS = [
  {
    name: "用户列表",
    method: "GET",
    path: "/users",
    summary: "分页查询用户列表",
    tags: ["用户"],
  },
  {
    name: "用户详情",
    method: "GET",
    path: "/users/1",
    summary: "按 ID 查询用户",
    tags: ["用户"],
  },
  {
    name: "创建帖子",
    method: "POST",
    path: "/posts",
    summary: "创建帖子（演示写接口）",
    tags: ["内容"],
  },
] as const;

const STRUCTURED_MARKDOWN = `# ${DEMO_REQUIREMENT_NO} 用户中心 OpenAPI（演示）

> 本地 seed 数据，端点指向 JSONPlaceholder，可直接跑通执行器。

## 接口清单

| 名称 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 用户列表 | GET | /users | 分页查询用户列表 |
| 用户详情 | GET | /users/1 | 按 ID 查询用户 |
| 创建帖子 | POST | /posts | 创建帖子 |
`;

function buildCaseRows(
  projectId: string,
  endpointId: string,
  endpoint: (typeof DEMO_ENDPOINTS)[number],
) {
  const base = {
    projectId,
    endpointId,
    enabled: 1,
    status: "ready",
    preconditions: JSON.stringify(["已选择有效执行环境"]),
    createdBy: SEED_USER,
    modifiedBy: SEED_USER,
  };
  const request = (method: string, path: string) =>
    JSON.stringify({
      method,
      path,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? { title: "demo", body: "demo", userId: 1 } : {},
    });

  return [
    {
      ...base,
      id: randomUUID(),
      title: `${endpoint.name} - 正向`,
      description: `验证 ${endpoint.method} ${endpoint.path} 正常返回`,
      priority: "P0",
      polarity: "positive",
      request: request(endpoint.method, endpoint.path),
      expected: JSON.stringify({ statusCode: [200, 201, 204], statusOnly: true }),
      metadata: JSON.stringify({ source: "ai", inferredFields: ["body"] }),
    },
    {
      ...base,
      id: randomUUID(),
      title: `${endpoint.name} - 反向缺参`,
      description: `验证 ${endpoint.method} ${endpoint.path} 参数缺失`,
      priority: "P1",
      polarity: "negative",
      request: request(endpoint.method, endpoint.path),
      expected: JSON.stringify({
        statusCode: [400, 401, 403, 404, 422],
        statusOnly: true,
      }),
      metadata: JSON.stringify({ source: "ai" }),
    },
  ];
}

async function clearDemo(connection: mysql.Connection) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT id FROM case_project WHERE requirementNo = ? AND platform = 'api-test' LIMIT 1`,
    [DEMO_REQUIREMENT_NO],
  );
  const projectId = rows[0]?.id as string | undefined;
  if (!projectId) {
    return;
  }

  const [runs] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT id FROM api_test_run WHERE projectId = ?`,
    [projectId],
  );
  for (const run of runs) {
    await connection.query(`DELETE FROM api_test_run_item WHERE runId = ?`, [run.id]);
  }
  await connection.query(`DELETE FROM api_test_run WHERE projectId = ?`, [projectId]);
  await connection.query(`DELETE FROM api_test_case WHERE projectId = ?`, [projectId]);
  await connection.query(`DELETE FROM api_test_environment WHERE projectId = ?`, [
    projectId,
  ]);
  await connection.query(`DELETE FROM api_endpoint WHERE projectId = ?`, [projectId]);
  await connection.query(`DELETE FROM api_doc WHERE projectId = ?`, [projectId]);
  await connection.query(`DELETE FROM case_project WHERE id = ?`, [projectId]);
  console.log(`已删除旧演示项目: ${projectId}`);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  });

  try {
    await clearDemo(connection);

    const projectId = randomUUID();
    const apiDocId = randomUUID();
    const now = new Date();

    await connection.query(
      `INSERT INTO case_project (id, title, description, platform, requirementNo, createdBy, modifiedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, 'api-test', ?, ?, ?, ?, ?)`,
      [
        projectId,
        DEMO_PROJECT_TITLE,
        "seed-api-test-demo 生成：3 端点、6 案例、2 环境、1 条执行记录。",
        DEMO_REQUIREMENT_NO,
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    await connection.query(
      `INSERT INTO api_doc (
        id, projectId, structuredMarkdown, tempStructuredMarkdown,
        structuringStatus, createdBy, modifiedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        apiDocId,
        projectId,
        STRUCTURED_MARKDOWN,
        STRUCTURED_MARKDOWN,
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    const endpointIds: string[] = [];
    for (let i = 0; i < DEMO_ENDPOINTS.length; i += 1) {
      const ep = DEMO_ENDPOINTS[i];
      const endpointId = randomUUID();
      endpointIds.push(endpointId);
      await connection.query(
        `INSERT INTO api_endpoint (
          id, projectId, apiDocId, name, method, path, summary, tags, sortOrder, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          endpointId,
          projectId,
          apiDocId,
          ep.name,
          ep.method,
          ep.path,
          ep.summary,
          JSON.stringify(ep.tags),
          i,
          now,
          now,
        ],
      );
    }

    const allCases: ReturnType<typeof buildCaseRows> = [];
    for (let i = 0; i < DEMO_ENDPOINTS.length; i += 1) {
      allCases.push(...buildCaseRows(projectId, endpointIds[i], DEMO_ENDPOINTS[i]));
    }

    for (const c of allCases) {
      await connection.query(
        `INSERT INTO api_test_case (
          id, projectId, endpointId, title, description, priority, polarity, status,
          enabled, preconditions, request, expected, metadata, createdBy, modifiedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.projectId,
          c.endpointId,
          c.title,
          c.description,
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
    }

    const envDefaultId = randomUUID();
    const envLocalId = randomUUID();
    const port = process.env.PORT ?? "34550";

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
        `http://127.0.0.1:${port}`,
        JSON.stringify({}),
        SEED_USER,
        SEED_USER,
        now,
        now,
      ],
    );

    const runId = randomUUID();
    const sampleCases = allCases.slice(0, 3);
    await connection.query(
      `INSERT INTO api_test_run (
        id, projectId, environmentId, status, totalCount, passedCount, failedCount, errorCount,
        concurrency, createdBy, createdAt, finishedAt
      ) VALUES (?, ?, ?, 'completed', ?, 1, 1, ?, 2, ?, ?, ?)`,
      [
        runId,
        projectId,
        envDefaultId,
        sampleCases.length,
        Math.max(0, sampleCases.length - 2),
        SEED_USER,
        now,
        now,
      ],
    );

    const statuses = ["passed", "failed", "error"] as const;
    for (let i = 0; i < sampleCases.length; i += 1) {
      const c = sampleCases[i];
      const status = statuses[i] ?? "passed";
      const req = JSON.parse(c.request) as { method: string; path: string; body?: unknown };
      const assertions =
        status === "passed"
          ? [{ name: "HTTP 状态码", passed: true, expected: [200, 201, 204], actual: 200 }]
          : status === "failed"
            ? [
                {
                  name: "HTTP 状态码",
                  passed: false,
                  expected: [200, 201, 204],
                  actual: 500,
                  message: "演示：断言失败",
                },
              ]
            : [
                {
                  name: "请求执行",
                  passed: false,
                  expected: "成功发起 HTTP 请求",
                  actual: "演示：连接超时",
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
          JSON.stringify(
            status === "error"
              ? { status: 0, headers: {}, body: null, error: "演示：连接超时" }
              : {
                  status: status === "passed" ? 200 : 500,
                  headers: { "content-type": "application/json" },
                  body: { demo: true },
                },
          ),
          JSON.stringify(assertions),
          now,
        ],
      );
    }

    console.log("\n接口测试演示数据写入完成：");
    console.log(`  用户:        ${SEED_USER}`);
    console.log(`  项目 ID:     ${projectId}`);
    console.log(`  项目名称:    ${DEMO_PROJECT_TITLE}`);
    console.log(`  需求编号:    ${DEMO_REQUIREMENT_NO}`);
    console.log(`  端点数量:    ${DEMO_ENDPOINTS.length}`);
    console.log(`  案例数量:    ${allCases.length}`);
    console.log(`  默认环境:    JSONPlaceholder（可执行）`);
    console.log(`  演示执行 ID: ${runId}`);
    console.log("\n前端：项目列表 → 平台「接口测试」→ 打开该项目。\n");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("seed 失败:", error);
  process.exit(1);
});
