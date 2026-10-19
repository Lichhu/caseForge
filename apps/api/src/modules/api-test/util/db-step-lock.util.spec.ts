import { BadRequestException } from "@nestjs/common";
import {
  createDbStepLockSession,
  getDbStepLockState,
  resetDbStepLocksForTest,
  withDbStepLock,
} from "./db-step-lock.util";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("SQL 步骤占位锁", () => {
  beforeEach(() => resetDbStepLocksForTest());
  afterEach(() => resetDbStepLocksForTest());

  it("同一资源名串行：后到的案例要等前一个释放", async () => {
    const order: string[] = [];
    const first = withDbStepLock({ key: "db-1", label: "库一" }, async () => {
      order.push("first-start");
      await sleep(30);
      order.push("first-end");
    });
    await sleep(5);
    const second = withDbStepLock({ key: "db-1", label: "库一" }, async () => {
      order.push("second-start");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("不同资源名可以并行", async () => {
    const order: string[] = [];
    const slow = withDbStepLock({ key: "db-1" }, async () => {
      await sleep(30);
      order.push("slow");
    });
    const fast = withDbStepLock({ key: "db-2" }, async () => {
      order.push("fast");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["fast", "slow"]);
  });

  it("排队等待超时直接报错，不无限等", async () => {
    const held = withDbStepLock({ key: "db-1", label: "库一" }, async () => {
      await sleep(80);
    });
    await sleep(5);
    await expect(
      withDbStepLock({ key: "db-1", label: "库一" }, async () => undefined, {
        waitTimeoutMs: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await held;
    expect(getDbStepLockState()).toEqual([]);
  });

  it("持有超时后自动释放，避免锁死", async () => {
    await withDbStepLock(
      { key: "db-1" },
      async () => {
        await sleep(60);
      },
      { holdTimeoutMs: 15 },
    );
    expect(getDbStepLockState()).toEqual([]);
  });

  it("案例会话一次性占住案例里的所有连接，重复 acquire 不重复占位", async () => {
    const session = createDbStepLockSession();
    await session.acquire([
      { key: "db-1", label: "库一" },
      { key: "db-2", label: "库二" },
    ]);
    await session.acquire([{ key: "db-1", label: "库一" }]);
    expect(
      getDbStepLockState()
        .map((item) => item.key)
        .sort(),
    ).toEqual(["db-1", "db-2"]);
    await session.release();
    expect(getDbStepLockState()).toEqual([]);
  });

  it("重复释放不会误放别人的占位", async () => {
    const session = createDbStepLockSession();
    await session.acquire([{ key: "db-1", label: "库一" }]);
    await session.release();
    await session.release();
    const next = withDbStepLock({ key: "db-1" }, async () => "done");
    await expect(next).resolves.toBe("done");
    expect(getDbStepLockState()).toEqual([]);
  });

  it("抢多个资源时其中一个等待超时，已抢到的要回滚释放", async () => {
    const held = withDbStepLock({ key: "db-2", label: "库二" }, async () => {
      await sleep(80);
    });
    await sleep(5);
    const session = createDbStepLockSession({ waitTimeoutMs: 20 });
    await expect(
      session.acquire([
        { key: "db-1", label: "库一" },
        { key: "db-2", label: "库二" },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getDbStepLockState().map((item) => item.key)).toEqual(["db-2"]);
    await held;
  });
});
