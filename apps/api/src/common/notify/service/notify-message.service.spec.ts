import { NotifyMessageService } from "@common/notify/service/notify-message.service";
import type { NotifyMessageEntity } from "@common/notify/entity/notify-message.entity";

/**
 * NotifyMessageService 消息落库与轮询推送测试：
 * 覆盖「默认未发送 → 推送成功置 sent → 失败退避重试 → 超限置 failed」的完整状态流转。
 */
function createMessageRepoMock() {
  return {
    create: jest.fn((entity: Record<string, unknown>) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => ({
      id: "msg-1",
      ...entity,
    })),
    find: jest.fn(
      async (
        _options?: Record<string, unknown>,
      ): Promise<NotifyMessageEntity[]> => [],
    ),
    update: jest.fn(
      async (
        _criteria: Record<string, unknown>,
        _partial: Record<string, unknown>,
      ): Promise<{ affected: number }> => ({ affected: 1 }),
    ),
  };
}

function createOcuPushMock() {
  return { sendToUser: jest.fn(async () => undefined) };
}

function createConfigMock(
  notify?: Partial<{ batchSize: number; maxRetry: number }>,
) {
  return {
    get: jest.fn((key: string) => {
      if (key === "notify") {
        return {
          scanIntervalMs: 0,
          batchSize: notify?.batchSize ?? 50,
          maxRetry: notify?.maxRetry ?? 3,
        };
      }
      return { concurrency: 3 };
    }),
  };
}

function buildService(options?: { batchSize?: number; maxRetry?: number }) {
  const messageRepo = createMessageRepoMock();
  const ocuPush = createOcuPushMock();
  const config = createConfigMock(options);
  const service = new NotifyMessageService(
    messageRepo as never,
    ocuPush as never,
    config as never,
  );
  return { service, messageRepo, ocuPush };
}

function pendingMessage(overrides: Partial<NotifyMessageEntity> = {}) {
  return {
    id: "msg-1",
    scene: "requirement.dispatched",
    bizType: "api_requirement",
    bizId: "req-1",
    receiver: "zhangsan",
    content: "【需求分发通知】请及时认领",
    status: "pending",
    retryCount: 0,
    maxRetry: 3,
    nextRetryAt: null,
    ...overrides,
  } as NotifyMessageEntity;
}

/** 取每次 repo.update 的更新内容（[0] 为占用，[1] 为结果落库） */
function updatePayloads(repo: ReturnType<typeof createMessageRepoMock>) {
  return repo.update.mock.calls.map((call) => call[1]);
}

describe("NotifyMessageService 消息落库", () => {
  it("enqueue 写入的消息默认未发送，并带上配置的最大重试次数", async () => {
    const { service, messageRepo } = buildService({ maxRetry: 5 });
    await service.enqueue({
      scene: "requirement.claimed",
      bizType: "api_requirement",
      bizId: "req-1",
      receiver: "lisi",
      content: "【需求认领通知】",
    });

    const created = messageRepo.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      scene: "requirement.claimed",
      receiver: "lisi",
      status: "pending",
      retryCount: 0,
      maxRetry: 5,
      nextRetryAt: null,
    });
    expect(messageRepo.save).toHaveBeenCalledTimes(1);
  });

  it("enqueue 未传业务对象时 bizType/bizId 落库为 null", async () => {
    const { service, messageRepo } = buildService();
    await service.enqueue({
      scene: "requirement.overdue",
      receiver: "boss",
      content: "超期提醒",
    });

    expect(messageRepo.create.mock.calls[0]?.[0]).toMatchObject({
      bizType: null,
      bizId: null,
    });
  });
});

describe("NotifyMessageService 轮询推送", () => {
  it("没有未发送消息时不调用推送接口", async () => {
    const { service, ocuPush, messageRepo } = buildService();
    await service.pump();
    expect(messageRepo.find).toHaveBeenCalledTimes(1);
    expect(ocuPush.sendToUser).not.toHaveBeenCalled();
  });

  it("推送成功后消息置为 sent 并记录发送时间", async () => {
    const { service, messageRepo, ocuPush } = buildService();
    messageRepo.find.mockResolvedValue([pendingMessage()]);

    await service.pump();

    expect(ocuPush.sendToUser).toHaveBeenCalledWith(
      "zhangsan",
      "【需求分发通知】请及时认领",
    );
    // 第一次 update 为占用（pending → sending），第二次为结果落库
    expect(updatePayloads(messageRepo)[0]).toMatchObject({ status: "sending" });
    expect(updatePayloads(messageRepo)[1]).toMatchObject({
      status: "sent",
      lastError: null,
    });
    expect(updatePayloads(messageRepo)[1].sentAt).toBeInstanceOf(Date);
  });

  it("消息已被其他轮次占用时不重复推送", async () => {
    const { service, messageRepo, ocuPush } = buildService();
    messageRepo.find.mockResolvedValue([pendingMessage()]);
    messageRepo.update.mockResolvedValue({ affected: 0 });

    await service.pump();

    expect(ocuPush.sendToUser).not.toHaveBeenCalled();
    expect(messageRepo.update).toHaveBeenCalledTimes(1);
  });

  it("推送失败未超重试上限：退回未发送并按退避阶梯安排下次发送", async () => {
    const { service, messageRepo, ocuPush } = buildService();
    messageRepo.find.mockResolvedValue([pendingMessage({ retryCount: 0 })]);
    ocuPush.sendToUser.mockRejectedValue(new Error("OCU 推送接口返回 500"));

    const before = Date.now();
    await service.pump();

    const payload = updatePayloads(messageRepo)[1];
    expect(payload).toMatchObject({
      status: "pending",
      retryCount: 1,
      lastError: "OCU 推送接口返回 500",
    });
    const nextRetryAt = payload.nextRetryAt as Date;
    expect(nextRetryAt.getTime() - before).toBeGreaterThanOrEqual(60_000);
    expect(nextRetryAt.getTime() - before).toBeLessThan(61_000);
  });

  it("重试达到上限：置为 failed 且不再安排重试", async () => {
    const { service, messageRepo, ocuPush } = buildService({ maxRetry: 3 });
    messageRepo.find.mockResolvedValue([pendingMessage({ retryCount: 2 })]);
    ocuPush.sendToUser.mockRejectedValue(new Error("timeout"));

    await service.pump();

    expect(updatePayloads(messageRepo)[1]).toMatchObject({
      status: "failed",
      retryCount: 3,
      nextRetryAt: null,
      lastError: "timeout",
    });
  });

  it("单轮取满 batchSize 时继续排空剩余积压", async () => {
    const { service, messageRepo } = buildService({ batchSize: 1 });
    messageRepo.find
      .mockResolvedValueOnce([pendingMessage()])
      .mockResolvedValueOnce([]);

    await service.pump();

    expect(messageRepo.find).toHaveBeenCalledTimes(2);
  });

  it("batchSize 配成 0 时兜底按 1 条处理，不会陷入排空死循环", async () => {
    const { service, messageRepo } = buildService({ batchSize: 0 });
    messageRepo.find
      .mockResolvedValueOnce([pendingMessage()])
      .mockResolvedValue([]);

    await service.pump();

    expect(messageRepo.find.mock.calls[0]?.[0]).toMatchObject({ take: 1 });
    expect(messageRepo.find).toHaveBeenCalledTimes(2);
  });

  it("轮询进行中时再次触发不会重复拉取消息", async () => {
    const { service, messageRepo } = buildService();
    const first = service.pump();
    const second = service.pump();
    await Promise.all([first, second]);

    expect(messageRepo.find).toHaveBeenCalledTimes(1);
  });
});

describe("NotifyMessageService 重启恢复", () => {
  it("残留 sending 的消息退回未发送，避免消息丢失", async () => {
    const { service, messageRepo } = buildService();
    await service.recoverInterrupted();

    expect(messageRepo.update).toHaveBeenCalledWith(
      { status: "sending" },
      expect.objectContaining({ status: "pending", nextRetryAt: null }),
    );
  });
});
