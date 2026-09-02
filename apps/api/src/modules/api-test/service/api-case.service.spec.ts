import { ApiCaseService } from "./api-case.service";

describe("ApiCaseService positive flow generation", () => {
  it("uses the example message without calling aiChat", async () => {
    const job = {
      id: "job-1",
      projectId: "project-1",
      transactionId: "transaction-1",
      status: "running",
      snapshot: {
        profile: { exampleMessage: '{"amount":"1"}' },
        structuredMarkdown: "",
      },
    };
    const task = {
      id: "scenario-1",
      jobId: job.id,
      scenarioKey: "positive_flow",
      scenarioName: "正向流程",
      status: "pending",
      attemptCount: 0,
    };
    const scenarioRepo = {
      find: jest.fn().mockResolvedValue([task]),
      save: jest.fn().mockResolvedValue(task),
    };
    const generateJobRepo = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const aiWorkflow = { runWithAiChat: jest.fn() };
    const service = new ApiCaseService(
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ id: "endpoint-1" }) } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: job.transactionId,
          code: "TX001",
        }),
      } as never,
      {} as never,
      aiWorkflow as never,
      {} as never,
      generateJobRepo as never,
      scenarioRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as never, "persistScenarioCases" as never)
      .mockResolvedValue(1 as never);

    await service.runQueuedGenerateJob({
      projectId: job.projectId,
      transactionId: job.transactionId,
      jobId: job.id,
    });

    expect(aiWorkflow.runWithAiChat).not.toHaveBeenCalled();
    expect((service as any).persistScenarioCases).toHaveBeenCalledWith(
      job,
      { id: "endpoint-1" },
      "TX001",
      task,
      [
        {
          title: "正向流程",
          polarity: "positive",
          changes: [],
        },
      ],
    );
  });
});

describe("ApiCaseService large payload case generation", () => {
  function buildService(
    job: Record<string, unknown>,
    extraTasks: Record<string, unknown>[] = [],
  ) {
    const task = {
      id: "scenario-1",
      jobId: job.id,
      scenarioKey: "positive_flow",
      scenarioName: "正向流程",
      status: "pending",
      attemptCount: 0,
    };
    const scenarioRepo = {
      find: jest.fn().mockResolvedValue([task, ...extraTasks]),
      save: jest.fn().mockResolvedValue(task),
    };
    const generateJobRepo = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const service = new ApiCaseService(
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ id: "endpoint-1" }) } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: job.transactionId,
          code: "TX001",
        }),
      } as never,
      {} as never,
      { runWithAiChat: jest.fn() } as never,
      {} as never,
      generateJobRepo as never,
      scenarioRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as never, "persistScenarioCases" as never)
      .mockResolvedValue(1 as never);
    const persistSpy = jest.spyOn(
      service as never,
      "persistScenarioCases" as never,
    );
    const largePayloadSpy = jest
      .spyOn(service as never, "persistLargePayloadCases" as never)
      .mockResolvedValue(1 as never);
    return { service, largePayloadSpy, persistSpy };
  }

  const buildJob = (largePayloadFieldPath?: string) => ({
    id: "job-1",
    projectId: "project-1",
    transactionId: "transaction-1",
    status: "running",
    snapshot: {
      profile: { exampleMessage: '{"amount":"1"}' },
      structuredMarkdown: "",
      ...(largePayloadFieldPath ? { largePayloadFieldPath } : {}),
    },
  });

  it("appends one large payload case when field path is configured", async () => {
    const job = buildJob("Transaction/Body/request/bizBody/CUST_ID");
    const { service, largePayloadSpy } = buildService(job);

    await service.runQueuedGenerateJob({
      projectId: job.projectId,
      transactionId: job.transactionId,
      jobId: job.id,
    });

    expect(largePayloadSpy).toHaveBeenCalledWith(
      job,
      { id: "endpoint-1" },
      "TX001",
    );
  });

  it("keeps appending auto-detected long-field cases when field path is absent", async () => {
    const job = buildJob();
    const { service, largePayloadSpy } = buildService(job);

    await service.runQueuedGenerateJob({
      projectId: job.projectId,
      transactionId: job.transactionId,
      jobId: job.id,
    });

    expect(largePayloadSpy).toHaveBeenCalledWith(
      job,
      { id: "endpoint-1" },
      "TX001",
    );
  });

  it("skips extra cases when job is cancelled", async () => {
    const job = { ...buildJob("Transaction/Body/request/bizBody/CUST_ID"), status: "cancelled" };
    const { service, largePayloadSpy } = buildService(job);

    await service.runQueuedGenerateJob({
      projectId: job.projectId,
      transactionId: job.transactionId,
      jobId: job.id,
    });

    expect(largePayloadSpy).not.toHaveBeenCalled();
  });

  describe("all_fields_empty scenario", () => {
    const markdown = [
      "请求报文",
      "----",
      "节点路径 | 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述",
      "Transaction/Body/request/bizHeader | transaction_sn | 交易流水号 | 单节点 | VARCHAR2 | 19 | Y |",
      "Transaction/Body/request/bizBody | CUST_ID | 客户号 | 单节点 | VARCHAR2 | 30 | Y |",
    ].join("\n");

    const buildEmptyTask = (job: Record<string, unknown>) => ({
      id: "scenario-2",
      jobId: job.id,
      scenarioKey: "all_fields_empty",
      scenarioName: "全字段空值校验",
      status: "pending",
      attemptCount: 0,
    });

    it("empties every request field in one negative case", async () => {
      const job = {
        ...buildJob(),
        snapshot: {
          profile: { exampleMessage: '{"amount":"1"}' },
          structuredMarkdown: markdown,
        },
      };
      const { service, persistSpy } = buildService(job, [buildEmptyTask(job)]);

      await service.runQueuedGenerateJob({
        projectId: job.projectId,
        transactionId: job.transactionId,
        jobId: job.id,
      });

      expect(persistSpy).toHaveBeenCalledTimes(2);
      const plans = persistSpy.mock.calls[1][4] as Array<{
        title: string;
        polarity: string;
        changes: Array<{ path: string; value: string }>;
      }>;
      expect(plans).toHaveLength(1);
      expect(plans[0].title).toBe("全字段空值");
      expect(plans[0].polarity).toBe("negative");
      expect(plans[0].changes).toEqual([
        {
          path: "Transaction/Body/request/bizHeader/transaction_sn",
          value: "",
        },
        { path: "Transaction/Body/request/bizBody/CUST_ID", value: "" },
      ]);
    });

    it("marks the scenario not applicable without request fields", async () => {
      const job = buildJob();
      const emptyTask = buildEmptyTask(job);
      const { service, persistSpy } = buildService(job, [emptyTask]);

      await service.runQueuedGenerateJob({
        projectId: job.projectId,
        transactionId: job.transactionId,
        jobId: job.id,
      });

      expect(persistSpy).toHaveBeenCalledTimes(1);
      expect(emptyTask.status).toBe("not_applicable");
    });
  });
});
