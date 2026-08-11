import { groupParallelSteps } from "@case-forge/shared";

describe("groupParallelSteps", () => {
  it("仅合并相邻且标记为与上一步并发的步骤", () => {
    const steps = [
      { id: "1" },
      { id: "2", parallelWithPrevious: true },
      { id: "3", parallelWithPrevious: true },
      { id: "4" },
      { id: "5", parallelWithPrevious: true },
    ];

    expect(
      groupParallelSteps(steps).map((group) => group.map((step) => step.id)),
    ).toEqual([
      ["1", "2", "3"],
      ["4", "5"],
    ]);
  });
});
