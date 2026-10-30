import { ensureApiStepTables } from "./api-schema-migrations.util";

describe("ensureApiStepTables", () => {
  it("aligns legacy UUID columns before creating the scoped debug index", async () => {
    const queries: string[] = [];
    const columns = new Map<string, string>([
      ["projectId", "varchar(255)"],
      ["caseId", "varchar(255)"],
      ["caseSource", "varchar(16)"],
      ["stepId", "varchar(255)"],
    ]);
    const runner = {
      async query(sql: string, params?: unknown[]) {
        queries.push(sql);
        const normalized = sql.trim().toLowerCase();
        if (normalized.startsWith("show tables like ?")) {
          return ["api_step_library", "api_step_debug_record"].includes(
            String(params?.[0]),
          )
            ? [{ table: params?.[0] }]
            : [];
        }
        if (
          normalized.startsWith("show columns from") &&
          normalized.includes(" like ?")
        ) {
          return columns.has(String(params?.[0]))
            ? [{ Field: params?.[0] }]
            : [];
        }
        if (normalized === "show columns from api_step_debug_record") {
          return [...columns].map(([Field, Type]) => ({ Field, Type }));
        }
        if (normalized.startsWith("show index from")) {
          return [];
        }
        if (normalized.startsWith("alter table api_step_debug_record")) {
          columns.set("projectId", "varchar(36)");
          columns.set("caseId", "varchar(36)");
          columns.set("stepId", "varchar(36)");
        }
        return [];
      },
    };

    await ensureApiStepTables(runner);

    const alignIndex = queries.findIndex((sql) =>
      sql.includes("MODIFY projectId VARCHAR(36)"),
    );
    const createIndex = queries.findIndex((sql) =>
      sql.includes("CREATE INDEX idx_api_step_debug_scope_step"),
    );
    expect(alignIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(alignIndex);
    expect(queries[createIndex]).toContain(
      "(projectId, caseSource, caseId, stepId, createdAt)",
    );
  });
});
