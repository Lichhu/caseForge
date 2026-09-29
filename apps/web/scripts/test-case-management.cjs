const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(
  path.join(__dirname, "../src/utils/caseManagement.ts"),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const exportsObject = {};
new Function("exports", output)(exportsObject);
const { latestManagedCases, versionLabel } = exportsObject;
const row = (id, projectId, transactionId, code, number) => ({
  id,
  projectId,
  transactionId,
  metadata: { versionCode: code, generateVersion: number },
});
const rows = [
  row("old", "p1", "t1", "V2", 2),
  row("new", "p1", "t1", "V10", 10),
  row("peer", "p1", "t1", "V10", 10),
  row("other", "p1", "t2", "V1", 1),
  row("project", "p2", "t1", "V3", 3),
  row("manual", "p1", "t1"),
];
assert.deepEqual(
  latestManagedCases(rows).map((r) => r.id),
  ["new", "peer", "other", "project", "manual"],
);
assert.deepEqual(latestManagedCases([]), []);
assert.equal(versionLabel(row("n", "p", "t", undefined, 2)), "V2");
assert.deepEqual(
  latestManagedCases([
    row("2", "p", "t", "V2"),
    row("10", "p", "t", "V10"),
  ]).map((r) => r.id),
  ["10"],
);
assert.equal(rows.length, 6);
console.log("Case management version filtering: all assertions passed");
