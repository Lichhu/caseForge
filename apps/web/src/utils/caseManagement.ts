import type { ApiTestCaseRow } from "@/api/apiTestClient";

type VersionedCase = Pick<ApiTestCaseRow, "projectId" | "metadata"> & {
  transactionId: string;
};

export function versionLabel(row: Pick<ApiTestCaseRow, "metadata">): string {
  return (
    row.metadata?.versionCode ||
    (row.metadata?.generateVersion != null
      ? `V${row.metadata.generateVersion}`
      : "")
  );
}

/** 最新版本按项目与交易分别计算；无版本的手工案例不会被隐藏。 */
export function latestManagedCases<T extends VersionedCase>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  const key = (row: T) => `${row.projectId}:${row.transactionId}`;
  const compare = (a: T, b: T) => {
    const an = a.metadata?.generateVersion;
    const bn = b.metadata?.generateVersion;
    if (an != null && bn != null && an !== bn) return an - bn;
    return versionLabel(a).localeCompare(versionLabel(b), undefined, {
      numeric: true,
    });
  };
  for (const row of rows) {
    if (!versionLabel(row)) continue;
    const previous = latest.get(key(row));
    if (!previous || compare(row, previous) > 0) latest.set(key(row), row);
  }
  return rows.filter(
    (row) =>
      !versionLabel(row) ||
      versionLabel(row) === versionLabel(latest.get(key(row))!),
  );
}
