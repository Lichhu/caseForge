import { ApiAssertionGenerateQueueService } from "@api-test/service/api-assertion-generate-queue.service";
import {
  ApiAssertionGenerateJobEntity,
  API_ASSERTION_GENERATE_JOB_STATUS,
} from "@api-test/entity/api-assertion-generate-job.entity";
import { RequestContext } from "@common/audit/request-context";

jest.mock("@case-editor/util/case-generate-concurrency", () => {
  const fn = jest.fn(async (cb: () => Promise<unknown>) => cb());
  return {
    withCaseGenerateSlot: fn,
    registerCaseGenerateSlotReleaseHook: jest.fn(() => () => {}),
    getCaseGenerateActiveCount: jest.fn(() => 0),
    getCaseGenerateConcurrency: jest.fn(() => 2),
    getCaseGenerateWaitingCount: jest.fn(() => 0),
  };
});

jest.mock("@api-test/util/api-case-ai.util", () => ({
  generateAssertionsFromResponse: jest
    .fn()
    .mockResolvedValue([{ type: "status", operator: "eq", expected: 200 }]),
}));

const { generateAssertionsFromResponse } = jest.requireMock(
  "@api-test/util/api-case-ai.util",
);

type JobRow = Partial<ApiAssertionGenerateJobEntity> & {
  id: string;
  projectId: string;
  transactionId: string;
  status: string;
  queuedAt: Date;
  body: string;
  headers: Record<string, string>;
  transport: string;
  messageFormat: string;
  polarity: string;
  statusCode: number;
};

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: overrides.id ?? `job-${Math.random().toString(36).slice(2, 10)}`,
    projectId: overrides.projectId ?? "p1",
    transactionId: overrides.transactionId ?? "t1",
    caseId: overrides.caseId ?? null,
    transport: overrides.transport ?? "http",
    messageFormat: overrides.messageFormat ?? "json",
    polarity: overrides.polarity ?? "positive",
    statusCode: overrides.statusCode ?? 200,
    headers: overrides.headers ?? {},
    body: overrides.body ?? "{}",
    status: overrides.status ?? "queued",
    queuedAt: overrides.queuedAt ?? new Date(),
    startedAt: overrides.startedAt ?? null,
    finishedAt: overrides.finishedAt ?? null,
    errorMessage: overrides.errorMessage ?? null,
    resultAssertions: overrides.resultAssertions ?? null,
    createdBy: overrides.createdBy ?? "test-user",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface FindOpts {
  where?: Record<string, unknown>;
  order?: Record<string, string>;
}

function createRepoMock() {
  const store = new Map<string, JobRow>();

  function filterRows(
    rows: JobRow[],
    where?: Record<string, unknown>,
  ): JobRow[] {
    if (!where) return rows;
    return rows.filter((r: JobRow) => {
      for (const [key, val] of Object.entries(where)) {
        if (
          val &&
          typeof val === "object" &&
          "_type" in (val as Record<string, unknown>)
        ) {
          const typed = val as { _type: string; _value?: string[] };
          if (typed._type === "in") {
            if (
              !typed._value!.includes(
                (r as Record<string, unknown>)[key] as string,
              )
            )
              return false;
          } else if (typed._type === "isNull") {
            if ((r as Record<string, unknown>)[key] != null) return false;
          }
        } else if (val !== undefined) {
          if ((r as Record<string, unknown>)[key] !== val) return false;
        }
      }
      return true;
    });
  }

  function sortRows(rows: JobRow[], order?: Record<string, string>): JobRow[] {
    if (!order) return rows;
    const [field, dir] = Object.entries(order)[0];
    return [...rows].sort((a: JobRow, b: JobRow) => {
      const av = (a as Record<string, unknown>)[field] as Date | unknown;
      const bv = (b as Record<string, unknown>)[field] as Date | unknown;
      if (av instanceof Date && bv instanceof Date) {
        return dir === "ASC"
          ? av.getTime() - bv.getTime()
          : bv.getTime() - av.getTime();
      }
      return 0;
    });
  }

  const repo = {
    find: jest.fn(async (opts?: FindOpts): Promise<JobRow[]> => {
      const rows = filterRows([...store.values()], opts?.where);
      return sortRows(rows, opts?.order);
    }),

    findOne: jest.fn(async (opts?: FindOpts): Promise<JobRow | null> => {
      const rows = filterRows([...store.values()], opts?.where);
      const sorted = sortRows(rows, opts?.order);
      return sorted[0] ?? null;
    }),

    create: jest.fn(
      (data: Partial<JobRow>): JobRow => ({ ...makeJob(), ...data }),
    ),

    save: jest.fn(
      async (entity: JobRow | JobRow[]): Promise<JobRow | JobRow[]> => {
        const entities = Array.isArray(entity) ? entity : [entity];
        for (const e of entities) {
          if (!e.id) e.id = `job-${Math.random().toString(36).slice(2, 10)}`;
          store.set(e.id, e);
        }
        return Array.isArray(entity) ? entities : entities[0];
      },
    ),

    update: jest.fn(
      async (
        criteria: { id?: string; status?: string },
        data: Partial<JobRow>,
      ) => {
        let affected = 0;
        for (const row of store.values()) {
          const idMatch = criteria.id ? row.id === criteria.id : true;
          const statusMatch = criteria.status
            ? row.status === criteria.status
            : true;
          if (idMatch && statusMatch) {
            Object.assign(row, data);
            affected++;
          }
        }
        return { affected };
      },
    ),

    delete: jest.fn().mockResolvedValue({ affected: 1 }),

    _store: store,
    _reset: () => store.clear(),
  };

  return repo;
}

function createAiWorkflowMock() {
  return {
    canUseAiChat: jest.fn().mockReturnValue(true),
    runWithAiChat: jest.fn().mockResolvedValue({ text: "[]" }),
    parseJsonArray: jest.fn().mockReturnValue([]),
  };
}

function buildService(opts?: { suppressPump?: boolean }) {
  const jobRepo = createRepoMock();
  const aiWorkflow = createAiWorkflowMock();
  const service = new ApiAssertionGenerateQueueService(
    jobRepo as never,
    aiWorkflow as never,
  );
  if (opts?.suppressPump) {
    jest.spyOn(service, "pump").mockResolvedValue(undefined);
  }
  return { service, jobRepo, aiWorkflow };
}

function In(values: string[]) {
  return { _type: "in", _value: values };
}

function IsNull() {
  return { _type: "isNull" };
}

const baseInput = {
  projectId: "p1",
  transactionId: "t1",
  transport: "http",
  messageFormat: "json",
  polarity: "positive" as const,
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: { key: "value" },
};

describe("ApiAssertionGenerateQueueService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (generateAssertionsFromResponse as jest.Mock).mockResolvedValue([
      { type: "status", operator: "eq", expected: 200 },
    ]);
  });

  it("logs rejected background work instead of leaving it unhandled", async () => {
    const { service } = buildService();
    const error = jest.spyOn((service as any).logger, "error").mockImplementation();

    (service as any).background(Promise.reject(new Error("database down")));
    await new Promise((resolve) => setImmediate(resolve));

    expect(error).toHaveBeenCalledWith("后台队列异常: database down");
  });

  describe("enqueue", () => {
    it("creates a new queued job when none exists", async () => {
      const { service, jobRepo } = buildService({ suppressPump: true });
      const job = await service.enqueue(baseInput);

      expect(job.status).toBe("queued");
      expect(job.projectId).toBe("p1");
      expect(job.transport).toBe("http");
      expect(jobRepo.save).toHaveBeenCalledTimes(1);
      expect(jobRepo.create).toHaveBeenCalledTimes(1);
    });

    it("replaces existing queued job with updated params", async () => {
      const { service, jobRepo } = buildService({ suppressPump: true });
      const first = await service.enqueue(baseInput);
      jobRepo.find.mockClear();
      jobRepo.save.mockClear();

      const updated = await service.enqueue({
        ...baseInput,
        statusCode: 404,
        body: { error: "not found" },
      });

      expect(updated.id).toBe(first.id);
      expect(updated.statusCode).toBe(404);
      expect(updated.body).toBe(JSON.stringify({ error: "not found" }));
      expect(updated.status).toBe("queued");
    });

    it("returns existing running job without modification", async () => {
      const { service, jobRepo } = buildService({ suppressPump: true });
      const first = await service.enqueue(baseInput);

      // Simulate transition to running
      first.status = "running";
      first.startedAt = new Date();
      jobRepo._store.set(first.id, first);

      jobRepo.find.mockClear();
      jobRepo.save.mockClear();

      const result = await service.enqueue({
        ...baseInput,
        statusCode: 500,
      });

      expect(result.id).toBe(first.id);
      expect(result.statusCode).toBe(200); // unchanged
      expect(jobRepo.save).not.toHaveBeenCalled();
    });

    it("serializes body as string", async () => {
      const { service, jobRepo } = buildService({ suppressPump: true });
      const job = await service.enqueue({
        ...baseInput,
        body: { nested: { value: 123 } },
      });

      expect(job.body).toBe(JSON.stringify({ nested: { value: 123 } }));
    });

    it("preserves string body as-is", async () => {
      const { service } = buildService({ suppressPump: true });
      const job = await service.enqueue({
        ...baseInput,
        body: "<xml>raw</xml>",
      });

      expect(job.body).toBe("<xml>raw</xml>");
    });

    it("sets createdBy from RequestContext", async () => {
      const { service } = buildService({ suppressPump: true });
      RequestContext.run("alice", async () => {
        const job = await service.enqueue(baseInput);
        expect(job.createdBy).toBe("alice");
      });
    });
  });

  describe("recoverInterruptedJobs", () => {
    it("resets running jobs back to queued", async () => {
      const { service, jobRepo } = buildService();

      const job1 = makeJob({
        id: "r1",
        status: "running",
        startedAt: new Date(),
      });
      const job2 = makeJob({
        id: "r2",
        status: "running",
        startedAt: new Date(),
      });
      const completed = makeJob({ id: "c1", status: "completed" });
      jobRepo._store.set("r1", job1);
      jobRepo._store.set("r2", job2);
      jobRepo._store.set("c1", completed);

      await service.recoverInterruptedJobs();

      const saved = jobRepo.save.mock.calls[0]?.[0] as JobRow[];
      expect(saved).toHaveLength(2);
      expect(saved.every((j) => j.status === "queued")).toBe(true);
      expect(saved.every((j) => j.startedAt === null)).toBe(true);
      expect(saved.every((j) => j.finishedAt === null)).toBe(true);
      expect(
        saved.every((j) => j.errorMessage === "服务重启，任务已重新入队"),
      ).toBe(true);

      // completed job should not be touched
      expect(jobRepo._store.get("c1")?.status).toBe("completed");
    });

    it("does nothing when no running jobs exist", async () => {
      const { service, jobRepo } = buildService();
      jobRepo._store.set("c1", makeJob({ id: "c1", status: "completed" }));

      await service.recoverInterruptedJobs();

      expect(jobRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("cancels queued and running jobs for the given transaction", async () => {
      const { service, jobRepo } = buildService();
      const j1 = makeJob({
        id: "j1",
        status: "queued",
        projectId: "p1",
        transactionId: "t1",
      });
      const j2 = makeJob({
        id: "j2",
        status: "running",
        projectId: "p1",
        transactionId: "t1",
      });
      const j3 = makeJob({
        id: "j3",
        status: "queued",
        projectId: "p1",
        transactionId: "t2",
      });
      jobRepo._store.set("j1", j1);
      jobRepo._store.set("j2", j2);
      jobRepo._store.set("j3", j3);

      const result = await service.cancel("p1", "t1");

      expect(result).toEqual({ ok: true });
      expect(jobRepo._store.get("j1")?.status).toBe("cancelled");
      expect(jobRepo._store.get("j2")?.status).toBe("cancelled");
      expect(jobRepo._store.get("j2")?.finishedAt).toBeInstanceOf(Date);
      // other transaction untouched
      expect(jobRepo._store.get("j3")?.status).toBe("queued");
    });

    it("cancels only matching caseId when provided", async () => {
      const { service, jobRepo } = buildService();
      const j1 = makeJob({
        id: "j1",
        status: "queued",
        projectId: "p1",
        transactionId: "t1",
        caseId: "case-a",
      });
      const j2 = makeJob({
        id: "j2",
        status: "queued",
        projectId: "p1",
        transactionId: "t1",
        caseId: "case-b",
      });
      jobRepo._store.set("j1", j1);
      jobRepo._store.set("j2", j2);

      await service.cancel("p1", "t1", "case-a");

      expect(jobRepo._store.get("j1")?.status).toBe("cancelled");
      expect(jobRepo._store.get("j2")?.status).toBe("queued");
    });

    it("returns ok when no active jobs exist", async () => {
      const { service } = buildService();
      const result = await service.cancel("p1", "t1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("getStatus", () => {
    it("returns phase 'none' when no job exists", async () => {
      const { service } = buildService();
      const status = await service.getStatus("p1", "t1");
      expect(status.phase).toBe("none");
      expect(status.jobId).toBe("");
    });

    it("returns queued status with queue position", async () => {
      const { service, jobRepo } = buildService();
      const j1 = makeJob({
        id: "j1",
        status: "queued",
        projectId: "p1",
        transactionId: "t1",
        queuedAt: new Date(1000),
      });
      const j2 = makeJob({
        id: "j2",
        status: "queued",
        projectId: "p2",
        transactionId: "t2",
        queuedAt: new Date(2000),
      });
      jobRepo._store.set("j1", j1);
      jobRepo._store.set("j2", j2);

      const status = await service.getStatus("p1", "t1");
      expect(status.phase).toBe("queued");
      expect(status.jobId).toBe("j1");
      expect(status.queuePosition).toBe(1);
      expect(status.globalQueuedCount).toBe(2);
    });

    it("returns completed status with result count", async () => {
      const { service, jobRepo } = buildService();
      const j1 = makeJob({
        id: "j1",
        status: "completed",
        projectId: "p1",
        transactionId: "t1",
        resultAssertions: [{ type: "status" }, { type: "header" }],
      });
      jobRepo._store.set("j1", j1);

      const status = await service.getStatus("p1", "t1");
      expect(status.phase).toBe("completed");
      expect(status.resultCount).toBe(2);
    });

    it("returns failed status with error message", async () => {
      const { service, jobRepo } = buildService();
      const j1 = makeJob({
        id: "j1",
        status: "failed",
        projectId: "p1",
        transactionId: "t1",
        errorMessage: "AI timeout",
      });
      jobRepo._store.set("j1", j1);

      const status = await service.getStatus("p1", "t1");
      expect(status.phase).toBe("failed");
      expect(status.errorMessage).toBe("AI timeout");
    });

    it("uses jobId to select the exact job", async () => {
      const { service, jobRepo } = buildService();
      jobRepo._store.set(
        "older",
        makeJob({
          id: "older",
          status: "completed",
          queuedAt: new Date(1000),
        }),
      );
      jobRepo._store.set(
        "newer",
        makeJob({ id: "newer", status: "failed", queuedAt: new Date(2000) }),
      );

      const status = await service.getStatus("p1", "t1", undefined, "older");

      expect(status.jobId).toBe("older");
      expect(status.phase).toBe("completed");
    });
  });

  describe("getResult", () => {
    it("returns assertions from completed job", async () => {
      const { service, jobRepo } = buildService();
      const assertions = [{ type: "status", operator: "eq", expected: 200 }];
      const j1 = makeJob({
        id: "j1",
        status: "completed",
        projectId: "p1",
        transactionId: "t1",
        resultAssertions: assertions,
      });
      jobRepo._store.set("j1", j1);

      const result = await service.getResult("p1", "t1");
      expect(result).toEqual({ assertions });
    });

    it("returns null when no completed job exists", async () => {
      const { service, jobRepo } = buildService();
      jobRepo._store.set(
        "j1",
        makeJob({
          id: "j1",
          status: "running",
          projectId: "p1",
          transactionId: "t1",
        }),
      );

      const result = await service.getResult("p1", "t1");
      expect(result).toBeNull();
    });

    it("returns null when completed job has no resultAssertions", async () => {
      const { service, jobRepo } = buildService();
      jobRepo._store.set(
        "j1",
        makeJob({
          id: "j1",
          status: "completed",
          projectId: "p1",
          transactionId: "t1",
          resultAssertions: null,
        }),
      );

      const result = await service.getResult("p1", "t1");
      expect(result).toBeNull();
    });
  });

  describe("pump", () => {
    it("claims queued jobs and transitions them to running", async () => {
      const { withCaseGenerateSlot } = jest.requireMock(
        "@case-editor/util/case-generate-concurrency",
      );
      let releaseSlot!: () => void;
      (withCaseGenerateSlot as jest.Mock).mockImplementationOnce(
        () => new Promise<void>((resolve) => (releaseSlot = resolve)),
      );
      const { service, jobRepo } = buildService();
      const j1 = makeJob({ id: "j1", status: "queued" });
      jobRepo._store.set("j1", j1);

      await service.pump();

      expect(jobRepo._store.get("j1")?.status).toBe("running");
      expect(jobRepo._store.get("j1")?.startedAt).toBeInstanceOf(Date);
      releaseSlot();
    });

    it("leaves jobs queued when all shared slots are occupied", async () => {
      const concurrency = jest.requireMock(
        "@case-editor/util/case-generate-concurrency",
      );
      concurrency.getCaseGenerateActiveCount.mockReturnValueOnce(2);
      concurrency.getCaseGenerateConcurrency.mockReturnValueOnce(2);
      const { service, jobRepo } = buildService();
      jobRepo._store.set("j1", makeJob({ id: "j1", status: "queued" }));

      await service.pump();

      expect(jobRepo._store.get("j1")?.status).toBe("queued");
    });

    it("does nothing when no queued jobs exist", async () => {
      const { service, jobRepo } = buildService();
      jobRepo._store.set("j1", makeJob({ id: "j1", status: "running" }));

      await service.pump();

      expect(jobRepo._store.get("j1")?.status).toBe("running");
    });
  });

  describe("runJob (via pump)", () => {
    it("completes job and stores assertions on success", async () => {
      const { service, jobRepo } = buildService();
      const assertions = [{ type: "status", operator: "eq", expected: 200 }];
      (generateAssertionsFromResponse as jest.Mock).mockResolvedValue(
        assertions,
      );

      const j1 = makeJob({ id: "j1", status: "queued", body: '{"key":"val"}' });
      jobRepo._store.set("j1", j1);

      await service.pump();
      // Wait for async runJob to finish
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const job = jobRepo._store.get("j1");
      expect(job?.status).toBe("completed");
      expect(job?.finishedAt).toBeInstanceOf(Date);
      expect(job?.resultAssertions).toEqual(assertions);
    });

    it("marks job as failed when generateAssertionsFromResponse throws", async () => {
      const { service, jobRepo } = buildService();
      (generateAssertionsFromResponse as jest.Mock).mockRejectedValue(
        new Error("AI service down"),
      );

      const j1 = makeJob({ id: "j1", status: "queued", body: "{}" });
      jobRepo._store.set("j1", j1);

      await service.pump();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const job = jobRepo._store.get("j1");
      expect(job?.status).toBe("failed");
      expect(job?.errorMessage).toBe("AI service down");
    });

    it("skips cancelled job during runJob", async () => {
      const { service, jobRepo } = buildService();
      let finishAi!: (value: unknown[]) => void;
      (generateAssertionsFromResponse as jest.Mock).mockImplementationOnce(
        () => new Promise((resolve) => (finishAi = resolve)),
      );
      const j1 = makeJob({ id: "j1", status: "queued", body: "{}" });
      jobRepo._store.set("j1", j1);

      await service.pump();
      await new Promise((resolve) => setImmediate(resolve));
      jobRepo._store.get("j1")!.status = "cancelled";
      finishAi([{ type: "status", operator: "eq", expected: 200 }]);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const job = jobRepo._store.get("j1");
      expect(job?.status).toBe("cancelled");
      expect(job?.resultAssertions).toBeNull();
    });
  });

  describe("concurrency slot", () => {
    it("runJob is wrapped in withCaseGenerateSlot", async () => {
      const { withCaseGenerateSlot } = jest.requireMock(
        "@case-editor/util/case-generate-concurrency",
      );
      (withCaseGenerateSlot as jest.Mock).mockClear();

      const { service, jobRepo } = buildService();
      jobRepo._store.set(
        "j1",
        makeJob({ id: "j1", status: "queued", body: "{}" }),
      );

      await service.pump();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(withCaseGenerateSlot).toHaveBeenCalled();
    });
  });
});
