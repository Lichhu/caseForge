import { ApiExecutionService } from "@api-test/service/api-execution.service";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";

describe("多步骤案例变量提取", () => {
  it("主步骤的请求变量不会在步骤汇总后重复提取并覆盖案例状态", async () => {
    const testCase = Object.assign(new ApiTestCaseEntity(), {
      id: "case-1",
      projectId: "p1",
      title: "等额本金验证",
      steps: [
        {
          id: "step-1",
          name: "步骤 1",
          target: { name: "测试环境", address: "http://example.test" },
          request: {
            method: "POST",
            path: "/first",
            body: "<Transaction><Body><request><bizBody><cust_info><cust_num>5340139288</cust_num></cust_info></bizBody></request></Body></Transaction>",
          },
          expected: {},
          exports: [
            {
              name: "cust_num",
              source: "request",
              expression:
                "/Transaction/Body/request/bizBody/cust_info/cust_num/text()",
              required: true,
            },
          ],
        },
        {
          id: "step-2",
          name: "步骤 2",
          target: { name: "测试环境", address: "http://example.test" },
          request: {
            method: "POST",
            path: "/second",
            body: "<Transaction><cust_num>${cust_num}</cust_num></Transaction>",
          },
          expected: {},
          exports: [],
        },
      ],
      request: { method: "POST", path: "/first" },
      expected: {},
      metadata: {
        exports: [
          {
            name: "cust_num",
            source: "request",
            expression:
              "/Transaction/Body/request/bizBody/cust_info/cust_num/text()",
            required: true,
          },
        ],
      },
    });
    const runRepo = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => value),
      findOne: jest.fn(),
    };
    const runItemRepo = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new ApiExecutionService(
      { find: jest.fn().mockResolvedValue([testCase]) } as never,
      runRepo as never,
      runItemRepo as never,
      {
        listServiceAddressBindings: jest.fn().mockResolvedValue([]),
      } as never,
      {} as never,
      {
        resolveDeep: jest.fn(
          async (_projectId: string, value: unknown) => value,
        ),
      } as never,
      {} as never,
    );
    (service as any).executeSingleCase = jest.fn().mockResolvedValue(
      runItemRepo.create({
        runId: "run-1",
        caseId: "case-1",
        caseTitle: "等额本金验证",
        status: "passed",
        durationMs: 10,
        requestSnapshot: {
          steps: [
            {
              stepId: "step-1",
              status: "passed",
              extracted: { cust_num: "5340139288" },
            },
            {
              stepId: "step-2",
              status: "passed",
              extracted: {},
            },
          ],
        },
        responseSnapshot: {
          status: 200,
          headers: {},
          body: { steps: [] },
        },
        assertions: [],
      }),
    );
    runRepo.save.mockImplementation(async (value: Record<string, unknown>) => ({
      ...value,
      id: "run-1",
    }));
    runRepo.findOne.mockImplementation(async () => ({
      id: "run-1",
      projectId: "p1",
      environmentId: "step-1",
      versionCode: "20261022-120000",
      status: "completed",
      totalCount: 1,
      passedCount: 1,
      failedCount: 0,
      errorCount: 0,
      concurrency: 1,
      createdAt: new Date(),
    }));

    const result = await service.runCases({
      projectId: "p1",
      caseIds: ["case-1"],
    });

    expect(result.errorCount).toBe(0);
    expect(result.passedCount).toBe(1);
    expect(runItemRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ status: "passed" }),
    ]);
  });
});
