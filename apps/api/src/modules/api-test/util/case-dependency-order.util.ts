import { BadRequestException } from "@nestjs/common";
import type { ApiCaseRequest } from "@case-forge/shared";

export type DependencyCase = {
  id: string;
  caseNo?: string;
  request: ApiCaseRequest;
};

export function sortCaseIdsByDependencies(
  caseIds: string[],
  allCases: DependencyCase[],
) {
  const selectedIds = new Set(caseIds);
  const selectedCases = allCases.filter((item) => selectedIds.has(item.id));
  const byNumber = new Map(
    allCases.filter((item) => item.caseNo).map((item) => [item.caseNo!, item]),
  );
  const dependencies = new Map(caseIds.map((id) => [id, new Set<string>()]));

  for (const consumer of selectedCases) {
    for (const match of JSON.stringify(consumer.request).matchAll(/\$\{([^{}]+)\}/g)) {
      const dot = match[1].lastIndexOf(".");
      if (dot < 1) continue;
      const producer = byNumber.get(match[1].slice(0, dot));
      if (!producer) continue;
      if (!selectedIds.has(producer.id)) {
        throw new BadRequestException(
          `案例 ${consumer.caseNo} 引用了 ${producer.caseNo} 的变量，请先将 ${producer.caseNo} 加入执行集`,
        );
      }
      if (producer.id === consumer.id) {
        throw new BadRequestException(`案例 ${consumer.caseNo} 不能引用自身共享变量`);
      }
      dependencies.get(consumer.id)!.add(producer.id);
    }
  }

  const remaining = new Set(caseIds);
  const sorted: string[] = [];
  while (remaining.size) {
    const next = caseIds.find(
      (id) =>
        remaining.has(id) &&
        [...dependencies.get(id)!].every(
          (dependency) => !remaining.has(dependency),
        ),
    );
    if (!next) {
      throw new BadRequestException(
        "执行集案例存在循环变量依赖，请先移除相互引用",
      );
    }
    sorted.push(next);
    remaining.delete(next);
  }
  return sorted;
}
