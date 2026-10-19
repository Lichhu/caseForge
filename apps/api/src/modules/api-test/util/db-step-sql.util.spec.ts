import {
  detectDbSqlKind,
  resolveDbStepMaxAffectedRows,
  resolveDbStepTimeoutMs,
  validateDbStepSql,
  groupParallelSteps,
  isDbStep,
  isHttpStep,
  type ApiCaseStep,
} from "@case-forge/shared";
import { substituteSqlVariables } from "./variable-substitute.util";

describe("SQL 步骤语句校验", () => {
  it("select / with 视为查询", () => {
    expect(detectDbSqlKind("select * from t")).toBe("query");
    expect(detectDbSqlKind("WITH x AS (select 1) select * from x")).toBe(
      "query",
    );
  });

  it("update 视为改数据，其它写语句第一版不支持", () => {
    expect(detectDbSqlKind("update t set a = 1 where id = 2")).toBe("execute");
    expect(detectDbSqlKind("delete from t where id = 1")).toBe("unsupported");
    expect(detectDbSqlKind("drop table t")).toBe("unsupported");
    expect(detectDbSqlKind("insert into t values (1)")).toBe("unsupported");
  });

  it("update 必须带 where", () => {
    expect(validateDbStepSql("update t set a = 1", "execute")).toContain(
      "where",
    );
    expect(
      validateDbStepSql("update t set a = 1 where id = 2", "execute"),
    ).toBeNull();
  });

  it("拒绝分号拼接多条语句，但允许结尾分号", () => {
    expect(
      validateDbStepSql("select 1; update t set a = 1 where id = 1", "query"),
    ).toContain("单条 SQL");
    expect(validateDbStepSql("select * from t;", "query")).toBeNull();
  });

  it("mode 与语句类型必须一致", () => {
    expect(validateDbStepSql("select * from t", "execute")).toContain(
      "改数据模式",
    );
    expect(
      validateDbStepSql("update t set a = 1 where id = 1", "query"),
    ).toContain("查询模式");
  });

  it("字符串字面量与注释里的关键字不影响判断", () => {
    /* 注释里出现 where 不算数，真缺 where 仍要拦 */
    expect(
      validateDbStepSql("update t set a = 1 -- where 只是注释", "execute"),
    ).toContain("where");
    expect(
      validateDbStepSql("select * from t where id = '${id}'", "query"),
    ).toBeNull();
    /* 字符串字面量里的分号不算多语句 */
    expect(validateDbStepSql("select ';' as a from t", "query")).toBeNull();
  });

  it("空 SQL 提示补全", () => {
    expect(validateDbStepSql("   ", "query")).toBe("请填写 SQL");
  });

  it("老的 :参数名 写法给迁移提示", () => {
    expect(
      validateDbStepSql("select * from t where id = :id", "query"),
    ).toContain("${变量名}");
    // PostgreSQL 的 :: 类型转换不算占位符
    expect(
      validateDbStepSql("select a::text from t where id = '1'", "query"),
    ).toBeNull();
  });
});

describe("SQL 取值替换", () => {
  it("把 ${变量名} 替换成真实值", () => {
    expect(
      substituteSqlVariables(
        "update t_switch set status = 1 where id = '${switchId}'",
        { switchId: "1001" },
      ),
    ).toBe("update t_switch set status = 1 where id = '1001'");
  });

  it("值里的单引号按 SQL 字面量转义，语句不会被写坏", () => {
    expect(
      substituteSqlVariables("select * from t where name = '${name}'", {
        name: "O'Brien",
      }),
    ).toBe("select * from t where name = 'O''Brien'");
  });

  it("没取到的变量保持原样，交给执行阶段报错", () => {
    expect(
      substituteSqlVariables("select * from t where id = '${missing}'", {}),
    ).toBe("select * from t where id = '${missing}'");
  });
});

describe("SQL 步骤上下限归一化", () => {
  it("超时缺省 10 秒，最小 1 秒、最大 60 秒", () => {
    expect(resolveDbStepTimeoutMs(undefined)).toBe(10000);
    expect(resolveDbStepTimeoutMs(10)).toBe(1000);
    expect(resolveDbStepTimeoutMs(999999)).toBe(60000);
    expect(resolveDbStepTimeoutMs(3000)).toBe(3000);
  });

  it("影响行数上限缺省 500", () => {
    expect(resolveDbStepMaxAffectedRows(undefined)).toBe(500);
    expect(resolveDbStepMaxAffectedRows(0)).toBe(1);
    expect(resolveDbStepMaxAffectedRows(100)).toBe(100);
  });
});

describe("步骤类型与并发分组", () => {
  const httpStep = (id: string, parallel = false): ApiCaseStep => ({
    id,
    name: id,
    request: { method: "GET", path: "/" },
    expected: {},
    exports: [],
    ...(parallel ? { parallelWithPrevious: true } : {}),
  });
  const dbStep = (id: string): ApiCaseStep => ({
    id,
    kind: "db",
    name: id,
    db: { connectionId: "db-1", mode: "query", sql: "select 1" },
    exports: [],
  });

  it("kind 缺省的步骤按请求步骤处理", () => {
    expect(isHttpStep(httpStep("a"))).toBe(true);
    expect(isDbStep(httpStep("a"))).toBe(false);
    expect(isDbStep(dbStep("b"))).toBe(true);
  });

  it("SQL 步骤不与相邻步骤并发，自成一组", () => {
    const groups = groupParallelSteps([
      dbStep("sql-1"),
      httpStep("http-1", true),
      httpStep("http-2", true),
    ]);
    expect(groups.map((group) => group.map((step) => step.id))).toEqual([
      ["sql-1"],
      ["http-1", "http-2"],
    ]);
  });

  it("请求步骤之间仍按原规则并发", () => {
    const groups = groupParallelSteps([
      httpStep("a"),
      httpStep("b", true),
      httpStep("c"),
    ]);
    expect(groups.map((group) => group.map((step) => step.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });
});
