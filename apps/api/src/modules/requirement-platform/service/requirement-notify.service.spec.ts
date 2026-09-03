import { RequirementNotifyService } from "@requirement-platform/service/requirement-notify.service";
import type { ApiRequirementEntity } from "@requirement-platform/entity/api-requirement.entity";
import type { ApiRequirementDispatcherEntity } from "@requirement-platform/entity/api-requirement-dispatcher.entity";
import type { NotifyMessageEntity } from "@common/notify/entity/notify-message.entity";
import type { EnqueueNotifyMessageInput } from "@common/notify/service/notify-message.service";

/**
 * RequirementNotifyService 消息入队测试：
 * 需求分发/认领/拒绝/超期提醒都只写 notify_message（默认未发送），推送由轮询任务负责。
 */
function createRequirementRepoMock() {
  return {
    find: jest.fn(async (): Promise<ApiRequirementEntity[]> => []),
    update: jest.fn(
      async (
        _criteria: Record<string, unknown>,
        _partial: Record<string, unknown>,
      ): Promise<{ affected: number }> => ({ affected: 1 }),
    ),
  };
}

function createDispatcherRepoMock() {
  return {
    find: jest.fn(async (): Promise<ApiRequirementDispatcherEntity[]> => []),
  };
}

function createMessageServiceMock() {
  return {
    enqueue: jest.fn(
      async (_input: EnqueueNotifyMessageInput): Promise<NotifyMessageEntity> =>
        ({}) as NotifyMessageEntity,
    ),
  };
}

function createConfigMock() {
  return {
    get: jest.fn(() => ({
      enabled: false,
      portalBaseUrl: "http://localhost:33550",
      overdueScanIntervalMs: 0,
      overdueThresholdMs: 24 * 60 * 60 * 1000,
      concurrency: 3,
    })),
  };
}

function buildService() {
  const requirementRepo = createRequirementRepoMock();
  const dispatcherRepo = createDispatcherRepoMock();
  const messageService = createMessageServiceMock();
  const service = new RequirementNotifyService(
    requirementRepo as never,
    dispatcherRepo as never,
    messageService as never,
    createConfigMock() as never,
  );
  return { service, requirementRepo, dispatcherRepo, messageService };
}

function requirement(
  overrides: Partial<ApiRequirementEntity> = {},
): ApiRequirementEntity {
  return {
    id: "req-1",
    projectCode: "XQ2026-0001",
    projectName: "对公账户开户审批流程改造",
    status: "pending_claim",
    ...overrides,
  } as ApiRequirementEntity;
}

/** 取入队参数，便于断言场景/收件人/正文 */
function enqueueInput(mock: ReturnType<typeof createMessageServiceMock>) {
  return mock.enqueue.mock.calls[0]?.[0];
}

describe("RequirementNotifyService 事件通知", () => {
  it("分发后给被分发人写入未发送消息，含需求编号与专属访问链接", () => {
    const { service, messageService } = buildService();
    service.notifyDispatched(
      requirement({ dispatchedTo: "zhangsan", dispatchedBy: "boss" }),
    );

    expect(enqueueInput(messageService)).toMatchObject({
      scene: "requirement.dispatched",
      bizType: "api_requirement",
      bizId: "req-1",
      receiver: "zhangsan",
    });
    const content = enqueueInput(messageService)?.content as string;
    expect(content).toContain("XQ2026-0001");
    expect(content).toContain("userName=zhangsan");
  });

  it("没有分发对象时不写入消息", () => {
    const { service, messageService } = buildService();
    service.notifyDispatched(requirement({ dispatchedTo: null }));
    expect(messageService.enqueue).not.toHaveBeenCalled();
  });

  it("认领后通知分发人，内容含认领人姓名", () => {
    const { service, messageService } = buildService();
    service.notifyClaimed(
      requirement({
        status: "claimed",
        dispatchedBy: "boss",
        claimedBy: "zhangsan",
        claimedByName: "张三",
      }),
    );

    expect(enqueueInput(messageService)).toMatchObject({
      scene: "requirement.claimed",
      receiver: "boss",
    });
    expect(enqueueInput(messageService)?.content).toContain("张三");
  });

  it("拒绝后通知分发人并带上拒绝原因", () => {
    const { service, messageService } = buildService();
    service.notifyRefused(requirement(), "boss", "张三", "不在本人负责范围");

    expect(enqueueInput(messageService)).toMatchObject({
      scene: "requirement.refused",
      receiver: "boss",
    });
    expect(enqueueInput(messageService)?.content).toContain("不在本人负责范围");
  });

  it("没有分发人时拒绝通知不写入消息", () => {
    const { service, messageService } = buildService();
    service.notifyRefused(requirement(), "", "张三");
    expect(messageService.enqueue).not.toHaveBeenCalled();
  });

  it("消息入队失败只记日志，不影响业务流程", async () => {
    const { service, messageService } = buildService();
    messageService.enqueue.mockRejectedValue(new Error("db down"));

    expect(() =>
      service.notifyDispatched(requirement({ dispatchedTo: "zhangsan" })),
    ).not.toThrow();
    // 等待 fire-and-forget 的入队异常被捕获
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("RequirementNotifyService 超期提醒", () => {
  it("给每个分发人各写入一条汇总提醒，并回写 overdueNotifiedAt", async () => {
    const { service, requirementRepo, dispatcherRepo, messageService } =
      buildService();
    requirementRepo.find.mockResolvedValue([
      requirement({ id: "req-1", status: "pending_dispatch" }),
      requirement({ id: "req-2", status: "pending_dispatch" }),
    ]);
    dispatcherRepo.find.mockResolvedValue([
      { userName: "boss1" },
      { userName: "boss2" },
    ] as ApiRequirementDispatcherEntity[]);

    await service.scanOverdue();

    expect(messageService.enqueue).toHaveBeenCalledTimes(2);
    const receivers = messageService.enqueue.mock.calls.map(
      (call) => call[0].receiver,
    );
    expect(receivers).toEqual(["boss1", "boss2"]);
    expect(messageService.enqueue.mock.calls[0]?.[0]).toMatchObject({
      scene: "requirement.overdue",
      bizId: null,
    });
    expect(messageService.enqueue.mock.calls[0]?.[0]?.content).toContain(
      "2 条",
    );
    expect(requirementRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ overdueNotifiedAt: expect.any(Date) }),
    );
  });

  it("分发人白名单为空时不写入消息也不回写标记", async () => {
    const { service, requirementRepo, dispatcherRepo, messageService } =
      buildService();
    requirementRepo.find.mockResolvedValue([
      requirement({ status: "pending_dispatch" }),
    ]);
    dispatcherRepo.find.mockResolvedValue([]);

    await service.scanOverdue();

    expect(messageService.enqueue).not.toHaveBeenCalled();
    expect(requirementRepo.update).not.toHaveBeenCalled();
  });

  it("没有超期需求时不查询分发人白名单", async () => {
    const { service, requirementRepo, dispatcherRepo } = buildService();
    requirementRepo.find.mockResolvedValue([]);

    await service.scanOverdue();

    expect(dispatcherRepo.find).not.toHaveBeenCalled();
  });
});
