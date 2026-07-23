import { BadRequestException } from "@nestjs/common";
import { sortCaseIdsByDependencies } from "./case-dependency-order.util";

const testCase = (id: string, caseNo: string, reference?: string) => ({
  id,
  caseNo,
  request: {
    method: "POST",
    path: "/test",
    body: reference ? { value: `\${${reference}.token}` } : {},
  },
});

describe("执行集案例依赖排序", () => {
  it("自动将生产变量的案例排到消费者之前", () => {
    const cases = [
      testCase("11", "CASE-011", "CASE-009"),
      testCase("10", "CASE-010", "CASE-011"),
      testCase("09", "CASE-009"),
    ];

    expect(sortCaseIdsByDependencies(["11", "10", "09"], cases)).toEqual([
      "09",
      "11",
      "10",
    ]);
  });

  it("无依赖案例保持用户原顺序", () => {
    const cases = [testCase("08", "CASE-008"), testCase("07", "CASE-007")];
    expect(sortCaseIdsByDependencies(["08", "07"], cases)).toEqual(["08", "07"]);
  });

  it("引用案例未加入执行集时报错", () => {
    const cases = [
      testCase("11", "CASE-011", "CASE-009"),
      testCase("09", "CASE-009"),
    ];
    expect(() => sortCaseIdsByDependencies(["11"], cases)).toThrow(
      "请先将 CASE-009 加入执行集",
    );
  });

  it("相互引用时报循环依赖", () => {
    const cases = [
      testCase("11", "CASE-011", "CASE-010"),
      testCase("10", "CASE-010", "CASE-011"),
    ];
    expect(() => sortCaseIdsByDependencies(["11", "10"], cases)).toThrow(
      BadRequestException,
    );
    expect(() => sortCaseIdsByDependencies(["11", "10"], cases)).toThrow(
      "循环变量依赖",
    );
  });
});
