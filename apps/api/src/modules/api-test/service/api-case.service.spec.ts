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
